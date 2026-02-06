/**
 * EvidenceBundler unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EvidenceBundler, getBundler, resetBundler } from './bundler.js';
import type { ArtifactInput } from './types.js';

describe('EvidenceBundler', () => {
  let bundler: EvidenceBundler;

  beforeEach(() => {
    bundler = new EvidenceBundler();
    resetBundler();
  });

  describe('createBundle', () => {
    it('should create a new bundle with finding_id', () => {
      const bundle = bundler.createBundle('FINDING-001');

      expect(bundle.bundle_id).toMatch(/^EB-[A-Z0-9]{8}$/);
      expect(bundle.finding_id).toBe('FINDING-001');
      expect(bundle.artifacts).toEqual([]);
      expect(bundle.metadata).toEqual({});
      expect(bundle.created_at).toBeDefined();
    });

    it('should create bundle with metadata', () => {
      const metadata = { title: 'SQL Injection', severity: 'high' };
      const bundle = bundler.createBundle('FINDING-001', metadata);

      expect(bundle.metadata).toEqual(metadata);
    });

    it('should throw error for missing finding_id', () => {
      expect(() => bundler.createBundle('')).toThrow('finding_id is required');
    });

    it('should throw error for non-string finding_id', () => {
      expect(() => bundler.createBundle(123 as unknown as string)).toThrow('finding_id is required');
    });

    it('should generate unique bundle IDs', () => {
      const bundle1 = bundler.createBundle('FINDING-001');
      const bundle2 = bundler.createBundle('FINDING-002');

      expect(bundle1.bundle_id).not.toBe(bundle2.bundle_id);
    });
  });

  describe('getBundle', () => {
    it('should return bundle by ID', () => {
      const created = bundler.createBundle('FINDING-001');
      const retrieved = bundler.getBundle(created.bundle_id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent bundle', () => {
      const result = bundler.getBundle('EB-NOTEXIST');
      expect(result).toBeUndefined();
    });
  });

  describe('listBundles', () => {
    it('should return empty array when no bundles', () => {
      expect(bundler.listBundles()).toEqual([]);
    });

    it('should return all bundles', () => {
      bundler.createBundle('FINDING-001');
      bundler.createBundle('FINDING-002');
      bundler.createBundle('FINDING-003');

      const bundles = bundler.listBundles();
      expect(bundles).toHaveLength(3);
    });
  });

  describe('listBundlesByFinding', () => {
    it('should return bundles for specific finding', () => {
      bundler.createBundle('FINDING-001');
      bundler.createBundle('FINDING-001');
      bundler.createBundle('FINDING-002');

      const bundles = bundler.listBundlesByFinding('FINDING-001');
      expect(bundles).toHaveLength(2);
      expect(bundles.every((b) => b.finding_id === 'FINDING-001')).toBe(true);
    });

    it('should return empty array for finding with no bundles', () => {
      bundler.createBundle('FINDING-001');

      const bundles = bundler.listBundlesByFinding('FINDING-999');
      expect(bundles).toEqual([]);
    });
  });

  describe('addArtifact', () => {
    let bundleId: string;

    beforeEach(() => {
      const bundle = bundler.createBundle('FINDING-001');
      bundleId = bundle.bundle_id;
    });

    it('should add artifact to bundle', () => {
      const input: ArtifactInput = {
        type: 'request',
        name: 'login-request',
        content: 'POST /login',
        content_type: 'text/plain',
      };

      const artifact = bundler.addArtifact(bundleId, input);

      expect(artifact.artifact_id).toMatch(/^ART-[A-Z0-9]{8}$/);
      expect(artifact.type).toBe('request');
      expect(artifact.name).toBe('login-request');
      expect(artifact.content).toBe('POST /login');
      expect(artifact.redacted).toBe(false);
    });

    it('should default content_type to text/plain', () => {
      const input: ArtifactInput = {
        type: 'log',
        name: 'server-log',
        content: 'Error occurred',
        content_type: '',
      };

      const artifact = bundler.addArtifact(bundleId, input);
      expect(artifact.content_type).toBe('text/plain');
    });

    it('should throw error for non-existent bundle', () => {
      const input: ArtifactInput = {
        type: 'request',
        name: 'test',
        content: 'test',
        content_type: 'text/plain',
      };

      expect(() => bundler.addArtifact('EB-NOTEXIST', input)).toThrow('Bundle not found');
    });

    it('should throw error for missing artifact type', () => {
      const input = {
        type: '',
        name: 'test',
        content: 'test',
        content_type: 'text/plain',
      } as ArtifactInput;

      expect(() => bundler.addArtifact(bundleId, input)).toThrow('Artifact type is required');
    });

    it('should throw error for missing artifact name', () => {
      const input = {
        type: 'request',
        name: '',
        content: 'test',
        content_type: 'text/plain',
      } as ArtifactInput;

      expect(() => bundler.addArtifact(bundleId, input)).toThrow('Artifact name is required');
    });

    it('should throw error for missing artifact content', () => {
      const input = {
        type: 'request',
        name: 'test',
        content: undefined,
        content_type: 'text/plain',
      } as unknown as ArtifactInput;

      expect(() => bundler.addArtifact(bundleId, input)).toThrow('Artifact content is required');
    });

    it('should throw error for invalid artifact type', () => {
      const input = {
        type: 'invalid' as 'request',
        name: 'test',
        content: 'test',
        content_type: 'text/plain',
      };

      expect(() => bundler.addArtifact(bundleId, input)).toThrow('Invalid artifact type');
    });

    it('should accept all valid artifact types', () => {
      const types = ['request', 'response', 'screenshot', 'log', 'config', 'other'] as const;

      for (const type of types) {
        const input: ArtifactInput = {
          type,
          name: `test-${type}`,
          content: 'content',
          content_type: 'text/plain',
        };

        const artifact = bundler.addArtifact(bundleId, input);
        expect(artifact.type).toBe(type);
      }
    });

    it('should generate unique artifact IDs', () => {
      const input1: ArtifactInput = {
        type: 'request',
        name: 'request1',
        content: 'content1',
        content_type: 'text/plain',
      };
      const input2: ArtifactInput = {
        type: 'request',
        name: 'request2',
        content: 'content2',
        content_type: 'text/plain',
      };

      const artifact1 = bundler.addArtifact(bundleId, input1);
      const artifact2 = bundler.addArtifact(bundleId, input2);

      expect(artifact1.artifact_id).not.toBe(artifact2.artifact_id);
    });
  });

  describe('removeArtifact', () => {
    let bundleId: string;
    let artifactId: string;

    beforeEach(() => {
      const bundle = bundler.createBundle('FINDING-001');
      bundleId = bundle.bundle_id;

      const artifact = bundler.addArtifact(bundleId, {
        type: 'request',
        name: 'test',
        content: 'test',
        content_type: 'text/plain',
      });
      artifactId = artifact.artifact_id;
    });

    it('should remove artifact from bundle', () => {
      const result = bundler.removeArtifact(bundleId, artifactId);

      expect(result).toBe(true);
      const bundle = bundler.getBundle(bundleId);
      expect(bundle?.artifacts).toHaveLength(0);
    });

    it('should return false for non-existent artifact', () => {
      const result = bundler.removeArtifact(bundleId, 'ART-NOTEXIST');
      expect(result).toBe(false);
    });

    it('should throw error for non-existent bundle', () => {
      expect(() => bundler.removeArtifact('EB-NOTEXIST', artifactId)).toThrow('Bundle not found');
    });
  });

  describe('getArtifact', () => {
    let bundleId: string;
    let artifactId: string;

    beforeEach(() => {
      const bundle = bundler.createBundle('FINDING-001');
      bundleId = bundle.bundle_id;

      const artifact = bundler.addArtifact(bundleId, {
        type: 'request',
        name: 'test',
        content: 'test',
        content_type: 'text/plain',
      });
      artifactId = artifact.artifact_id;
    });

    it('should return artifact by ID', () => {
      const artifact = bundler.getArtifact(bundleId, artifactId);
      expect(artifact?.artifact_id).toBe(artifactId);
    });

    it('should return undefined for non-existent artifact', () => {
      const artifact = bundler.getArtifact(bundleId, 'ART-NOTEXIST');
      expect(artifact).toBeUndefined();
    });

    it('should throw error for non-existent bundle', () => {
      expect(() => bundler.getArtifact('EB-NOTEXIST', artifactId)).toThrow('Bundle not found');
    });
  });

  describe('updateMetadata', () => {
    it('should update bundle metadata', () => {
      const bundle = bundler.createBundle('FINDING-001', { title: 'Original' });
      const updated = bundler.updateMetadata(bundle.bundle_id, { severity: 'high' });

      expect(updated.metadata.title).toBe('Original');
      expect(updated.metadata.severity).toBe('high');
    });

    it('should overwrite existing metadata keys', () => {
      const bundle = bundler.createBundle('FINDING-001', { title: 'Original' });
      const updated = bundler.updateMetadata(bundle.bundle_id, { title: 'Updated' });

      expect(updated.metadata.title).toBe('Updated');
    });

    it('should throw error for non-existent bundle', () => {
      expect(() => bundler.updateMetadata('EB-NOTEXIST', {})).toThrow('Bundle not found');
    });
  });

  describe('deleteBundle', () => {
    it('should delete existing bundle', () => {
      const bundle = bundler.createBundle('FINDING-001');
      const result = bundler.deleteBundle(bundle.bundle_id);

      expect(result).toBe(true);
      expect(bundler.getBundle(bundle.bundle_id)).toBeUndefined();
    });

    it('should return false for non-existent bundle', () => {
      const result = bundler.deleteBundle('EB-NOTEXIST');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all bundles', () => {
      bundler.createBundle('FINDING-001');
      bundler.createBundle('FINDING-002');

      bundler.clear();

      expect(bundler.listBundles()).toHaveLength(0);
    });
  });

  describe('getBundleCount', () => {
    it('should return correct count', () => {
      expect(bundler.getBundleCount()).toBe(0);

      bundler.createBundle('FINDING-001');
      expect(bundler.getBundleCount()).toBe(1);

      bundler.createBundle('FINDING-002');
      expect(bundler.getBundleCount()).toBe(2);
    });
  });

  describe('getBundler singleton', () => {
    it('should return same instance', () => {
      resetBundler();
      const instance1 = getBundler();
      const instance2 = getBundler();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getBundler();
      resetBundler();
      const instance2 = getBundler();

      expect(instance1).not.toBe(instance2);
    });
  });
});
