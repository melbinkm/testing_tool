/**
 * MCP Server unit tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { resetBundler, getBundler } from './bundler.js';
import { resetRedactor } from './redactor.js';
import { resetExporter } from './exporter.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

// Suppress console output during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Evidence MCP Server', () => {
  let handleEvidenceBundle: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
  let handleAddArtifact: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
  let handleExport: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
  let handleGenerateReport: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

  beforeEach(async () => {
    // Reset singletons
    resetBundler();
    resetRedactor();
    resetExporter();
    vi.clearAllMocks();

    // Import handlers fresh
    const server = await import('./server.js');
    handleEvidenceBundle = server.handleEvidenceBundle;
    handleAddArtifact = server.handleAddArtifact;
    handleExport = server.handleExport;
    handleGenerateReport = server.handleGenerateReport;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleEvidenceBundle', () => {
    it('should create a new evidence bundle', async () => {
      const result = await handleEvidenceBundle({
        finding_id: 'F-001',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.bundle_id).toMatch(/^EB-[A-Z0-9]{8}$/);
      expect(parsed.finding_id).toBe('F-001');
    });

    it('should create bundle with metadata', async () => {
      const result = await handleEvidenceBundle({
        finding_id: 'F-001',
        metadata: {
          title: 'SQL Injection',
          severity: 'high',
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain('Evidence bundle created');
    });

    it('should return error for missing finding_id', async () => {
      const result = await handleEvidenceBundle({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('finding_id is required');
    });

    it('should return error for non-string finding_id', async () => {
      const result = await handleEvidenceBundle({
        finding_id: 123,
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should return content array with text type', async () => {
      const result = await handleEvidenceBundle({
        finding_id: 'F-001',
      });

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('handleAddArtifact', () => {
    let bundleId: string;

    beforeEach(async () => {
      const createResult = await handleEvidenceBundle({
        finding_id: 'F-001',
      });
      const parsed = JSON.parse(createResult.content[0].text);
      bundleId = parsed.bundle_id;
    });

    it('should add artifact to bundle', async () => {
      const result = await handleAddArtifact({
        bundle_id: bundleId,
        artifact: {
          type: 'request',
          name: 'login-request',
          content: 'POST /api/login',
          content_type: 'text/plain',
        },
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.artifact_id).toMatch(/^ART-[A-Z0-9]{8}$/);
      expect(parsed.type).toBe('request');
      expect(parsed.name).toBe('login-request');
    });

    it('should warn about sensitive data in artifact', async () => {
      const result = await handleAddArtifact({
        bundle_id: bundleId,
        artifact: {
          type: 'request',
          name: 'auth-request',
          content: 'password=mysecret123',
          content_type: 'text/plain',
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.sensitive_data_warning).toBeDefined();
    });

    it('should return error for missing bundle_id', async () => {
      const result = await handleAddArtifact({
        artifact: {
          type: 'request',
          name: 'test',
          content: 'test',
        },
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('bundle_id is required');
    });

    it('should return error for missing artifact', async () => {
      const result = await handleAddArtifact({
        bundle_id: bundleId,
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('artifact is required');
    });

    it('should return error for non-existent bundle', async () => {
      const result = await handleAddArtifact({
        bundle_id: 'EB-NOTEXIST',
        artifact: {
          type: 'request',
          name: 'test',
          content: 'test',
        },
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Bundle not found');
    });

    it('should return error for invalid artifact type', async () => {
      const result = await handleAddArtifact({
        bundle_id: bundleId,
        artifact: {
          type: 'invalid',
          name: 'test',
          content: 'test',
        },
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid artifact type');
    });
  });

  describe('handleExport', () => {
    let bundleId: string;

    beforeEach(async () => {
      const createResult = await handleEvidenceBundle({
        finding_id: 'F-001',
        metadata: { title: 'Test Finding' },
      });
      const parsed = JSON.parse(createResult.content[0].text);
      bundleId = parsed.bundle_id;

      await handleAddArtifact({
        bundle_id: bundleId,
        artifact: {
          type: 'request',
          name: 'test-request',
          content: 'Test content',
        },
      });
    });

    it('should export bundle to JSON format', async () => {
      const result = await handleExport({
        bundle_id: bundleId,
        format: 'json',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.format).toBe('json');
      expect(parsed.artifact_count).toBe(1);
      expect(parsed.data).toBeDefined();
    });

    it('should export bundle to ZIP format', async () => {
      const result = await handleExport({
        bundle_id: bundleId,
        format: 'zip',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.format).toBe('zip');
      expect(parsed.data).toBeDefined();
    });

    it('should apply redaction by default', async () => {
      // Add artifact with sensitive data
      await handleAddArtifact({
        bundle_id: bundleId,
        artifact: {
          type: 'config',
          name: 'secrets',
          content: 'api_key=supersecretkey123456789012',
        },
      });

      const result = await handleExport({
        bundle_id: bundleId,
        format: 'json',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.redacted_count).toBeGreaterThan(0);
    });

    it('should skip redaction when include_redacted is true', async () => {
      const result = await handleExport({
        bundle_id: bundleId,
        format: 'json',
        include_redacted: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should return error for missing bundle_id', async () => {
      const result = await handleExport({
        format: 'json',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('bundle_id is required');
    });

    it('should return error for invalid format', async () => {
      const result = await handleExport({
        bundle_id: bundleId,
        format: 'invalid',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('format must be');
    });

    it('should return error for non-existent bundle', async () => {
      const result = await handleExport({
        bundle_id: 'EB-NOTEXIST',
        format: 'json',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Bundle not found');
    });
  });

  describe('handleGenerateReport', () => {
    let bundleId: string;

    beforeEach(async () => {
      const createResult = await handleEvidenceBundle({
        finding_id: 'F-001',
        metadata: {
          title: 'SQL Injection',
          severity: 'high',
          description: 'Vulnerable endpoint found.',
        },
      });
      const parsed = JSON.parse(createResult.content[0].text);
      bundleId = parsed.bundle_id;

      await handleAddArtifact({
        bundle_id: bundleId,
        artifact: {
          type: 'request',
          name: 'exploit',
          content: 'POST /api/users\nid=1 OR 1=1',
        },
      });
    });

    it('should generate markdown report', async () => {
      const result = await handleGenerateReport({
        bundle_id: bundleId,
        template: 'markdown',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.template).toBe('markdown');
      expect(parsed.content).toContain('# Security Finding Report');
      expect(parsed.content).toContain('SQL Injection');
    });

    it('should generate HTML report', async () => {
      const result = await handleGenerateReport({
        bundle_id: bundleId,
        template: 'html',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.template).toBe('html');
      expect(parsed.content).toContain('<!DOCTYPE html>');
    });

    it('should use custom title when provided', async () => {
      const result = await handleGenerateReport({
        bundle_id: bundleId,
        template: 'markdown',
        title: 'Custom Title',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should include artifacts by default', async () => {
      const result = await handleGenerateReport({
        bundle_id: bundleId,
        template: 'markdown',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.artifact_count).toBe(1);
      expect(parsed.content).toContain('exploit');
    });

    it('should exclude artifacts when include_artifacts is false', async () => {
      const result = await handleGenerateReport({
        bundle_id: bundleId,
        template: 'markdown',
        include_artifacts: false,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.content).not.toContain('POST /api/users');
    });

    it('should return error for missing bundle_id', async () => {
      const result = await handleGenerateReport({
        template: 'markdown',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('bundle_id is required');
    });

    it('should return error for invalid template', async () => {
      const result = await handleGenerateReport({
        bundle_id: bundleId,
        template: 'invalid',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('template must be');
    });

    it('should return error for non-existent bundle', async () => {
      const result = await handleGenerateReport({
        bundle_id: 'EB-NOTEXIST',
        template: 'markdown',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Bundle not found');
    });
  });

  describe('Tool Registration', () => {
    it('should export server instance', async () => {
      const server = await import('./server.js');
      expect(server.server).toBeDefined();
    });

    it('should export handler functions', async () => {
      const server = await import('./server.js');
      expect(typeof server.handleEvidenceBundle).toBe('function');
      expect(typeof server.handleAddArtifact).toBe('function');
      expect(typeof server.handleExport).toBe('function');
      expect(typeof server.handleGenerateReport).toBe('function');
    });

    it('should export config getter', async () => {
      const server = await import('./server.js');
      const config = server.getConfig();
      expect(config.EVIDENCE_DIR).toBeDefined();
      expect(config.REDACT_SECRETS).toBeDefined();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete workflow: create, add, export', async () => {
      // Create bundle
      const createResult = await handleEvidenceBundle({
        finding_id: 'F-INTEGRATION',
        metadata: { title: 'Integration Test' },
      });
      const bundle = JSON.parse(createResult.content[0].text);
      expect(bundle.success).toBe(true);

      // Add artifacts
      const art1 = await handleAddArtifact({
        bundle_id: bundle.bundle_id,
        artifact: {
          type: 'request',
          name: 'request-1',
          content: 'GET /api/test',
        },
      });
      expect(JSON.parse(art1.content[0].text).success).toBe(true);

      const art2 = await handleAddArtifact({
        bundle_id: bundle.bundle_id,
        artifact: {
          type: 'response',
          name: 'response-1',
          content: '{"status":"ok"}',
        },
      });
      expect(JSON.parse(art2.content[0].text).success).toBe(true);

      // Export
      const exportResult = await handleExport({
        bundle_id: bundle.bundle_id,
        format: 'json',
        include_redacted: true,
      });
      const exported = JSON.parse(exportResult.content[0].text);
      expect(exported.success).toBe(true);
      expect(exported.artifact_count).toBe(2);

      // Generate report
      const reportResult = await handleGenerateReport({
        bundle_id: bundle.bundle_id,
        template: 'markdown',
      });
      const report = JSON.parse(reportResult.content[0].text);
      expect(report.success).toBe(true);
      expect(report.content).toContain('Integration Test');
    });
  });
});
