import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: {},
  ListToolsRequestSchema: {},
}));

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Nuclei MCP Server', () => {
  let handleScanSingle: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  let handleScanTemplate: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  let handleListTemplates: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import server module to get the handler functions
    const serverModule = await import('./server.js');
    handleScanSingle = serverModule.handleScanSingle;
    handleScanTemplate = serverModule.handleScanTemplate;
    handleListTemplates = serverModule.handleListTemplates;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleScanSingle', () => {
    it('should return error when target is missing', async () => {
      const result = await handleScanSingle({
        template_id: 'test-template',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('target is required');
      expect(result.isError).toBe(true);
    });

    it('should return error when template_id is missing', async () => {
      const result = await handleScanSingle({
        target: 'https://example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('template_id is required');
      expect(result.isError).toBe(true);
    });

    it('should return error for invalid URL', async () => {
      const result = await handleScanSingle({
        target: 'not-a-valid-url',
        template_id: 'test-template',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid target URL');
      expect(result.isError).toBe(true);
    });

    it('should run scan successfully with valid parameters', async () => {
      const result = await handleScanSingle({
        target: 'https://example.com',
        template_id: 'cves/2021/CVE-2021-44228',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.target).toBe('https://example.com');
      expect(parsed.result.mock_mode).toBe(true);
      expect(parsed.warning).toContain('mock mode');
    });

    it('should return findings for known templates', async () => {
      const result = await handleScanSingle({
        target: 'https://example.com',
        template_id: 'cves/2021/CVE-2021-44228',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.result.findings.length).toBeGreaterThan(0);
      expect(parsed.result.findings[0].template_id).toBe('CVE-2021-44228');
    });

    it('should handle URLs with ports', async () => {
      const result = await handleScanSingle({
        target: 'https://example.com:8080',
        template_id: 'test-template',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should handle URLs with paths', async () => {
      const result = await handleScanSingle({
        target: 'https://example.com/api/v1/endpoint',
        template_id: 'test-template',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should accept non-string target gracefully', async () => {
      const result = await handleScanSingle({
        target: 123,
        template_id: 'test-template',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should accept non-string template_id gracefully', async () => {
      const result = await handleScanSingle({
        target: 'https://example.com',
        template_id: ['array'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(result.isError).toBe(true);
    });
  });

  describe('handleScanTemplate', () => {
    it('should return error when targets is missing', async () => {
      const result = await handleScanTemplate({
        template_ids: ['test-template'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('targets is required');
      expect(result.isError).toBe(true);
    });

    it('should return error when targets is empty array', async () => {
      const result = await handleScanTemplate({
        targets: [],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('non-empty array');
      expect(result.isError).toBe(true);
    });

    it('should return error for invalid URL in targets', async () => {
      const result = await handleScanTemplate({
        targets: ['https://valid.com', 'invalid-url'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid target URL');
    });

    it('should scan multiple targets successfully', async () => {
      const result = await handleScanTemplate({
        targets: ['https://example1.com', 'https://example2.com'],
        template_ids: ['cves/2021/CVE-2021-44228'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.summary.total_targets).toBe(2);
    });

    it('should include summary in response', async () => {
      const result = await handleScanTemplate({
        targets: ['https://example.com'],
        template_ids: ['cves/2021/CVE-2021-44228'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.total_targets).toBe(1);
      expect(parsed.summary.successful_scans).toBeDefined();
      expect(parsed.summary.failed_scans).toBeDefined();
      expect(parsed.summary.total_findings).toBeDefined();
    });

    it('should filter by severity', async () => {
      const result = await handleScanTemplate({
        targets: ['https://example.com'],
        severity: ['critical', 'high'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should filter by tags', async () => {
      const result = await handleScanTemplate({
        targets: ['https://example.com'],
        tags: ['cve'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should include mock mode warning', async () => {
      const result = await handleScanTemplate({
        targets: ['https://example.com'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.warning).toContain('mock mode');
    });
  });

  describe('handleListTemplates', () => {
    it('should list all templates when no filters', async () => {
      const result = await handleListTemplates({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.templates).toBeDefined();
      expect(parsed.templates.length).toBeGreaterThan(0);
      expect(parsed.total_count).toBeDefined();
    });

    it('should filter by severity', async () => {
      const result = await handleListTemplates({
        severity: 'critical',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.templates.every((t: { severity: string }) => t.severity === 'critical')).toBe(true);
    });

    it('should filter by multiple severities', async () => {
      const result = await handleListTemplates({
        severity: ['critical', 'high'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.templates.every((t: { severity: string }) =>
        ['critical', 'high'].includes(t.severity)
      )).toBe(true);
    });

    it('should filter by tags', async () => {
      const result = await handleListTemplates({
        tags: ['cve'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.templates.length).toBeGreaterThan(0);
    });

    it('should filter by author', async () => {
      const result = await handleListTemplates({
        author: 'pdteam',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.templates.length).toBeGreaterThan(0);
    });

    it('should filter by search term', async () => {
      const result = await handleListTemplates({
        search: 'Log4j',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.templates.some((t: { name: string }) => t.name.includes('Log4j'))).toBe(true);
    });

    it('should apply limit', async () => {
      const result = await handleListTemplates({
        limit: 3,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.templates.length).toBe(3);
      expect(parsed.returned_count).toBe(3);
    });

    it('should include counts in response', async () => {
      const result = await handleListTemplates({
        limit: 3,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.total_count).toBeDefined();
      expect(parsed.filtered_count).toBeDefined();
      expect(parsed.returned_count).toBeDefined();
    });

    it('should include mock mode warning', async () => {
      const result = await handleListTemplates({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.warning).toContain('mock mode');
    });
  });

  describe('Response Format', () => {
    it('should return content array with text type', async () => {
      const result = await handleListTemplates({});

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in text content', async () => {
      const result = await handleListTemplates({});

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include success boolean in all responses', async () => {
      const result = await handleScanSingle({});

      const parsed = JSON.parse(result.content[0].text);
      expect(typeof parsed.success).toBe('boolean');
    });

    it('should format JSON with indentation for success responses', async () => {
      const result = await handleListTemplates({});

      expect(result.content[0].text).toContain('\n');
    });
  });

  describe('Error Handling', () => {
    it('should set isError flag for validation errors', async () => {
      const result = await handleScanSingle({});

      expect(result.isError).toBe(true);
    });

    it('should not set isError for successful requests', async () => {
      const result = await handleListTemplates({});

      expect(result.isError).toBeFalsy();
    });

    it('should include error message in response', async () => {
      const result = await handleScanSingle({
        target: 'invalid-url',
        template_id: 'test',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('Template Validation', () => {
    it('should handle non-existent template gracefully', async () => {
      const result = await handleScanSingle({
        target: 'https://example.com',
        template_id: 'nonexistent/template/12345',
      });

      const parsed = JSON.parse(result.content[0].text);
      // Should succeed but with no findings (in mock mode)
      expect(parsed.success).toBe(true);
    });
  });

  describe('Multiple Filter Combinations', () => {
    it('should apply severity and tags filters together', async () => {
      const result = await handleListTemplates({
        severity: ['critical', 'high'],
        tags: ['cve'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      parsed.templates.forEach((t: { severity: string; tags: string[] }) => {
        expect(['critical', 'high'].includes(t.severity)).toBe(true);
        expect(t.tags.some(tag => tag.includes('cve'))).toBe(true);
      });
    });

    it('should apply search and limit filters together', async () => {
      const result = await handleListTemplates({
        search: 'detection',
        limit: 2,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.templates.length).toBeLessThanOrEqual(2);
    });
  });
});
