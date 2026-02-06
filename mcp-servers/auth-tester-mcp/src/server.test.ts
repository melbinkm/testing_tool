import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestIdentity } from './identity-store.js';

// Mock identity store module
const mockIdentityStore = {
  loadFromFile: vi.fn(),
  loadFromJson: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  getAuthHeaders: vi.fn(),
  count: vi.fn(),
  clear: vi.fn(),
};

vi.mock('./identity-store.js', () => ({
  IdentityStore: vi.fn().mockImplementation(() => mockIdentityStore),
}));

// Mock diff tester module
const mockDiffTester = {
  hashResponse: vi.fn(),
  analyzeResults: vi.fn(),
};

vi.mock('./diff-tester.js', () => ({
  DifferentialTester: vi.fn().mockImplementation(() => mockDiffTester),
}));

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

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Sample test data
const sampleIdentities: TestIdentity[] = [
  {
    identity_id: 'admin',
    label: 'Admin User',
    roles: ['admin', 'user'],
    tenant_id: 'tenant-001',
    auth_type: 'bearer',
    auth_header: 'Bearer admin-token',
  },
  {
    identity_id: 'user',
    label: 'Regular User',
    roles: ['user'],
    tenant_id: 'tenant-001',
    auth_type: 'bearer',
    auth_header: 'Bearer user-token',
  },
];

