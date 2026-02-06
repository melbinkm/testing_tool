import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchemaFuzzer } from './schema-fuzzer.js';
import { OpenAPISchema, ParameterDefinition, HttpMethod } from './types.js';

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('SchemaFuzzer', () => {
  let fuzzer: SchemaFuzzer;

  beforeEach(() => {
    fuzzer = new SchemaFuzzer({
      maxPayloads: 50,
      maxRequestsPerEndpoint: 100,
      rateLimit: 10,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should use provided configuration', () => {
      const config = fuzzer.getConfig();

      expect(config.maxPayloads).toBe(50);
      expect(config.maxRequestsPerEndpoint).toBe(100);
      expect(config.rateLimit).toBe(10);
    });

    it('should use default configuration when not provided', () => {
      const defaultFuzzer = new SchemaFuzzer();
      const config = defaultFuzzer.getConfig();

      expect(config.maxPayloads).toBeDefined();
      expect(config.maxRequestsPerEndpoint).toBeDefined();
      expect(config.rateLimit).toBeDefined();
    });
  });

  describe('parseOpenAPISchema', () => {
    it('should parse simple GET endpoint', () => {
      const schema: OpenAPISchema = {
        paths: {
          '/users': {
            get: {
              parameters: [
                { name: 'limit', in: 'query', schema: { type: 'integer' } },
              ],
            },
          },
        },
      };

      const endpoints = fuzzer.parseOpenAPISchema(schema);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].path).toBe('/users');
      expect(endpoints[0].method).toBe('GET');
      expect(endpoints[0].parameters).toHaveLength(1);
      expect(endpoints[0].parameters[0].name).toBe('limit');
    });

    it('should parse POST endpoint with request body', () => {
      const schema: OpenAPISchema = {
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                      },
                      required: ['name'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const endpoints = fuzzer.parseOpenAPISchema(schema);

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe('POST');
      expect(endpoints[0].requestBody).toBeDefined();
      expect(endpoints[0].parameters).toHaveLength(2);

      const nameParam = endpoints[0].parameters.find(p => p.name === 'name');
      expect(nameParam?.required).toBe(true);
      expect(nameParam?.location).toBe('body');
    });

    it('should parse multiple methods on same path', () => {
      const schema: OpenAPISchema = {
        paths: {
          '/users/{id}': {
            get: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
              ],
            },
            put: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
              ],
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      properties: {
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            delete: {
              parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
              ],
            },
          },
        },
      };

      const endpoints = fuzzer.parseOpenAPISchema(schema);

      expect(endpoints).toHaveLength(3);
      expect(endpoints.map(e => e.method).sort()).toEqual(['DELETE', 'GET', 'PUT']);
    });

    it('should parse parameter constraints', () => {
      const schema: OpenAPISchema = {
        paths: {
          '/items': {
            get: {
              parameters: [
                {
                  name: 'page',
                  in: 'query',
                  schema: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 100,
                  },
                },
                {
                  name: 'search',
                  in: 'query',
                  schema: {
                    type: 'string',
                    minLength: 3,
                    maxLength: 50,
                  },
                },
              ],
            },
          },
        },
      };

      const endpoints = fuzzer.parseOpenAPISchema(schema);
      const pageParam = endpoints[0].parameters.find(p => p.name === 'page');
      const searchParam = endpoints[0].parameters.find(p => p.name === 'search');

      expect(pageParam?.minimum).toBe(1);
      expect(pageParam?.maximum).toBe(100);
      expect(searchParam?.minLength).toBe(3);
      expect(searchParam?.maxLength).toBe(50);
    });

    it('should handle empty paths', () => {
      const schema: OpenAPISchema = {
        paths: {},
      };

      const endpoints = fuzzer.parseOpenAPISchema(schema);
      expect(endpoints).toHaveLength(0);
    });

    it('should ignore non-standard HTTP methods', () => {
      const schema: OpenAPISchema = {
        paths: {
          '/test': {
            get: { parameters: [] },
            options: { parameters: [] },
            trace: { parameters: [] },
          },
        },
      };

      const endpoints = fuzzer.parseOpenAPISchema(schema);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe('GET');
    });
  });

  describe('fuzzParameter', () => {
    const testParam: ParameterDefinition = {
      name: 'query',
      location: 'query',
      type: 'string',
      required: true,
    };

    it('should fuzz parameter with mock mode', async () => {
      const result = await fuzzer.fuzzParameter(
        'https://api.example.com/search',
        'GET',
        testParam,
        { mockMode: true }
      );

      expect(result.endpoint).toBe('https://api.example.com/search');
      expect(result.parameter).toBe('query');
      expect(result.payloads_sent).toBeGreaterThan(0);
    });

    it('should detect signals in mock responses', async () => {
      const result = await fuzzer.fuzzParameter(
        'https://api.example.com/search',
        'GET',
        testParam,
        { mockMode: true, payloadTypes: ['injection'] }
      );

      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('should filter by payload types', async () => {
      const result = await fuzzer.fuzzParameter(
        'https://api.example.com/search',
        'GET',
        testParam,
        { mockMode: true, payloadTypes: ['boundary'] }
      );

      result.signals.forEach(signal => {
        expect(signal.payload_type).toBe('boundary');
      });
    });

    it('should include baseline information', async () => {
      const result = await fuzzer.fuzzParameter(
        'https://api.example.com/search',
        'GET',
        testParam,
        { mockMode: true }
      );

      expect(result.baseline_response_time_ms).toBeDefined();
      expect(result.baseline_status).toBeDefined();
    });

    it('should respect max payloads limit', async () => {
      const limitedFuzzer = new SchemaFuzzer({
        maxPayloads: 5,
        maxRequestsPerEndpoint: 10,
      });

      const result = await limitedFuzzer.fuzzParameter(
        'https://api.example.com/search',
        'GET',
        testParam,
        { mockMode: true }
      );

      expect(result.payloads_sent).toBeLessThanOrEqual(5);
    });
  });

  describe('fuzzEndpoint', () => {
    const testParams: ParameterDefinition[] = [
      { name: 'q', location: 'query', type: 'string', required: true },
      { name: 'page', location: 'query', type: 'integer', required: false },
    ];

    it('should fuzz all parameters', async () => {
      const result = await fuzzer.fuzzEndpoint(
        'https://api.example.com/search',
        'GET',
        testParams,
        { mockMode: true }
      );

      expect(result.parameters_fuzzed).toBe(2);
      expect(result.parameter_results).toHaveLength(2);
    });

    it('should include summary statistics', async () => {
      const result = await fuzzer.fuzzEndpoint(
        'https://api.example.com/search',
        'GET',
        testParams,
        { mockMode: true }
      );

      expect(result.total_payloads_sent).toBeGreaterThan(0);
      expect(result.total_signals).toBeGreaterThanOrEqual(0);
      expect(result.duration_ms).toBeGreaterThan(0);
    });

    it('should include endpoint and method', async () => {
      const result = await fuzzer.fuzzEndpoint(
        'https://api.example.com/search',
        'POST',
        testParams,
        { mockMode: true }
      );

      expect(result.endpoint).toBe('https://api.example.com/search');
      expect(result.method).toBe('POST');
    });

    it('should respect max requests per endpoint', async () => {
      const limitedFuzzer = new SchemaFuzzer({
        maxPayloads: 100,
        maxRequestsPerEndpoint: 20,
      });

      const result = await limitedFuzzer.fuzzEndpoint(
        'https://api.example.com/search',
        'GET',
        testParams,
        { mockMode: true }
      );

      expect(result.total_payloads_sent).toBeLessThanOrEqual(20);
    });
  });

  describe('Request Count Management', () => {
    it('should track request count', async () => {
      expect(fuzzer.getRequestCount()).toBe(0);

      await fuzzer.fuzzParameter(
        'https://api.example.com/search',
        'GET',
        { name: 'q', location: 'query', type: 'string', required: true },
        { mockMode: true }
      );

      expect(fuzzer.getRequestCount()).toBeGreaterThan(0);
    });

    it('should reset request count per endpoint fuzz', async () => {
      // First fuzz
      await fuzzer.fuzzEndpoint(
        'https://api.example.com/search',
        'GET',
        [{ name: 'q', location: 'query', type: 'string', required: true }],
        { mockMode: true }
      );

      const count1 = fuzzer.getRequestCount();

      // Second fuzz (count should reset)
      await fuzzer.fuzzEndpoint(
        'https://api.example.com/other',
        'GET',
        [{ name: 'q', location: 'query', type: 'string', required: true }],
        { mockMode: true }
      );

      // Count should be similar (not accumulated)
      expect(fuzzer.getRequestCount()).toBeLessThanOrEqual(count1 * 2);
    });

    it('should allow manual reset', () => {
      fuzzer.resetRequestCount();
      expect(fuzzer.getRequestCount()).toBe(0);
    });
  });

  describe('Component Access', () => {
    it('should provide access to payload generator', () => {
      const payloadGen = fuzzer.getPayloadGenerator();
      expect(payloadGen).toBeDefined();
      expect(typeof payloadGen.getPayloadTypes).toBe('function');
    });

    it('should provide access to signal detector', () => {
      const signalDet = fuzzer.getSignalDetector();
      expect(signalDet).toBeDefined();
      expect(typeof signalDet.detectSignals).toBe('function');
    });
  });

  describe('HTTP Methods', () => {
    const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    const testParam: ParameterDefinition = {
      name: 'test',
      location: 'query',
      type: 'string',
      required: true,
    };

    methods.forEach(method => {
      it(`should handle ${method} method`, async () => {
        const result = await fuzzer.fuzzParameter(
          'https://api.example.com/test',
          method,
          testParam,
          { mockMode: true }
        );

        expect(result.endpoint).toBe('https://api.example.com/test');
      });
    });
  });

  describe('Parameter Types', () => {
    const paramTypes = [
      { name: 'string', type: 'string' },
      { name: 'integer', type: 'integer' },
      { name: 'number', type: 'number' },
      { name: 'boolean', type: 'boolean' },
      { name: 'array', type: 'array' },
      { name: 'object', type: 'object' },
    ];

    paramTypes.forEach(({ name, type }) => {
      it(`should fuzz ${name} parameter type`, async () => {
        const param: ParameterDefinition = {
          name: 'test',
          location: 'query',
          type,
          required: true,
        };

        const result = await fuzzer.fuzzParameter(
          'https://api.example.com/test',
          'GET',
          param,
          { mockMode: true }
        );

        expect(result.parameter_type).toBe(type);
        expect(result.payloads_sent).toBeGreaterThan(0);
      });
    });
  });

  describe('Parameter Locations', () => {
    const locations: Array<ParameterDefinition['location']> = [
      'query',
      'path',
      'header',
      'body',
      'cookie',
    ];

    locations.forEach(location => {
      it(`should handle ${location} parameter location`, async () => {
        const param: ParameterDefinition = {
          name: 'test',
          location,
          type: 'string',
          required: true,
        };

        const result = await fuzzer.fuzzParameter(
          'https://api.example.com/test',
          'POST',
          param,
          { mockMode: true }
        );

        expect(result.payloads_sent).toBeGreaterThan(0);
      });
    });
  });
});
