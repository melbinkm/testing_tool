import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NucleiRunner, MOCK_FINDINGS } from './nuclei-runner.js';

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('NucleiRunner', () => {
  let runner: NucleiRunner;

  beforeEach(() => {
    runner = new NucleiRunner({ mockMode: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const defaultRunner = new NucleiRunner();
      const config = defaultRunner.getConfig();

      expect(config.nucleiPath).toBeDefined();
      expect(config.templatesDir).toBeDefined();
      expect(config.rateLimit).toBeGreaterThan(0);
      expect(config.timeout).toBeGreaterThan(0);
    });

    it('should allow configuration override', () => {
      const customRunner = new NucleiRunner({
        nucleiPath: '/custom/path/nuclei',
        templatesDir: '/custom/templates',
        rateLimit: 20,
        timeout: 60000,
        mockMode: true,
      });

      const config = customRunner.getConfig();
      expect(config.nucleiPath).toBe('/custom/path/nuclei');
      expect(config.templatesDir).toBe('/custom/templates');
      expect(config.rateLimit).toBe(20);
      expect(config.timeout).toBe(60000);
      expect(config.mockMode).toBe(true);
    });

    it('should merge partial configuration with defaults', () => {
      const partialRunner = new NucleiRunner({
        rateLimit: 5,
      });

      const config = partialRunner.getConfig();
      expect(config.rateLimit).toBe(5);
      expect(config.timeout).toBeDefined();
    });
  });

  describe('Mock Mode Detection', () => {
    it('should return true for mock mode when forced', async () => {
      expect(await runner.isMockMode()).toBe(true);
    });

    it('should detect mock mode when binary is not available', async () => {
      const noMockRunner = new NucleiRunner({
        nucleiPath: '/nonexistent/binary',
        mockMode: false,
      });
      expect(await noMockRunner.isMockMode()).toBe(true);
    });

    it('should cache binary availability check', async () => {
      // First check
      await runner.isMockMode();
      // Second check should use cached value
      const result = await runner.isMockMode();
      expect(result).toBe(true);
    });
  });

  describe('Binary Check', () => {
    it('should return false when mock mode is forced', async () => {
      const result = await runner.checkBinary();
      expect(result).toBe(false);
    });

    it('should check for binary in PATH', async () => {
      const noMockRunner = new NucleiRunner({
        nucleiPath: 'nonexistent_binary_12345',
        mockMode: false,
      });
      const result = await noMockRunner.checkBinary();
      expect(result).toBe(false);
    });
  });

  describe('scanSingle - Mock Mode', () => {
    it('should return mock findings for known templates', async () => {
      const result = await runner.scanSingle(
        'https://example.com',
        'cves/2021/CVE-2021-44228'
      );

      expect(result.success).toBe(true);
      expect(result.target).toBe('https://example.com');
      expect(result.mock_mode).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].template_id).toBe('CVE-2021-44228');
      expect(result.findings[0].severity).toBe('critical');
    });

    it('should return empty findings for unknown templates', async () => {
      const result = await runner.scanSingle(
        'https://example.com',
        'unknown/template'
      );

      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(result.mock_mode).toBe(true);
    });

    it('should replace target placeholder in findings', async () => {
      const result = await runner.scanSingle(
        'https://test.example.com',
        'cves/2021/CVE-2021-44228'
      );

      expect(result.findings[0].matched_at).toContain('https://test.example.com');
      expect(result.findings[0].matched_url).toBe('https://test.example.com');
    });

    it('should return error for invalid URL', async () => {
      const result = await runner.scanSingle(
        'not-a-valid-url',
        'cves/2021/CVE-2021-44228'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid target URL');
    });

    it('should record scan time', async () => {
      const result = await runner.scanSingle(
        'https://example.com',
        'cves/2021/CVE-2021-44228'
      );

      expect(result.scan_time_ms).toBeGreaterThan(0);
    });

    it('should include timestamp in findings', async () => {
      const result = await runner.scanSingle(
        'https://example.com',
        'cves/2021/CVE-2021-44228'
      );

      expect(result.findings[0].timestamp).toBeDefined();
      expect(new Date(result.findings[0].timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('scanWithTemplates - Mock Mode', () => {
    it('should scan multiple targets', async () => {
      const targets = [
        'https://example1.com',
        'https://example2.com',
      ];

      const results = await runner.scanWithTemplates(targets, {
        templateIds: ['cves/2021/CVE-2021-44228'],
      });

      expect(results).toHaveLength(2);
      expect(results[0].target).toBe('https://example1.com');
      expect(results[1].target).toBe('https://example2.com');
    });

    it('should filter by template IDs', async () => {
      const results = await runner.scanWithTemplates(
        ['https://example.com'],
        { templateIds: ['misconfiguration/http-missing-security-headers'] }
      );

      expect(results[0].findings.length).toBeGreaterThan(0);
      expect(results[0].findings[0].severity).toBe('info');
    });

    it('should handle invalid URLs in target list', async () => {
      const results = await runner.scanWithTemplates([
        'https://valid.com',
        'invalid-url',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('Invalid target URL');
    });

    it('should use all mock templates when no template IDs specified', async () => {
      const results = await runner.scanWithTemplates(['https://example.com']);

      expect(results[0].success).toBe(true);
      expect(results[0].findings.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array for empty targets', async () => {
      const results = await runner.scanWithTemplates([]);

      expect(results).toHaveLength(0);
    });
  });

  describe('getVersion', () => {
    it('should return mock-mode for mock runner', async () => {
      const version = await runner.getVersion();
      expect(version).toBe('mock-mode');
    });
  });

  describe('Mock Findings', () => {
    it('should have CVE-2021-44228 template', () => {
      expect(MOCK_FINDINGS['cves/2021/CVE-2021-44228']).toBeDefined();
      expect(MOCK_FINDINGS['cves/2021/CVE-2021-44228'][0].severity).toBe('critical');
    });

    it('should have XSS detection template', () => {
      expect(MOCK_FINDINGS['vulnerabilities/generic/xss-detection']).toBeDefined();
      expect(MOCK_FINDINGS['vulnerabilities/generic/xss-detection'][0].severity).toBe('medium');
    });

    it('should have security headers template', () => {
      expect(MOCK_FINDINGS['misconfiguration/http-missing-security-headers']).toBeDefined();
      expect(MOCK_FINDINGS['misconfiguration/http-missing-security-headers'].length).toBeGreaterThan(1);
    });
  });

  describe('Finding Properties', () => {
    it('should include all required properties in findings', async () => {
      const result = await runner.scanSingle(
        'https://example.com',
        'cves/2021/CVE-2021-44228'
      );

      const finding = result.findings[0];
      expect(finding.template_id).toBeDefined();
      expect(finding.severity).toBeDefined();
      expect(finding.matched_at).toBeDefined();
      expect(finding.timestamp).toBeDefined();
    });

    it('should include optional properties when available', async () => {
      const result = await runner.scanSingle(
        'https://example.com',
        'cves/2021/CVE-2021-44228'
      );

      const finding = result.findings[0];
      expect(finding.template_name).toBeDefined();
      expect(finding.extracted_data).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle scan errors gracefully', async () => {
      // This test verifies the error handling structure
      const result = await runner.scanSingle(
        'https://example.com',
        'unknown/template'
      );

      // Should still succeed but with no findings
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('URL Validation', () => {
    it('should accept valid HTTP URLs', async () => {
      const result = await runner.scanSingle(
        'http://example.com',
        'cves/2021/CVE-2021-44228'
      );
      expect(result.success).toBe(true);
    });

    it('should accept valid HTTPS URLs', async () => {
      const result = await runner.scanSingle(
        'https://example.com',
        'cves/2021/CVE-2021-44228'
      );
      expect(result.success).toBe(true);
    });

    it('should accept URLs with ports', async () => {
      const result = await runner.scanSingle(
        'https://example.com:8080',
        'cves/2021/CVE-2021-44228'
      );
      expect(result.success).toBe(true);
    });

    it('should accept URLs with paths', async () => {
      const result = await runner.scanSingle(
        'https://example.com/api/v1/endpoint',
        'cves/2021/CVE-2021-44228'
      );
      expect(result.success).toBe(true);
    });

    it('should reject invalid URLs', async () => {
      const result = await runner.scanSingle(
        'not-a-url',
        'cves/2021/CVE-2021-44228'
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should reject empty string', async () => {
      const result = await runner.scanSingle(
        '',
        'cves/2021/CVE-2021-44228'
      );
      expect(result.success).toBe(false);
    });
  });
});
