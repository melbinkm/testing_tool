import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunManifestManager } from './run-manifest.js';
import { MANIFEST_SCHEMA_VERSION, ManifestNotFoundError } from './types.js';
import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('RunManifestManager', () => {
  let manager: RunManifestManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `run-manifest-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    manager = new RunManifestManager(testDir);
  });

  afterEach(async () => {
    manager.clearCache();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generateRunId', () => {
    it('should generate unique run IDs', () => {
      const id1 = manager.generateRunId();
      const id2 = manager.generateRunId();

      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with correct prefix', () => {
      const id = manager.generateRunId();
      expect(id.startsWith('run-')).toBe(true);
    });

    it('should include timestamp in ID', () => {
      const id = manager.generateRunId();
      // Format: run-YYYYMMDDTHHMMSS-random
      expect(id.length).toBeGreaterThan(20);
    });
  });

  describe('hashContent', () => {
    it('should return consistent hash for same content', () => {
      const hash1 = manager.hashContent('test content');
      const hash2 = manager.hashContent('test content');

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', () => {
      const hash1 = manager.hashContent('content 1');
      const hash2 = manager.hashContent('content 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should return 64 character SHA-256 hash', () => {
      const hash = manager.hashContent('test');
      expect(hash.length).toBe(64);
    });
  });

  describe('createManifest', () => {
    it('should create manifest with required fields', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      expect(manifest.schema_version).toBe(MANIFEST_SCHEMA_VERSION);
      expect(manifest.engagement_id).toBe('ENG-001');
      expect(manifest.run_id).toBeDefined();
      expect(manifest.started_at).toBeDefined();
      expect(manifest.scope_hash).toBeDefined();
      expect(manifest.environment).toBe('SANDBOX');
      expect(manifest.tool_versions).toEqual({});
    });

    it('should create manifest with optional fields', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
        environment: 'STAGING',
        operator: 'test-user',
        tool_versions: { 'nuclei': '3.0.0' },
        tags: ['test', 'poc'],
        notes: 'Test run',
      });

      expect(manifest.environment).toBe('STAGING');
      expect(manifest.operator).toBe('test-user');
      expect(manifest.tool_versions).toEqual({ 'nuclei': '3.0.0' });
      expect(manifest.tags).toEqual(['test', 'poc']);
      expect(manifest.notes).toBe('Test run');
    });

    it('should hash scope content when provided', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
        scope_content: 'domain: example.com',
      });

      expect(manifest.scope_hash).toBe(manager.hashContent('domain: example.com'));
    });

    it('should hash scope file when provided', async () => {
      const scopeFile = join(testDir, 'scope.yaml');
      await writeFile(scopeFile, 'domain: test.com', 'utf-8');

      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
        scope_file: scopeFile,
      });

      expect(manifest.scope_hash).toBe(manager.hashContent('domain: test.com'));
      expect(manifest.scope_file).toBe(scopeFile);
    });

    it('should use default hash when no scope provided', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      expect(manifest.scope_hash).toBe(manager.hashContent('no-scope-defined'));
    });

    it('should persist manifest to disk', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      // Clear cache and reload
      manager.clearCache();
      const loaded = await manager.getManifest(manifest.run_id);

      expect(loaded).not.toBeNull();
      expect(loaded?.engagement_id).toBe('ENG-001');
    });
  });

  describe('getManifest', () => {
    it('should return manifest from cache', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      const retrieved = await manager.getManifest(manifest.run_id);
      expect(retrieved).toEqual(manifest);
    });

    it('should return manifest from disk when not in cache', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      manager.clearCache();
      const retrieved = await manager.getManifest(manifest.run_id);

      expect(retrieved?.engagement_id).toBe('ENG-001');
    });

    it('should return null for non-existent manifest', async () => {
      const manifest = await manager.getManifest('non-existent-id');
      expect(manifest).toBeNull();
    });
  });

  describe('queryManifest', () => {
    it('should return found=true for existing manifest', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      const result = await manager.queryManifest(manifest.run_id);

      expect(result.found).toBe(true);
      expect(result.manifest).toEqual(manifest);
    });

    it('should return found=false for non-existent manifest', async () => {
      const result = await manager.queryManifest('non-existent-id');

      expect(result.found).toBe(false);
      expect(result.manifest).toBeNull();
    });
  });

  describe('endRun', () => {
    it('should set ended_at timestamp', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      expect(manifest.ended_at).toBeUndefined();

      const ended = await manager.endRun(manifest.run_id);

      expect(ended.ended_at).toBeDefined();
      expect(new Date(ended.ended_at!).getTime()).toBeGreaterThan(0);
    });

    it('should throw for non-existent run', async () => {
      await expect(manager.endRun('non-existent-id')).rejects.toThrow(ManifestNotFoundError);
    });

    it('should persist ended_at to disk', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      await manager.endRun(manifest.run_id);
      manager.clearCache();

      const loaded = await manager.getManifest(manifest.run_id);
      expect(loaded?.ended_at).toBeDefined();
    });
  });

  describe('updateManifest', () => {
    it('should update notes', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      const updated = await manager.updateManifest(manifest.run_id, {
        notes: 'Updated notes',
      });

      expect(updated.notes).toBe('Updated notes');
    });

    it('should update tags', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      const updated = await manager.updateManifest(manifest.run_id, {
        tags: ['new', 'tags'],
      });

      expect(updated.tags).toEqual(['new', 'tags']);
    });

    it('should merge tool versions', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
        tool_versions: { 'nuclei': '3.0.0' },
      });

      const updated = await manager.updateManifest(manifest.run_id, {
        tool_versions: { 'fuzzer': '1.0.0' },
      });

      expect(updated.tool_versions).toEqual({
        'nuclei': '3.0.0',
        'fuzzer': '1.0.0',
      });
    });

    it('should throw for non-existent manifest', async () => {
      await expect(
        manager.updateManifest('non-existent-id', { notes: 'test' })
      ).rejects.toThrow(ManifestNotFoundError);
    });
  });

  describe('verifyScopeHash', () => {
    it('should return true when scope matches', async () => {
      const scopeFile = join(testDir, 'scope.yaml');
      await writeFile(scopeFile, 'domain: test.com', 'utf-8');

      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
        scope_file: scopeFile,
      });

      const matches = await manager.verifyScopeHash(manifest.run_id, scopeFile);
      expect(matches).toBe(true);
    });

    it('should return false when scope has changed', async () => {
      const scopeFile = join(testDir, 'scope.yaml');
      await writeFile(scopeFile, 'domain: test.com', 'utf-8');

      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
        scope_file: scopeFile,
      });

      // Modify scope file
      await writeFile(scopeFile, 'domain: modified.com', 'utf-8');

      const matches = await manager.verifyScopeHash(manifest.run_id, scopeFile);
      expect(matches).toBe(false);
    });

    it('should throw for non-existent manifest', async () => {
      const scopeFile = join(testDir, 'scope.yaml');
      await writeFile(scopeFile, 'domain: test.com', 'utf-8');

      await expect(
        manager.verifyScopeHash('non-existent-id', scopeFile)
      ).rejects.toThrow(ManifestNotFoundError);
    });
  });

  describe('getEvidenceDir', () => {
    it('should return configured evidence directory', () => {
      expect(manager.getEvidenceDir()).toBe(testDir);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      const manifest = await manager.createManifest({
        engagement_id: 'ENG-001',
      });

      manager.clearCache();

      // Getting manifest should reload from disk
      const loaded = await manager.getManifest(manifest.run_id);
      expect(loaded).not.toBeNull();
    });
  });
});
