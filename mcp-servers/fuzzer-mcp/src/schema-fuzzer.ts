/**
 * Schema Fuzzer
 * OpenAPI schema-based fuzzing with intelligent payload generation
 */

import {
  FuzzConfig,
  OpenAPISchema,
  EndpointDefinition,
  ParameterDefinition,
  ParameterLocation,
  HttpMethod,
  EndpointFuzzResult,
  ParameterFuzzResult,
  FuzzSignal,
  HttpResponse,
  PayloadType,
} from './types.js';
import { PayloadGenerator } from './payload-generator.js';
import { SignalDetector } from './signal-detector.js';
import { createHash } from 'crypto';

const DEFAULT_CONFIG: FuzzConfig = {
  maxPayloads: parseInt(process.env.MAX_PAYLOADS || '100', 10),
  maxRequestsPerEndpoint: parseInt(process.env.MAX_REQUESTS_PER_ENDPOINT || '500', 10),
  rateLimit: parseInt(process.env.RATE_LIMIT || '10', 10),
  timeout: parseInt(process.env.TIMEOUT || '30000', 10),
  baselineTimeout: parseInt(process.env.BASELINE_TIMEOUT || '10000', 10),
};

export class SchemaFuzzer {
  private config: FuzzConfig;
  private payloadGenerator: PayloadGenerator;
  private signalDetector: SignalDetector;
  private requestCount: number = 0;

  constructor(config: Partial<FuzzConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.payloadGenerator = new PayloadGenerator(this.config.maxPayloads);
    this.signalDetector = new SignalDetector();
  }

  /**
   * Parse OpenAPI schema to extract endpoints
   */
  parseOpenAPISchema(schema: OpenAPISchema): EndpointDefinition[] {
    const endpoints: EndpointDefinition[] = [];

    if (!schema.paths) return endpoints;

    for (const [path, methods] of Object.entries(schema.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
          continue;
        }

        const parameters: ParameterDefinition[] = [];

        // Parse path parameters
        if (operation.parameters) {
          for (const param of operation.parameters) {
            parameters.push(this.parseParameter(param));
          }
        }

        // Parse request body
        let requestBody: EndpointDefinition['requestBody'];
        if (operation.requestBody?.content) {
          const contentType = Object.keys(operation.requestBody.content)[0];
          const schema = operation.requestBody.content[contentType]?.schema || {};
          requestBody = { contentType, schema };

          // Extract body parameters from schema
          if (schema.properties) {
            for (const [name, propSchema] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
              parameters.push({
                name,
                location: 'body',
                type: (propSchema.type as string) || 'string',
                format: propSchema.format as string | undefined,
                required: Array.isArray(schema.required) && schema.required.includes(name),
                minimum: propSchema.minimum as number | undefined,
                maximum: propSchema.maximum as number | undefined,
                minLength: propSchema.minLength as number | undefined,
                maxLength: propSchema.maxLength as number | undefined,
                enum: propSchema.enum as unknown[] | undefined,
              });
            }
          }
        }

        endpoints.push({
          path,
          method: method.toUpperCase() as HttpMethod,
          parameters,
          requestBody,
        });
      }
    }

