/**
 * Exporter unit tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Exporter, getExporter, resetExporter } from './exporter.js';
import { Redactor } from './redactor.js';
import type { EvidenceBundle, ExportOptions, ReportConfig } from './types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Exporter', () => {
  let exporter: Exporter;
  let redactor: Redactor;

  const createSampleBundle = (): EvidenceBundle => ({
    bundle_id: 'EB-TEST1234',
    finding_id: 'F-001',
    created_at: '2024-01-15T10:00:00Z',
    artifacts: [
      {
        artifact_id: 'ART-001',
        type: 'request',
        name: 'login-request',
        content: 'POST /api/login\nContent-Type: application/json\n\n{"username":"admin"}',
        content_type: 'application/json',
        timestamp: '2024-01-15T10:00:01Z',
        redacted: false,
      },
      {
        artifact_id: 'ART-002',
        type: 'response',
        name: 'login-response',
        content: '{"token":"secret123"}',
        content_type: 'application/json',
        timestamp: '2024-01-15T10:00:02Z',
        redacted: false,
      },
    ],
    metadata: {
      title: 'SQL Injection in Login',
      severity: 'high',
      description: 'The login endpoint is vulnerable to SQL injection.',
      cvss_score: 8.5,
      cwe_id: 'CWE-89',
    },
  });

  beforeEach(() => {
    redactor = new Redactor();
    exporter = new Exporter(redactor);
    resetExporter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportToJson', () => {
    it('should export bundle to JSON format', async () => {
      const bundle = createSampleBundle();
      const options: ExportOptions = {
        format: 'json',
        include_redacted: true,
      };

      const result = await exporter.exportToJson(bundle, options);

      expect(result.success).toBe(true);
      expect(result.format).toBe('json');
      expect(result.artifact_count).toBe(2);
      expect(result.data).toBeDefined();

      const parsed = JSON.parse(result.data!);
      expect(parsed.bundle.bundle_id).toBe('EB-TEST1234');
      expect(parsed.export_format).toBe('json');
    });

    it('should apply redaction when include_redacted is false', async () => {
      const bundle = createSampleBundle();
      bundle.artifacts[0].content = 'password=mysecret123';

      const options: ExportOptions = {
        format: 'json',
        include_redacted: false,
      };

      const result = await exporter.exportToJson(bundle, options);
      const parsed = JSON.parse(result.data!);

      expect(parsed.bundle.artifacts[0].content).not.toContain('mysecret123');
      expect(result.redacted_count).toBeGreaterThan(0);
    });

    it('should not apply redaction when include_redacted is true', async () => {
      const bundle = createSampleBundle();
      bundle.artifacts[0].content = 'password=mysecret123';

      const options: ExportOptions = {
        format: 'json',
        include_redacted: true,
      };

      const result = await exporter.exportToJson(bundle, options);
      const parsed = JSON.parse(result.data!);

      expect(parsed.bundle.artifacts[0].content).toContain('password=mysecret123');
    });

    it('should write to file when output_path provided', async () => {
      const bundle = createSampleBundle();
      const tmpFile = path.join(os.tmpdir(), `evidence-test-${Date.now()}.json`);
      const options: ExportOptions = {
        format: 'json',
        include_redacted: true,
        output_path: tmpFile,
      };

      const result = await exporter.exportToJson(bundle, options);

      expect(result.output_path).toBe(tmpFile);
      expect(result.data).toBeUndefined();

      // Verify file was written
      expect(fs.existsSync(tmpFile)).toBe(true);
      const content = fs.readFileSync(tmpFile, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.bundle.bundle_id).toBe('EB-TEST1234');

      // Cleanup
      fs.unlinkSync(tmpFile);
    });

    it('should calculate size_bytes correctly', async () => {
      const bundle = createSampleBundle();
      const options: ExportOptions = {
        format: 'json',
        include_redacted: true,
      };

      const result = await exporter.exportToJson(bundle, options);

      expect(result.size_bytes).toBe(Buffer.byteLength(result.data!, 'utf-8'));
    });

    it('should include export timestamp', async () => {
      const bundle = createSampleBundle();
      const options: ExportOptions = {
        format: 'json',
        include_redacted: true,
      };

      const result = await exporter.exportToJson(bundle, options);
      const parsed = JSON.parse(result.data!);

      expect(parsed.export_timestamp).toBeDefined();
      expect(new Date(parsed.export_timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('exportToZip', () => {
    it('should export bundle to ZIP format', async () => {
      const bundle = createSampleBundle();
      const options: ExportOptions = {
        format: 'zip',
        include_redacted: true,
      };

      const result = await exporter.exportToZip(bundle, options);

      expect(result.success).toBe(true);
      expect(result.format).toBe('zip');
      expect(result.artifact_count).toBe(2);
      expect(result.data).toBeDefined();
      expect(result.size_bytes).toBeGreaterThan(0);
    });

    it('should return base64 encoded data when no output_path', async () => {
      const bundle = createSampleBundle();
      const options: ExportOptions = {
        format: 'zip',
        include_redacted: true,
      };

      const result = await exporter.exportToZip(bundle, options);

      // Verify it's valid base64
      expect(() => Buffer.from(result.data!, 'base64')).not.toThrow();
    });

    it('should write to file when output_path provided', async () => {
      const bundle = createSampleBundle();
      const tmpFile = path.join(os.tmpdir(), `evidence-test-${Date.now()}.zip`);
      const options: ExportOptions = {
        format: 'zip',
        include_redacted: true,
        output_path: tmpFile,
      };

      const result = await exporter.exportToZip(bundle, options);

      expect(result.output_path).toBe(tmpFile);
      expect(result.data).toBeUndefined();

      // Verify file was written
      expect(fs.existsSync(tmpFile)).toBe(true);
      const stats = fs.statSync(tmpFile);
      expect(stats.size).toBeGreaterThan(0);

      // Cleanup
      fs.unlinkSync(tmpFile);
    });

    it('should apply redaction when include_redacted is false', async () => {
      const bundle = createSampleBundle();
      bundle.artifacts[0].content = 'password=mysecret123';

      const options: ExportOptions = {
        format: 'zip',
        include_redacted: false,
      };

      const result = await exporter.exportToZip(bundle, options);

      expect(result.redacted_count).toBeGreaterThan(0);
    });

    it('should create valid ZIP structure', async () => {
      const bundle = createSampleBundle();
      const options: ExportOptions = {
        format: 'zip',
        include_redacted: true,
      };

      const result = await exporter.exportToZip(bundle, options);

      // ZIP files start with PK signature (0x504B)
      const buffer = Buffer.from(result.data!, 'base64');
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4B); // 'K'
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.success).toBe(true);
      expect(result.template).toBe('markdown');
      expect(result.content).toContain('# Security Finding Report');
      expect(result.content).toContain('F-001');
      expect(result.content).toContain('EB-TEST1234');
      expect(result.content).toContain('SQL Injection in Login');
    });

    it('should generate HTML report', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'html',
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.success).toBe(true);
      expect(result.template).toBe('html');
      expect(result.content).toContain('<!DOCTYPE html>');
      expect(result.content).toContain('Security Finding Report');
      expect(result.content).toContain('F-001');
    });

    it('should include metadata in report', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.content).toContain('high');
      expect(result.content).toContain('8.5');
      expect(result.content).toContain('CWE-89');
    });

    it('should use custom title when provided', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
        title: 'Custom Report Title',
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.finding_id).toBe('F-001');
      expect(result.bundle_id).toBe('EB-TEST1234');
    });

    it('should include artifacts in report by default', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.content).toContain('login-request');
      expect(result.content).toContain('login-response');
      expect(result.artifact_count).toBe(2);
    });

    it('should exclude artifacts when include_artifacts is false', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
        include_artifacts: false,
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.content).not.toContain('POST /api/login');
    });

    it('should load custom template from file', async () => {
      // Create a temporary custom template
      const tmpFile = path.join(os.tmpdir(), `custom-template-${Date.now()}.hbs`);
      fs.writeFileSync(tmpFile, 'Custom: {{finding_id}} - {{bundle_id}}', 'utf-8');

      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
        custom_template: tmpFile,
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.content).toBe('Custom: F-001 - EB-TEST1234');
      expect(result.template).toBe(tmpFile);

      // Cleanup
      fs.unlinkSync(tmpFile);
    });

    it('should throw error for non-existent custom template', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
        custom_template: '/path/to/nonexistent/template.hbs',
      };

      await expect(exporter.generateReport(bundle, config)).rejects.toThrow('Template not found');
    });

    it('should include generated timestamp', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.content).toContain('**Generated:**');
    });

    it('should include description in markdown report', async () => {
      const bundle = createSampleBundle();
      const config: ReportConfig = {
        template: 'markdown',
      };

      const result = await exporter.generateReport(bundle, config);

      expect(result.content).toContain('The login endpoint is vulnerable to SQL injection.');
    });
  });

  describe('exportWithReport', () => {
    it('should export bundle with report included', async () => {
      const bundle = createSampleBundle();
      const exportOptions: ExportOptions = {
        format: 'json',
        include_redacted: true,
      };
      const reportConfig: ReportConfig = {
        template: 'markdown',
      };

      const result = await exporter.exportWithReport(bundle, exportOptions, reportConfig);

      expect(result.success).toBe(true);
      expect(result.artifact_count).toBe(3); // 2 original + 1 report

      const parsed = JSON.parse(result.data!);
      const reportArtifact = parsed.bundle.artifacts.find((a: { artifact_id: string }) => a.artifact_id === 'REPORT');
      expect(reportArtifact).toBeDefined();
      expect(reportArtifact.name).toBe('report.md');
    });

    it('should include HTML report when template is html', async () => {
      const bundle = createSampleBundle();
      const exportOptions: ExportOptions = {
        format: 'json',
        include_redacted: true,
      };
      const reportConfig: ReportConfig = {
        template: 'html',
      };

      const result = await exporter.exportWithReport(bundle, exportOptions, reportConfig);

      const parsed = JSON.parse(result.data!);
      const reportArtifact = parsed.bundle.artifacts.find((a: { artifact_id: string }) => a.artifact_id === 'REPORT');
      expect(reportArtifact.name).toBe('report.html');
      expect(reportArtifact.content_type).toBe('text/html');
    });

    it('should export with report as ZIP', async () => {
      const bundle = createSampleBundle();
      const exportOptions: ExportOptions = {
        format: 'zip',
        include_redacted: true,
      };
      const reportConfig: ReportConfig = {
        template: 'markdown',
      };

      const result = await exporter.exportWithReport(bundle, exportOptions, reportConfig);

      expect(result.success).toBe(true);
      expect(result.format).toBe('zip');
      expect(result.artifact_count).toBe(3);
    });
  });

  describe('getExporter singleton', () => {
    it('should return same instance', () => {
      resetExporter();
      const instance1 = getExporter(redactor);
      const instance2 = getExporter(redactor);

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getExporter(redactor);
      resetExporter();
      const instance2 = getExporter(redactor);

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('content type extensions', () => {
    it('should use correct extension for JSON', async () => {
      const bundle: EvidenceBundle = {
        bundle_id: 'EB-TEST',
        finding_id: 'F-001',
        created_at: '2024-01-01T00:00:00Z',
        artifacts: [
          {
            artifact_id: 'ART-001',
            type: 'response',
            name: 'data',
            content: '{}',
            content_type: 'application/json',
            timestamp: '2024-01-01T00:00:00Z',
            redacted: false,
          },
        ],
        metadata: {},
      };

      const result = await exporter.exportToZip(bundle, {
        format: 'zip',
        include_redacted: true,
      });

      expect(result.success).toBe(true);
    });

    it('should handle unknown content types', async () => {
      const bundle: EvidenceBundle = {
        bundle_id: 'EB-TEST',
        finding_id: 'F-001',
        created_at: '2024-01-01T00:00:00Z',
        artifacts: [
          {
            artifact_id: 'ART-001',
            type: 'other',
            name: 'unknown',
            content: 'data',
            content_type: 'application/unknown',
            timestamp: '2024-01-01T00:00:00Z',
            redacted: false,
          },
        ],
        metadata: {},
      };

      const result = await exporter.exportToZip(bundle, {
        format: 'zip',
        include_redacted: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('empty bundle handling', () => {
    it('should export empty bundle without artifacts', async () => {
      const bundle: EvidenceBundle = {
        bundle_id: 'EB-EMPTY',
        finding_id: 'F-EMPTY',
        created_at: '2024-01-01T00:00:00Z',
        artifacts: [],
        metadata: {},
      };

      const result = await exporter.exportToJson(bundle, {
        format: 'json',
        include_redacted: true,
      });

      expect(result.success).toBe(true);
      expect(result.artifact_count).toBe(0);
    });

    it('should generate report for empty bundle', async () => {
      const bundle: EvidenceBundle = {
        bundle_id: 'EB-EMPTY',
        finding_id: 'F-EMPTY',
        created_at: '2024-01-01T00:00:00Z',
        artifacts: [],
        metadata: { title: 'Empty Bundle' },
      };

      const result = await exporter.generateReport(bundle, {
        template: 'markdown',
      });

      expect(result.success).toBe(true);
      expect(result.artifact_count).toBe(0);
    });
  });
});
