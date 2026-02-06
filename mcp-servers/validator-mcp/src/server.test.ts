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

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Validator MCP Server', () => {
  let handleValidateRepro: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  let handleValidateNegativeControl: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  let handleValidateCrossIdentity: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  let handleValidatePromote: (args: Record<string, unknown>) => {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };

  const sampleFinding = {
    finding_id: 'F-001',
    title: 'SQL Injection',
    request: {
      method: 'POST',
      url: 'https://api.example.com/login',
      headers: { 'Content-Type': 'application/json' },
      body: '{"username": "admin"}',
    },
    expected: {
      status_code: 200,
      body_contains: ['token'],
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    // Import server module to get the handler functions
    const serverModule = await import('./server.js');
    handleValidateRepro = serverModule.handleValidateRepro;
    handleValidateNegativeControl = serverModule.handleValidateNegativeControl;
    handleValidateCrossIdentity = serverModule.handleValidateCrossIdentity;
    handleValidatePromote = serverModule.handleValidatePromote;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleValidateRepro', () => {
    it('should return error when finding is missing', async () => {
      const result = await handleValidateRepro({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('finding is required');
      expect(result.isError).toBe(true);
    });

    it('should return error when finding_id is missing', async () => {
      const result = await handleValidateRepro({
        finding: {
          title: 'Test',
          request: { method: 'GET', url: 'http://test.com' },
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('finding_id');
    });

    it('should return error when request method is missing', async () => {
      const result = await handleValidateRepro({
        finding: {
          finding_id: 'F-001',
          title: 'Test',
          request: { url: 'http://test.com' },
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('method');
    });

    it('should run reproduction test successfully', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"token": "abc123"}'),
      });

      const result = await handleValidateRepro({
        finding: sampleFinding,
        count: 2,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.finding_id).toBe('F-001');
      expect(parsed.result.total_attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use default count when not specified', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"token": "abc123"}'),
      });

      const result = await handleValidateRepro({
        finding: sampleFinding,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.result.total_attempts).toBe(3); // Default from env
    });
  });

  describe('handleValidateNegativeControl', () => {
    it('should return error when finding is missing', async () => {
      const result = await handleValidateNegativeControl({
        control_config: { control_type: 'unauthenticated' },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should return error when control_config is missing', async () => {
      const result = await handleValidateNegativeControl({
        finding: sampleFinding,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should return error for invalid control_type', async () => {
      const result = await handleValidateNegativeControl({
        finding: sampleFinding,
        control_config: { control_type: 'invalid_type' },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid control_type');
    });

    it('should run negative control successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await handleValidateNegativeControl({
        finding: sampleFinding,
        control_config: {
          control_type: 'unauthenticated',
          remove_auth: true,
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.passed).toBe(true);
    });

    it('should detect failed negative control', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"data": "sensitive"}'),
      });

      const result = await handleValidateNegativeControl({
        finding: sampleFinding,
        control_config: {
          control_type: 'unauthenticated',
          remove_auth: true,
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result.passed).toBe(false);
    });
  });

  describe('handleValidateCrossIdentity', () => {
    it('should return error when finding is missing', async () => {
      const result = await handleValidateCrossIdentity({
        identities: [{ identity_id: 'user1', should_have_access: true }],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should return error when identities is missing', async () => {
      const result = await handleValidateCrossIdentity({
        finding: sampleFinding,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should return error for empty identities array', async () => {
      const result = await handleValidateCrossIdentity({
        finding: sampleFinding,
        identities: [],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('non-empty');
    });

    it('should return error when identity missing required fields', async () => {
      const result = await handleValidateCrossIdentity({
        finding: sampleFinding,
        identities: [{ identity_id: 'user1' }],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('should_have_access');
    });

    it('should run cross-identity test successfully', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{}') })
        .mockResolvedValueOnce({ status: 403, text: () => Promise.resolve('Forbidden') });

      const result = await handleValidateCrossIdentity({
        finding: sampleFinding,
        identities: [
          { identity_id: 'admin', auth_header: 'Bearer admin', auth_type: 'bearer', should_have_access: true },
          { identity_id: 'user', auth_header: 'Bearer user', auth_type: 'bearer', should_have_access: false },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.identities_tested).toContain('admin');
      expect(parsed.result.identities_tested).toContain('user');
    });
  });

  describe('handleValidatePromote', () => {
    it('should return error when finding_id is missing', () => {
      const result = handleValidatePromote({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('finding_id is required');
    });

    it('should return error when no validation results provided', () => {
      const result = handleValidatePromote({
        finding_id: 'F-001',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('At least one validation result');
    });

    it('should calculate confidence with repro result', () => {
      const result = handleValidatePromote({
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 3,
          successful_attempts: 3,
          failed_attempts: 0,
          success_rate: 1.0,
          consistent: true,
          attempts: [],
        },
        negative_control_result: {
          finding_id: 'F-001',
          control_type: 'unauthenticated',
          passed: true,
          expected_behavior: 'Reject',
          actual_status: 401,
          actual_behavior: 'Rejected',
          message: 'Passed',
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.confidence).toBeDefined();
      expect(parsed.confidence.finding_id).toBe('F-001');
      expect(parsed.confidence.overall_score).toBeGreaterThan(0);
    });

    it('should include promoted flag in response', () => {
      const result = handleValidatePromote({
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 5,
          successful_attempts: 5,
          failed_attempts: 0,
          success_rate: 1.0,
          consistent: true,
          attempts: [],
        },
        negative_control_result: {
          finding_id: 'F-001',
          control_type: 'unauthenticated',
          passed: true,
          expected_behavior: 'Reject',
          actual_status: 401,
          actual_behavior: 'Rejected',
          message: 'Passed',
        },
        cross_identity_result: {
          finding_id: 'F-001',
          identities_tested: ['admin', 'user'],
          results: [],
          authorization_enforced: true,
          violations: [],
          message: 'Enforced',
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(typeof parsed.promoted).toBe('boolean');
    });

    it('should recommend dismiss for low scores', () => {
      const result = handleValidatePromote({
        finding_id: 'F-001',
        repro_result: {
          finding_id: 'F-001',
          total_attempts: 3,
          successful_attempts: 0,
          failed_attempts: 3,
          success_rate: 0,
          consistent: false,
          attempts: [],
        },
        negative_control_result: {
          finding_id: 'F-001',
          control_type: 'unauthenticated',
          passed: true,
          expected_behavior: 'Reject',
          actual_status: 401,
          actual_behavior: 'Rejected',
          message: 'Passed',
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.confidence.recommendation).toBe('dismiss');
      expect(parsed.promoted).toBe(false);
    });
  });

  describe('Response Format', () => {
    it('should return content array with text type', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      const result = await handleValidateRepro({
        finding: sampleFinding,
        count: 1,
      });

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in text content', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      const result = await handleValidateRepro({
        finding: sampleFinding,
        count: 1,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include success boolean in all responses', async () => {
      const result = await handleValidateRepro({});

      const parsed = JSON.parse(result.content[0].text);
      expect(typeof parsed.success).toBe('boolean');
    });

    it('should format JSON with indentation for success responses', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      const result = await handleValidateRepro({
        finding: sampleFinding,
        count: 1,
      });

      expect(result.content[0].text).toContain('\n');
    });
  });

  describe('Error Handling', () => {
    it('should set isError flag for validation errors', async () => {
      const result = await handleValidateRepro({});

      expect(result.isError).toBe(true);
    });

    it('should not set isError for successful requests', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      const result = await handleValidateRepro({
        finding: sampleFinding,
        count: 1,
      });

      expect(result.isError).toBeUndefined();
    });
  });
});