    return endpoints;
  }

  /**
   * Parse a single parameter from OpenAPI format
   */
  private parseParameter(param: {
    name: string;
    in: string;
    required?: boolean;
    schema?: Record<string, unknown>;
  }): ParameterDefinition {
    const schema = param.schema || {};

    return {
      name: param.name,
      location: param.in as ParameterLocation,
      type: (schema.type as string) || 'string',
      format: schema.format as string | undefined,
      required: param.required || false,
      minimum: schema.minimum as number | undefined,
      maximum: schema.maximum as number | undefined,
      minLength: schema.minLength as number | undefined,
      maxLength: schema.maxLength as number | undefined,
      enum: schema.enum as unknown[] | undefined,
      pattern: schema.pattern as string | undefined,
      default: schema.default,
    };
  }

  /**
   * Fuzz a single parameter
   */
  async fuzzParameter(
    endpoint: string,
    method: HttpMethod,
    parameter: ParameterDefinition,
    options: {
      payloadTypes?: PayloadType[];
      headers?: Record<string, string>;
      mockMode?: boolean;
    } = {}
  ): Promise<ParameterFuzzResult> {
    const payloads = this.payloadGenerator.generateForParameter(
      parameter,
      options.payloadTypes
    );

    const signals: FuzzSignal[] = [];
    let baselineResponse: HttpResponse | undefined;

    // Get baseline response with valid/default value
    if (!options.mockMode) {
      baselineResponse = await this.makeRequest(
        endpoint,
        method,
        parameter,
        parameter.default ?? this.getDefaultValue(parameter),
        options.headers
      );
    } else {
      baselineResponse = this.getMockBaseline();
    }

    // Fuzz with each payload
    for (const payload of payloads) {
      if (this.requestCount >= this.config.maxRequestsPerEndpoint) {
        break;
      }

      let response: HttpResponse;

      if (options.mockMode) {
        response = this.getMockResponse(payload.value, payload.type);
      } else {
        response = await this.makeRequest(
          endpoint,
          method,
          parameter,
          payload.value,
          options.headers
        );
      }

      this.requestCount++;

      // Detect signals
      const detectedSignals = this.signalDetector.detectSignals(
        response,
        String(payload.value),
        payload.type,
        baselineResponse
      );

      signals.push(...detectedSignals);
    }

    return {
      endpoint,
      parameter: parameter.name,
      parameter_type: parameter.type,
      payloads_sent: Math.min(payloads.length, this.config.maxRequestsPerEndpoint),
      signals,
      baseline_response_time_ms: baselineResponse?.timing_ms,
      baseline_status: baselineResponse?.status,
      baseline_response_hash: baselineResponse ? this.hashResponse(baselineResponse.body) : undefined,
    };
  }

  /**
   * Fuzz all parameters of an endpoint
   */
  async fuzzEndpoint(
    endpoint: string,
    method: HttpMethod,
    parameters: ParameterDefinition[],
    options: {
      payloadTypes?: PayloadType[];
      headers?: Record<string, string>;
      mockMode?: boolean;
    } = {}
  ): Promise<EndpointFuzzResult> {
    const startTime = Date.now();
    const parameterResults: ParameterFuzzResult[] = [];
    let totalSignals = 0;
    let totalPayloads = 0;

    this.requestCount = 0; // Reset per endpoint

    for (const param of parameters) {
      if (this.requestCount >= this.config.maxRequestsPerEndpoint) {
        break;
      }

      const result = await this.fuzzParameter(endpoint, method, param, options);
      parameterResults.push(result);
      totalSignals += result.signals.length;
      totalPayloads += result.payloads_sent;
    }

    return {
      endpoint,
      method,
      parameters_fuzzed: parameterResults.length,
      total_payloads_sent: totalPayloads,
      total_signals: totalSignals,
      parameter_results: parameterResults,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Make an HTTP request (to be implemented/mocked)
   */
  private async makeRequest(
    endpoint: string,
    method: HttpMethod,
    parameter: ParameterDefinition,
    value: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse> {
    // This would normally make an actual HTTP request
    // For now, return a mock response
    return this.getMockResponse(value, 'boundary');
  }

  /**
   * Get mock baseline response
   */
  private getMockBaseline(): HttpResponse {
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"status":"ok"}',
      timing_ms: 50,
    };
  }

  /**
   * Get mock response based on payload (for testing)
   */
  private getMockResponse(value: unknown, payloadType: PayloadType): HttpResponse {
    const valueStr = String(value);

    // Simulate error responses for certain payloads
    if (valueStr.includes("'") && payloadType === 'injection') {
      return {
        status: 500,
        headers: { 'content-type': 'text/html' },
        body: 'Error: You have an error in your SQL syntax near "\'..."',
        timing_ms: 100,
      };
    }

    if (valueStr.includes('<script>') && payloadType === 'injection') {
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: `<html><body>Search results for: ${valueStr}</body></html>`,
        timing_ms: 50,
      };
    }

    if (valueStr.length > 10000) {
      return {
        status: 500,
        headers: { 'content-type': 'text/plain' },
        body: 'Internal Server Error: Request entity too large',
        timing_ms: 2000,
      };
    }

    if (valueStr.includes('sleep') || valueStr.includes('WAITFOR')) {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"status":"ok"}',
        timing_ms: 5000, // Simulate time-based injection
      };
    }

    // Default response
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"status":"ok"}',
      timing_ms: 50 + Math.random() * 50,
    };
  }

  /**
   * Get default value for a parameter type
   */
  private getDefaultValue(param: ParameterDefinition): unknown {
    if (param.default !== undefined) return param.default;
    if (param.enum && param.enum.length > 0) return param.enum[0];

    switch (param.type.toLowerCase()) {
      case 'integer':
      case 'number':
        return param.minimum ?? 0;
      case 'boolean':
        return false;
      case 'string':
        return 'test';
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return '';
    }
  }

  /**
   * Hash response body
   */
  private hashResponse(body: string): string {
    return createHash('sha256').update(body).digest('hex').substring(0, 16);
  }

  /**
   * Get configuration
   */
  getConfig(): FuzzConfig {
    return { ...this.config };
  }

  /**
   * Get request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset request count
   */
  resetRequestCount(): void {
    this.requestCount = 0;
  }

  /**
   * Get payload generator
   */
  getPayloadGenerator(): PayloadGenerator {
    return this.payloadGenerator;
  }

  /**
   * Get signal detector
   */
  getSignalDetector(): SignalDetector {
    return this.signalDetector;
  }
}

// Export a default instance
export const schemaFuzzer = new SchemaFuzzer();
