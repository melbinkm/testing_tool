/**
 * Run Manifest Manager
 * Manages pentest run manifests with scope tracking and versioning
 */

import { createHash, randomUUID } from 'crypto';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { dirname, join } from 'path';
import {
  RunManifest,
  CreateManifestOptions,
  ManifestQueryResult,
  Environment,
  MANIFEST_SCHEMA_VERSION,
  ManifestNotFoundError,
  AuditError,
} from './types.js';

const DEFAULT_EVIDENCE_DIR = process.env.EVIDENCE_DIR || './evidence';

export class RunManifestManager {
  private evidenceDir: string;
  private manifests: Map<string, RunManifest> = new Map();

  constructor(evidenceDir: string = DEFAULT_EVIDENCE_DIR) {
    this.evidenceDir = evidenceDir;
  }

  /**
   * Generate a unique run ID
   */
  generateRunId(): string {
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').split('.')[0];
    const random = randomUUID().split('-')[0];
    return `run-${timestamp}-${random}`;
  }

  /**
   * Calculate SHA-256 hash of content
   */
  hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Read scope file and calculate hash
   */
  async hashScopeFile(scopeFile: string): Promise<string> {
    try {
      const content = await readFile(scopeFile, 'utf-8');
      return this.hashContent(content);
    } catch (error) {
      throw new AuditError(
        `Failed to read scope file: ${scopeFile}`,
        'SCOPE_FILE_ERROR',
        { scopeFile, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Create a new run manifest
   */
  async createManifest(options: CreateManifestOptions): Promise<RunManifest> {
    const runId = this.generateRunId();
    const now = new Date().toISOString();

    // Calculate scope hash
    let scopeHash: string;
    if (options.scope_content) {
      scopeHash = this.hashContent(options.scope_content);
    } else if (options.scope_file) {
      scopeHash = await this.hashScopeFile(options.scope_file);
    } else {
      scopeHash = this.hashContent('no-scope-defined');
    }

    const manifest: RunManifest = {
      schema_version: MANIFEST_SCHEMA_VERSION,
      engagement_id: options.engagement_id,
      run_id: runId,
      started_at: now,
      scope_hash: scopeHash,
      scope_file: options.scope_file,
      environment: options.environment || 'SANDBOX',
      operator: options.operator,
      tool_versions: options.tool_versions || {},
      tags: options.tags,
      notes: options.notes,
    };

    // Cache in memory
    this.manifests.set(runId, manifest);

    // Persist to disk
    await this.saveManifest(manifest);

    return manifest;
  }

  /**
   * End a run (set ended_at timestamp)
   */
  async endRun(runId: string): Promise<RunManifest> {
    const manifest = await this.getManifest(runId);
    if (!manifest) {
      throw new ManifestNotFoundError(runId);
    }

    manifest.ended_at = new Date().toISOString();
    this.manifests.set(runId, manifest);
    await this.saveManifest(manifest);

    return manifest;
  }

  /**
   * Get manifest by run ID
   */
  async getManifest(runId: string): Promise<RunManifest | null> {
    // Check cache first
    if (this.manifests.has(runId)) {
      return this.manifests.get(runId)!;
    }

    // Try to load from disk
    try {
      const manifest = await this.loadManifest(runId);
      if (manifest) {
        this.manifests.set(runId, manifest);
      }
      return manifest;
    } catch {
      return null;
    }
  }

  /**
   * Query for manifest
   */
  async queryManifest(runId: string): Promise<ManifestQueryResult> {
    const manifest = await this.getManifest(runId);
    return {
      manifest,
      found: manifest !== null,
    };
  }

  /**
   * Update manifest metadata
   */
  async updateManifest(
    runId: string,
    updates: Partial<Pick<RunManifest, 'notes' | 'tags' | 'tool_versions'>>
  ): Promise<RunManifest> {
    const manifest = await this.getManifest(runId);
    if (!manifest) {
      throw new ManifestNotFoundError(runId);
    }

    if (updates.notes !== undefined) {
      manifest.notes = updates.notes;
    }
    if (updates.tags !== undefined) {
      manifest.tags = updates.tags;
    }
    if (updates.tool_versions !== undefined) {
      manifest.tool_versions = { ...manifest.tool_versions, ...updates.tool_versions };
    }

    this.manifests.set(runId, manifest);
    await this.saveManifest(manifest);

    return manifest;
  }

  /**
   * Verify scope hash matches
   */
  async verifyScopeHash(runId: string, scopeFile: string): Promise<boolean> {
    const manifest = await this.getManifest(runId);
    if (!manifest) {
      throw new ManifestNotFoundError(runId);
    }

    const currentHash = await this.hashScopeFile(scopeFile);
    return manifest.scope_hash === currentHash;
  }

  /**
   * Get manifest file path
   */
  private getManifestPath(runId: string): string {
    return join(this.evidenceDir, runId, 'manifest.json');
  }

  /**
   * Save manifest to disk
   */
  private async saveManifest(manifest: RunManifest): Promise<void> {
    const filePath = this.getManifestPath(manifest.run_id);
    const dirPath = dirname(filePath);

    // Ensure directory exists
    await mkdir(dirPath, { recursive: true });

    // Write manifest
    await writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * Load manifest from disk
   */
  private async loadManifest(runId: string): Promise<RunManifest | null> {
    const filePath = this.getManifestPath(runId);

    try {
      await access(filePath);
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as RunManifest;
    } catch {
      return null;
    }
  }

  /**
   * List all runs in evidence directory
   */
  async listRuns(): Promise<string[]> {
    return Array.from(this.manifests.keys());
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
    this.manifests.clear();
  }
}

// Export a default instance
export const runManifestManager = new RunManifestManager();
