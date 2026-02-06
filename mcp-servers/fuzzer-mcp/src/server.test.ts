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

describe('Fuzzer MCP Server', () => {
  let handleFuzzEndpoint: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  let handleFuzzParameter: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
  let handleListPayloads: (args: Record<string, unknown>) => {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const serverModule = await import('./server.js');
    handleFuzzEndpoint = serverModule.handleFuzzEndpoint;
    handleFuzzParameter = serverModule.handleFuzzParameter;
    handleListPayloads = serverModule.handleListPayloads;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleFuzzEndpoint', () => {
    it('should return error when endpoint is missing', async () => {
      const result = await handleFuzzEndpoint({
        method: 'GET',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('endpoint is required');
      expect(result.isError).toBe(true);
    });

    it('should return error when method is missing', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('method is required');
      expect(result.isError).toBe(true);
    });

    it('should return error for invalid method', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'INVALID',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid method');
      expect(result.isError).toBe(true);
    });

    it('should return error for invalid URL', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'not-a-valid-url',
        method: 'GET',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid endpoint URL');
      expect(result.isError).toBe(true);
    });

    it('should fuzz endpoint successfully with minimal parameters', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBeDefined();
      expect(parsed.warning).toContain('mock mode');
    });

    it('should fuzz endpoint with custom parameters', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'POST',
        parameters: [
          { name: 'query', location: 'body', type: 'string' },
          { name: 'limit', location: 'query', type: 'integer' },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result.parameters_fuzzed).toBe(2);
    });

    it('should filter by payload types', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
        payload_types: ['boundary', 'injection'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should include summary in result', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.result.total_payloads_sent).toBeDefined();
      expect(parsed.result.total_signals).toBeDefined();
      expect(parsed.result.duration_ms).toBeDefined();
    });
  });

  describe('handleFuzzParameter', () => {
    const validParameter = {
      name: 'query',
      location: 'query',
      type: 'string',
    };

    it('should return error when endpoint is missing', async () => {
      const result = await handleFuzzParameter({
        method: 'GET',
        parameter: validParameter,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('endpoint is required');
      expect(result.isError).toBe(true);
    });

    it('should return error when method is missing', async () => {
      const result = await handleFuzzParameter({
        endpoint: 'https://api.example.com/search',
        parameter: validParameter,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('method is required');
      expect(result.isError).toBe(true);
    });

    it('should return error when parameter is missing', async () => {
      const result = await handleFuzzParameter({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('parameter is required');
      expect(result.isError).toBe(true);
    });

    it('should return error for invalid parameter structure', async () => {
      const result = await handleFuzzParameter({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
        parameter: { name: 'test' }, // Missing location and type
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('name, location, and type');
      expect(result.isError).toBe(true);
    });

    it('should return error for invalid parameter location', async () => {
      const result = await handleFuzzParameter({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
        parameter: {
          name: 'test',
          location: 'invalid',
          type: 'string',
        },
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid parameter location');
      expect(result.isError).toBe(true);
    });

    it('should fuzz parameter successfully', async () => {
      const result = await handleFuzzParameter({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
        parameter: validParameter,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.parameter).toBe('query');
      expect(parsed.warning).toContain('mock mode');
    });

    it('should filter by payload types', async () => {
      const result = await handleFuzzParameter({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
        parameter: validParameter,
        payload_types: ['injection'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should include signals in result', async () => {
      const result = await handleFuzzParameter({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
        parameter: validParameter,
        payload_types: ['injection'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.result.signals).toBeDefined();
      expect(Array.isArray(parsed.result.signals)).toBe(true);
    });
  });

  describe('handleListPayloads', () => {
    it('should list all payload types when no type specified', () => {
      const result = handleListPayloads({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.payload_types.length).toBe(5);
      expect(parsed.total_types).toBe(5);
    });

    it('should list specific payload type', () => {
      const result = handleListPayloads({ type: 'injection' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.payload_types).toHaveLength(1);
      expect(parsed.payload_types[0].type).toBe('injection');
    });

    it('should return error for invalid payload type', () => {
      const result = handleListPayloads({ type: 'invalid' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid payload type');
      expect(result.isError).toBe(true);
    });

    it('should include description for each type', () => {
      const result = handleListPayloads({});

      const parsed = JSON.parse(result.content[0].text);
      parsed.payload_types.forEach((pt: { description: string }) => {
        expect(pt.description).toBeDefined();
        expect(pt.description.length).toBeGreaterThan(0);
      });
    });

    it('should include examples for each type', () => {
      const result = handleListPayloads({});

      const parsed = JSON.parse(result.content[0].text);
      parsed.payload_types.forEach((pt: { examples: string[] }) => {
        expect(pt.examples).toBeDefined();
        expect(Array.isArray(pt.examples)).toBe(true);
        expect(pt.examples.length).toBeGreaterThan(0);
      });
    });

    it('should include risk level for each type', () => {
      const result = handleListPayloads({});

      const parsed = JSON.parse(result.content[0].text);
      parsed.payload_types.forEach((pt: { risk_level: string }) => {
        expect(pt.risk_level).toBeDefined();
        expect(['high', 'medium', 'low', 'unknown']).toContain(pt.risk_level);
      });
    });

    it('should mark injection as high risk', () => {
      const result = handleListPayloads({ type: 'injection' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.payload_types[0].risk_level).toBe('high');
    });

    it('should mark boundary as low risk', () => {
      const result = handleListPayloads({ type: 'boundary' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.payload_types[0].risk_level).toBe('low');
    });
  });

  describe('Response Format', () => {
    it('should return content array with text type', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
      });

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in text content', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include success boolean in all responses', async () => {
      const result = await handleFuzzEndpoint({});

      const parsed = JSON.parse(result.content[0].text);
      expect(typeof parsed.success).toBe('boolean');
    });

    it('should format JSON with indentation for success responses', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
      });

      expect(result.content[0].text).toContain('\n');
    });
  });

  describe('Error Handling', () => {
    it('should set isError flag for validation errors', async () => {
      const result = await handleFuzzEndpoint({});

      expect(result.isError).toBe(true);
    });

    it('should not set isError for successful requests', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/search',
        method: 'GET',
      });

      expect(result.isError).toBeUndefined();
    });

    it('should include error message in response', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'invalid-url',
        method: 'GET',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('HTTP Methods', () => {
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    validMethods.forEach(method => {
      it(`should accept ${method} method`, async () => {
        const result = await handleFuzzEndpoint({
          endpoint: 'https://api.example.com/test',
          method,
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
      });
    });

    it('should accept lowercase method', async () => {
      const result = await handleFuzzEndpoint({
        endpoint: 'https://api.example.com/test',
        method: 'get',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Parameter Locations', () => {
    const validLocations = ['query', 'path', 'header', 'body', 'cookie'];

    validLocations.forEach(location => {
      it(`should accept ${location} parameter location`, async () => {
        const result = await handleFuzzParameter({
          endpoint: 'https://api.example.com/test',
          method: 'POST',
          parameter: {
            name: 'test',
            location,
            type: 'string',
          },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.success).toBe(true);
      });
    });
  });
});
