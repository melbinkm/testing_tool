/**
 * Action Ledger
 * JSONL-based append-only ledger for tracking pentest actions
 */

import { createHash, randomUUID } from 'crypto';
import { readFile, writeFile, appendFile, mkdir, access } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import {
  ActionLedgerEntry,
  RecordActionOptions,
  UpdateActionOptions,
  LedgerQueryOptions,
  LedgerQueryResult,
  ActionStatus,
  LEDGER_SCHEMA_VERSION,
  ActionNotFoundError,
  AuditError,
} from './types.js';

const DEFAULT_EVIDENCE_DIR = process.env.EVIDENCE_DIR || './evidence';

export class ActionLedger {
  private evidenceDir: string;
  private entriesCache: Map<string, ActionLedgerEntry> = new Map();

  constructor(evidenceDir: string = DEFAULT_EVIDENCE_DIR) {
    this.evidenceDir = evidenceDir;
  }

  /**
   * Generate a unique action ID
   */
  generateActionId(): string {
    return `action-${randomUUID()}`;
  }

  /**
   * Calculate SHA-256 hash of content
   */
  hashContent(content: string | Record<string, unknown>): string {
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    return createHash('sha256').update(str).digest('hex');
  }

  /**
   * Record a new action (proposed status)
   */
  async recordAction(options: RecordActionOptions): Promise<ActionLedgerEntry> {
    const actionId = this.generateActionId();
    const now = new Date().toISOString();

    const entry: ActionLedgerEntry = {
      schema_version: LEDGER_SCHEMA_VERSION,
      action_id: actionId,
      run_id: options.run_id,
      hypothesis_id: options.hypothesis_id,
      tool_name: options.tool_name,
      tool_params: options.tool_params,
      status: 'proposed',
      requested_at: now,
      correlation_ids: options.correlation_ids,
    };

    // Cache entry
    this.entriesCache.set(actionId, entry);

    // Append to ledger file
    await this.appendEntry(options.run_id, entry);

    return entry;
  }

  /**
   * Update action status
   */
  async updateAction(
    actionId: string,
    runId: string,
    updates: UpdateActionOptions
  ): Promise<ActionLedgerEntry> {
    // Get current entry
    let entry = this.entriesCache.get(actionId);
    if (!entry) {
      // Try to find in ledger file
      const entries = await this.readLedger(runId);
      entry = entries.find(e => e.action_id === actionId);
      if (!entry) {
        throw new ActionNotFoundError(actionId);
      }
    }

    // Update fields
    const now = new Date().toISOString();
    const updatedEntry: ActionLedgerEntry = {
      ...entry,
      status: updates.status,
      request_hash: updates.request_hash ?? entry.request_hash,
      response_hash: updates.response_hash ?? entry.response_hash,
      duration_ms: updates.duration_ms ?? entry.duration_ms,
      error: updates.error ?? entry.error,
      metadata: updates.metadata ? { ...entry.metadata, ...updates.metadata } : entry.metadata,
    };

    // Set execution/completion timestamps based on status
    if (updates.status === 'executed' || updates.status === 'failed') {
      updatedEntry.executed_at = updatedEntry.executed_at || now;
      updatedEntry.completed_at = now;
    } else if (updates.status === 'approved') {
      updatedEntry.executed_at = now;
    }

    // Update cache
    this.entriesCache.set(actionId, updatedEntry);

    // Append update to ledger
    await this.appendEntry(runId, updatedEntry);

    return updatedEntry;
  }

  /**
   * Get action by ID
   */
  async getAction(actionId: string, runId: string): Promise<ActionLedgerEntry | null> {
    // Check cache
    if (this.entriesCache.has(actionId)) {
      return this.entriesCache.get(actionId)!;
    }

    // Read from ledger
    const entries = await this.readLedger(runId);
    const entry = entries.find(e => e.action_id === actionId);
    if (entry) {
      this.entriesCache.set(actionId, entry);
    }
    return entry || null;
  }

  /**
   * Query actions with filters
   */
  async queryActions(options: LedgerQueryOptions): Promise<LedgerQueryResult> {
    if (!options.run_id) {
      return { entries: [], total_count: 0, has_more: false };
    }

    let entries = await this.readLedger(options.run_id);

    // Apply filters
    if (options.tool_name) {
      entries = entries.filter(e => e.tool_name === options.tool_name);
    }

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      entries = entries.filter(e => statuses.includes(e.status));
    }

    if (options.hypothesis_id) {
      entries = entries.filter(e => e.hypothesis_id === options.hypothesis_id);
    }