describe('Auth Tester MCP Server', () => {
  let handleGetIdentities: () => { content: Array<{ type: string; text: string }> };
  let handleDiffTest: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  let handleReplayWithIdentity: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockIdentityStore.loadFromFile.mockReset();
    mockIdentityStore.get.mockReset();
    mockIdentityStore.list.mockReturnValue([]);
    mockIdentityStore.getAuthHeaders.mockReset();
    mockIdentityStore.count.mockReturnValue(0);
    mockFetch.mockReset();
    mockDiffTester.hashResponse.mockReturnValue('mock-hash-123');
    mockDiffTester.analyzeResults.mockReset();

    // Import server module to get the handler functions
    const serverModule = await import('./server.js');
    handleGetIdentities = serverModule.handleGetIdentities;
    handleDiffTest = serverModule.handleDiffTest;
    handleReplayWithIdentity = serverModule.handleReplayWithIdentity;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleGetIdentities', () => {
    it('should return empty list when no identities loaded', () => {
      mockIdentityStore.list.mockReturnValue([]);

      const result = handleGetIdentities();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(0);
      expect(parsed.identities).toEqual([]);
    });

    it('should return loaded identities', () => {
      mockIdentityStore.list.mockReturnValue(sampleIdentities);

      const result = handleGetIdentities();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
      expect(parsed.identities).toHaveLength(2);
    });

    it('should sanitize auth_header from response', () => {
      mockIdentityStore.list.mockReturnValue(sampleIdentities);

      const result = handleGetIdentities();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.identities[0].auth_header).toBeUndefined();
      expect(parsed.identities[0].identity_id).toBe('admin');
      expect(parsed.identities[0].label).toBe('Admin User');
    });

    it('should include auth_type in response', () => {
      mockIdentityStore.list.mockReturnValue(sampleIdentities);

      const result = handleGetIdentities();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.identities[0].auth_type).toBe('bearer');
    });
  });

  describe('handleDiffTest', () => {
    beforeEach(() => {
      mockIdentityStore.get.mockImplementation((id: string) => {
        return sampleIdentities.find((i) => i.identity_id === id);
      });
      mockIdentityStore.list.mockReturnValue(sampleIdentities);
      mockIdentityStore.getAuthHeaders.mockImplementation((id: string) => {
        const identity = sampleIdentities.find((i) => i.identity_id === id);
        return { Authorization: identity?.auth_header || '' };
      });
    });

    it('should return error when method is missing', async () => {
      const result = await handleDiffTest({
        url: 'https://api.example.com/test',
        identity_ids: ['admin'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
      expect(result.isError).toBe(true);
    });

    it('should return error when url is missing', async () => {
      const result = await handleDiffTest({
        method: 'GET',
        identity_ids: ['admin'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should return error when identity_ids is missing', async () => {
      const result = await handleDiffTest({
        method: 'GET',
        url: 'https://api.example.com/test',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should execute test with multiple identities', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"data": "test"}'),
      });

      mockDiffTester.analyzeResults.mockReturnValue({
        request: { method: 'GET', url: 'https://api.example.com/test' },
        results: [],
        analysis: {
          status_codes_differ: false,
          response_lengths_differ: false,
          potential_bola: false,
          potential_idor: false,
          recommendation: 'No issues found',
        },
      });

      const result = await handleDiffTest({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_ids: ['admin', 'user'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return error for unknown identity IDs', async () => {
      const result = await handleDiffTest({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_ids: ['admin', 'nonexistent'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Unknown identity IDs');
      expect(parsed.error).toContain('nonexistent');
    });

    it('should return error when no valid identities provided', async () => {
      mockIdentityStore.get.mockReturnValue(undefined);

      const result = await handleDiffTest({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_ids: ['nonexistent1', 'nonexistent2'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Unknown identity IDs');
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      mockDiffTester.analyzeResults.mockReturnValue({
        request: { method: 'GET', url: 'https://api.example.com/test' },
        results: [],
        analysis: {
          status_codes_differ: false,
          response_lengths_differ: false,
          potential_bola: false,
          potential_idor: false,
          recommendation: 'All requests failed',
        },
      });

      const result = await handleDiffTest({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_ids: ['admin'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toBeDefined();
    });

    it('should include headers in request', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      mockDiffTester.analyzeResults.mockReturnValue({
        request: { method: 'GET', url: 'https://api.example.com/test' },
        results: [],
        analysis: {
          status_codes_differ: false,
          response_lengths_differ: false,
          potential_bola: false,
          potential_idor: false,
          recommendation: 'No issues',
        },
      });

      await handleDiffTest({
        method: 'GET',
        url: 'https://api.example.com/test',
        headers: { 'X-Custom-Header': 'test-value' },
        identity_ids: ['admin'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Custom-Header': 'test-value',
          }),
        })
      );
    });

    it('should include body for POST requests', async () => {
      mockFetch.mockResolvedValue({
        status: 201,
        text: () => Promise.resolve('{"created": true}'),
      });

      mockDiffTester.analyzeResults.mockReturnValue({
        request: { method: 'POST', url: 'https://api.example.com/test' },
        results: [],
        analysis: {
          status_codes_differ: false,
          response_lengths_differ: false,
          potential_bola: false,
          potential_idor: false,
          recommendation: 'No issues',
        },
      });

      await handleDiffTest({
        method: 'POST',
        url: 'https://api.example.com/test',
        body: '{"name": "test"}',
        identity_ids: ['admin'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          body: '{"name": "test"}',
        })
      );
    });
  });

  describe('handleReplayWithIdentity', () => {
    beforeEach(() => {
      mockIdentityStore.get.mockImplementation((id: string) => {
        return sampleIdentities.find((i) => i.identity_id === id);
      });
      mockIdentityStore.list.mockReturnValue(sampleIdentities);
      mockIdentityStore.getAuthHeaders.mockImplementation((id: string) => {
        const identity = sampleIdentities.find((i) => i.identity_id === id);
        return { Authorization: identity?.auth_header || '' };
      });
    });

    it('should return error when method is missing', async () => {
      const result = await handleReplayWithIdentity({
        url: 'https://api.example.com/test',
        identity_id: 'admin',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should return error when url is missing', async () => {
      const result = await handleReplayWithIdentity({
        method: 'GET',
        identity_id: 'admin',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should return error when identity_id is missing', async () => {
      const result = await handleReplayWithIdentity({
        method: 'GET',
        url: 'https://api.example.com/test',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('required');
    });

    it('should replay request with specific identity', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"user": "admin"}'),
      });

      const result = await handleReplayWithIdentity({
        method: 'GET',
        url: 'https://api.example.com/me',
        identity_id: 'admin',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.status_code).toBe(200);
      expect(parsed.identity.identity_id).toBe('admin');
    });

    it('should return error for unknown identity', async () => {
      const result = await handleReplayWithIdentity({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_id: 'nonexistent',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Identity not found');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await handleReplayWithIdentity({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_id: 'admin',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result.error).toBe('Connection refused');
      expect(parsed.result.status_code).toBe(0);
    });

    it('should include request details in response', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      const result = await handleReplayWithIdentity({
        method: 'POST',
        url: 'https://api.example.com/data',
        headers: { 'Content-Type': 'application/json' },
        body: '{"test": true}',
        identity_id: 'admin',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.request.method).toBe('POST');
      expect(parsed.request.url).toBe('https://api.example.com/data');
    });

    it('should include timing in result', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      const result = await handleReplayWithIdentity({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_id: 'admin',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(typeof parsed.result.timing_ms).toBe('number');
    });

    it('should include identity info in response', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{}'),
      });

      const result = await handleReplayWithIdentity({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_id: 'admin',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.identity.identity_id).toBe('admin');
      expect(parsed.identity.label).toBe('Admin User');
      expect(parsed.identity.roles).toContain('admin');
    });
  });

  describe('Response Format', () => {
    it('should return content array with text type', () => {
      mockIdentityStore.list.mockReturnValue([]);

      const result = handleGetIdentities();

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in text content', () => {
      mockIdentityStore.list.mockReturnValue(sampleIdentities);

      const result = handleGetIdentities();

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include success boolean in all responses', () => {
      mockIdentityStore.list.mockReturnValue([]);

      const result = handleGetIdentities();

      const parsed = JSON.parse(result.content[0].text);
      expect(typeof parsed.success).toBe('boolean');
    });

    it('should format JSON with indentation', () => {
      mockIdentityStore.list.mockReturnValue(sampleIdentities);

      const result = handleGetIdentities();

      expect(result.content[0].text).toContain('\n');
    });
  });

  describe('Error Handling', () => {
    it('should include available identities in error for unknown identity', async () => {
      mockIdentityStore.list.mockReturnValue(sampleIdentities);

      const result = await handleReplayWithIdentity({
        method: 'GET',
        url: 'https://api.example.com/test',
        identity_id: 'nonexistent',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.available_identities).toBeDefined();
      expect(parsed.available_identities).toContain('admin');
      expect(parsed.available_identities).toContain('user');
    });

    it('should set isError flag for validation errors', async () => {
      const result = await handleDiffTest({});

      expect(result.isError).toBe(true);
    });
  });
});
