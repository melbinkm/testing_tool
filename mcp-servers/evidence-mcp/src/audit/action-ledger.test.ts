import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActionLedger } from './action-ledger.js';
import { LEDGER_SCHEMA_VERSION, ActionNotFoundError } from './types.js';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('ActionLedger', () => {
  let ledger: ActionLedger;
  let testDir: string;
  const testRunId = 'run-test-12345678';

  beforeEach(async () => {
    testDir = join(tmpdir(), `action-ledger-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    ledger = new ActionLedger(testDir);
  });

  afterEach(async () => {
    ledger.clearCache();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generateActionId', () => {
    it('should generate unique action IDs', () => {
      const id1 = ledger.generateActionId();
      const id2 = ledger.generateActionId();

      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with correct prefix', () => {
      const id = ledger.generateActionId();
      expect(id.startsWith('action-')).toBe(true);
    });
  });

  describe('hashContent', () => {
    it('should hash string content', () => {
      const hash = ledger.hashContent('test content');
      expect(hash.length).toBe(64);
    });

    it('should hash object content', () => {
      const hash = ledger.hashContent({ key: 'value' });
      expect(hash.length).toBe(64);
    });

    it('should return consistent hash', () => {
      const hash1 = ledger.hashContent({ key: 'value' });
      const hash2 = ledger.hashContent({ key: 'value' });
      expect(hash1).toBe(hash2);
    });
  });

  describe('recordAction', () => {
    it('should record action with required fields', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      expect(entry.schema_version).toBe(LEDGER_SCHEMA_VERSION);
      expect(entry.action_id).toBeDefined();
      expect(entry.run_id).toBe(testRunId);
      expect(entry.tool_name).toBe('nuclei_scan');
      expect(entry.status).toBe('proposed');
      expect(entry.requested_at).toBeDefined();
    });

    it('should record action with optional fields', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
        tool_params: { target: 'https://example.com' },
        hypothesis_id: 'H-001',
        correlation_ids: { request_id: 'req-123' },
      });

      expect(entry.tool_params).toEqual({ target: 'https://example.com' });
      expect(entry.hypothesis_id).toBe('H-001');
      expect(entry.correlation_ids).toEqual({ request_id: 'req-123' });
    });

    it('should persist action to ledger file', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      ledger.clearCache();
      const loaded = await ledger.getAction(entry.action_id, testRunId);

      expect(loaded).not.toBeNull();
      expect(loaded?.tool_name).toBe('nuclei_scan');
    });
  });

  describe('updateAction', () => {
    it('should update status to approved', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      const updated = await ledger.updateAction(entry.action_id, testRunId, {
        status: 'approved',
      });

      expect(updated.status).toBe('approved');
      expect(updated.executed_at).toBeDefined();
    });

    it('should update status to executed with timestamps', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      const updated = await ledger.updateAction(entry.action_id, testRunId, {
        status: 'executed',
        duration_ms: 1000,
        request_hash: 'abc123',
        response_hash: 'def456',
      });

      expect(updated.status).toBe('executed');
      expect(updated.executed_at).toBeDefined();
      expect(updated.completed_at).toBeDefined();
      expect(updated.duration_ms).toBe(1000);
      expect(updated.request_hash).toBe('abc123');
      expect(updated.response_hash).toBe('def456');
    });

    it('should update status to failed with error', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      const updated = await ledger.updateAction(entry.action_id, testRunId, {
        status: 'failed',
        error: 'Connection timeout',
      });

      expect(updated.status).toBe('failed');
      expect(updated.error).toBe('Connection timeout');
      expect(updated.completed_at).toBeDefined();
    });

    it('should update status to blocked', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      const updated = await ledger.updateAction(entry.action_id, testRunId, {
        status: 'blocked',
        metadata: { reason: 'Out of scope' },
      });

      expect(updated.status).toBe('blocked');
      expect(updated.metadata?.reason).toBe('Out of scope');
    });

    it('should throw for non-existent action', async () => {
      await expect(
        ledger.updateAction('non-existent-id', testRunId, { status: 'executed' })
      ).rejects.toThrow(ActionNotFoundError);
    });
  });

  describe('getAction', () => {
    it('should return action from cache', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      const retrieved = await ledger.getAction(entry.action_id, testRunId);
      expect(retrieved).toEqual(entry);
    });

    it('should return action from disk when not in cache', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      ledger.clearCache();
      const retrieved = await ledger.getAction(entry.action_id, testRunId);

      expect(retrieved?.tool_name).toBe('nuclei_scan');
    });

    it('should return null for non-existent action', async () => {
      const action = await ledger.getAction('non-existent-id', testRunId);
      expect(action).toBeNull();
    });
  });

  describe('queryActions', () => {
    beforeEach(async () => {
      // Create several test actions
      await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
        hypothesis_id: 'H-001',
      });
      await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'fuzzer_scan',
        hypothesis_id: 'H-001',
      });
      await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
        hypothesis_id: 'H-002',
      });
    });

    it('should return all actions for a run', async () => {
      const result = await ledger.queryActions({ run_id: testRunId });

      expect(result.entries.length).toBe(3);
      expect(result.total_count).toBe(3);
      expect(result.has_more).toBe(false);
    });

    it('should filter by tool_name', async () => {
      const result = await ledger.queryActions({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every(e => e.tool_name === 'nuclei_scan')).toBe(true);
    });

    it('should filter by status', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'test_tool',
      });
      await ledger.updateAction(entry.action_id, testRunId, { status: 'executed' });

      const result = await ledger.queryActions({
        run_id: testRunId,
        status: 'executed',
      });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].status).toBe('executed');
    });

    it('should filter by multiple statuses', async () => {
      const entry1 = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'test_tool_1',
      });
      await ledger.updateAction(entry1.action_id, testRunId, { status: 'executed' });

      const entry2 = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'test_tool_2',
      });
      await ledger.updateAction(entry2.action_id, testRunId, { status: 'failed' });

      const result = await ledger.queryActions({
        run_id: testRunId,
        status: ['executed', 'failed'],
      });

      expect(result.entries.length).toBe(2);
    });

    it('should filter by hypothesis_id', async () => {
      const result = await ledger.queryActions({
        run_id: testRunId,
        hypothesis_id: 'H-001',
      });

      expect(result.entries.length).toBe(2);
      expect(result.entries.every(e => e.hypothesis_id === 'H-001')).toBe(true);
    });

    it('should apply pagination', async () => {
      const result = await ledger.queryActions({
        run_id: testRunId,
        limit: 2,
      });

      expect(result.entries.length).toBe(2);
      expect(result.total_count).toBe(3);
      expect(result.has_more).toBe(true);
    });

    it('should apply offset', async () => {
      const result = await ledger.queryActions({
        run_id: testRunId,
        limit: 2,
        offset: 1,
      });

      expect(result.entries.length).toBe(2);
      expect(result.total_count).toBe(3);
    });

    it('should return empty for non-existent run', async () => {
      const result = await ledger.queryActions({ run_id: 'non-existent' });

      expect(result.entries).toHaveLength(0);
      expect(result.total_count).toBe(0);
    });

    it('should return empty when no run_id provided', async () => {
      const result = await ledger.queryActions({});

      expect(result.entries).toHaveLength(0);
    });
  });

  describe('getRunStats', () => {
    it('should return statistics for a run', async () => {
      const entry1 = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });
      await ledger.updateAction(entry1.action_id, testRunId, {
        status: 'executed',
        duration_ms: 1000,
      });

      const entry2 = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'fuzzer_scan',
      });
      await ledger.updateAction(entry2.action_id, testRunId, {
        status: 'executed',
        duration_ms: 2000,
      });

      const entry3 = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });
      await ledger.updateAction(entry3.action_id, testRunId, {
        status: 'failed',
        duration_ms: 500,
      });

      const stats = await ledger.getRunStats(testRunId);

      expect(stats.total).toBe(3);
      expect(stats.by_status.executed).toBe(2);
      expect(stats.by_status.failed).toBe(1);
      expect(stats.by_tool['nuclei_scan']).toBe(2);
      expect(stats.by_tool['fuzzer_scan']).toBe(1);
      expect(stats.avg_duration_ms).toBeCloseTo(1166.67, 0);
    });

    it('should return null avg_duration when no durations', async () => {
      await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      const stats = await ledger.getRunStats(testRunId);
      expect(stats.avg_duration_ms).toBeNull();
    });

    it('should return zero counts for empty run', async () => {
      const stats = await ledger.getRunStats('non-existent');

      expect(stats.total).toBe(0);
      expect(stats.by_status.proposed).toBe(0);
      expect(stats.by_status.executed).toBe(0);
    });
  });

  describe('verifyIntegrity', () => {
    it('should return valid for correct ledger', async () => {
      await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });
      await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'fuzzer_scan',
      });

      const result = await ledger.verifyIntegrity(testRunId);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.entry_count).toBe(2);
    });

    it('should return valid for empty ledger', async () => {
      const result = await ledger.verifyIntegrity('non-existent');

      expect(result.valid).toBe(true);
      expect(result.entry_count).toBe(0);
    });
  });

  describe('getEvidenceDir', () => {
    it('should return configured evidence directory', () => {
      expect(ledger.getEvidenceDir()).toBe(testDir);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      const entry = await ledger.recordAction({
        run_id: testRunId,
        tool_name: 'nuclei_scan',
      });

      ledger.clearCache();

      // Getting action should reload from disk
      const loaded = await ledger.getAction(entry.action_id, testRunId);
      expect(loaded).not.toBeNull();
    });
  });
});