    if (options.from_time) {
      const fromTime = new Date(options.from_time).getTime();
      entries = entries.filter(e => new Date(e.requested_at).getTime() >= fromTime);
    }

    if (options.to_time) {
      const toTime = new Date(options.to_time).getTime();
      entries = entries.filter(e => new Date(e.requested_at).getTime() <= toTime);
    }

    // Deduplicate by action_id (keep latest version)
    const deduped = new Map<string, ActionLedgerEntry>();
    for (const entry of entries) {
      deduped.set(entry.action_id, entry);
    }
    entries = Array.from(deduped.values());

    // Sort by requested_at (newest first)
    entries.sort((a, b) =>
      new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
    );

    const totalCount = entries.length;

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    entries = entries.slice(offset, offset + limit);

    return {
      entries,
      total_count: totalCount,
      has_more: offset + entries.length < totalCount,
    };
  }

  /**
   * Get action statistics for a run
   */
  async getRunStats(runId: string): Promise<{
    total: number;
    by_status: Record<ActionStatus, number>;
    by_tool: Record<string, number>;
    avg_duration_ms: number | null;
  }> {
    const entries = await this.readLedger(runId);

    // Deduplicate by action_id (keep latest version)
    const deduped = new Map<string, ActionLedgerEntry>();
    for (const entry of entries) {
      deduped.set(entry.action_id, entry);
    }
    const uniqueEntries = Array.from(deduped.values());

    const byStatus: Record<ActionStatus, number> = {
      proposed: 0,
      approved: 0,
      blocked: 0,
      executed: 0,
      failed: 0,
    };

    const byTool: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;

    for (const entry of uniqueEntries) {
      byStatus[entry.status]++;

      byTool[entry.tool_name] = (byTool[entry.tool_name] || 0) + 1;

      if (entry.duration_ms !== undefined) {
        totalDuration += entry.duration_ms;
        durationCount++;
      }
    }

    return {
      total: uniqueEntries.length,
      by_status: byStatus,
      by_tool: byTool,
      avg_duration_ms: durationCount > 0 ? totalDuration / durationCount : null,
    };
  }

  /**
   * Get ledger file path
   */
  private getLedgerPath(runId: string): string {
    return join(this.evidenceDir, runId, 'actions.jsonl');
  }

  /**
   * Append entry to ledger file (JSONL format)
   */
  private async appendEntry(runId: string, entry: ActionLedgerEntry): Promise<void> {
    const filePath = this.getLedgerPath(runId);
    const dirPath = dirname(filePath);

    // Ensure directory exists
    await mkdir(dirPath, { recursive: true });

    // Append as JSONL
    const line = JSON.stringify(entry) + '\n';
    await appendFile(filePath, line, 'utf-8');
  }

  /**
   * Read all entries from ledger file
   */
  private async readLedger(runId: string): Promise<ActionLedgerEntry[]> {
    const filePath = this.getLedgerPath(runId);

    try {
      await access(filePath);
    } catch {
      return [];
    }

    return new Promise((resolve, reject) => {
      const entries: ActionLedgerEntry[] = [];
      const stream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        if (line.trim()) {
          try {
            entries.push(JSON.parse(line) as ActionLedgerEntry);
          } catch {
            // Skip invalid lines
          }
        }
      });

      rl.on('close', () => resolve(entries));
      rl.on('error', reject);
    });
  }

  /**
   * Verify ledger integrity (check for gaps, invalid entries)
   */
  async verifyIntegrity(runId: string): Promise<{
    valid: boolean;
    issues: string[];
    entry_count: number;
  }> {
    const entries = await this.readLedger(runId);
    const issues: string[] = [];

    // Check each entry has required fields
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      if (!entry.schema_version) {
        issues.push(`Entry ${i}: missing schema_version`);
      }
      if (!entry.action_id) {
        issues.push(`Entry ${i}: missing action_id`);
      }
      if (!entry.run_id) {
        issues.push(`Entry ${i}: missing run_id`);
      }
      if (!entry.tool_name) {
        issues.push(`Entry ${i}: missing tool_name`);
      }
      if (!entry.status) {
        issues.push(`Entry ${i}: missing status`);
      }
      if (!entry.requested_at) {
        issues.push(`Entry ${i}: missing requested_at`);
      }

      // Check run_id matches
      if (entry.run_id !== runId) {
        issues.push(`Entry ${i}: run_id mismatch (expected ${runId}, got ${entry.run_id})`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      entry_count: entries.length,
    };
  }

  /**
   * Get evidence directory path
   */
  getEvidenceDir(): string {
    return this.evidenceDir;
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.entriesCache.clear();
  }
}

// Export a default instance
export const actionLedger = new ActionLedger();
