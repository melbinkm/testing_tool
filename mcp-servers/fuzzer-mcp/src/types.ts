/**
 * Types for the Fuzzer MCP Server
 */

/**
 * Configuration for the fuzzer
 */
export interface FuzzConfig {
  maxPayloads: number;
  maxRequestsPerEndpoint: number;
  rateLimit: number;
  timeout: number;
  baselineTimeout: number;
}

/**
 * Types of payloads that can be generated
 */
export type PayloadType = 'boundary' | 'type_confusion' | 'injection' | 'format' | 'overflow';

/**
 * Signal types detected from responses
 */
export type SignalType = 'error' | 'timing' | 'reflection' | 'differential';

/**
 * Severity of detected signals
 */
export type SignalSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * A generated fuzz payload
 */
export interface FuzzPayload {
  value: unknown;
  type: PayloadType;
  description: string;
  risk_indicator?: string;
}

/**
 * A signal detected from a fuzz response
 */
export interface FuzzSignal {
  payload: string;
  payload_type: PayloadType;
  response_status: number;
  response_time_ms: number;
  signal_type: SignalType;
  severity: SignalSeverity;
  confidence: number;
  evidence?: string;
  details?: string;
}

/**
 * Result of fuzzing a single parameter
 */
export interface ParameterFuzzResult {
  endpoint: string;
  parameter: string;
  parameter_type: string;
  payloads_sent: number;
  signals: FuzzSignal[];
  baseline_response_time_ms?: number;
  baseline_status?: number;
  baseline_response_hash?: string;
}

/**
 * Result of fuzzing an entire endpoint
 */
export interface EndpointFuzzResult {
  endpoint: string;
  method: string;
  parameters_fuzzed: number;
  total_payloads_sent: number;
  total_signals: number;
  parameter_results: ParameterFuzzResult[];
  duration_ms: number;
}

/**
 * HTTP methods supported for fuzzing
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Parameter location in the request
 */
export type ParameterLocation = 'query' | 'path' | 'header' | 'body' | 'cookie';

/**
 * OpenAPI parameter definition
 */
export interface ParameterDefinition {
  name: string;
  location: ParameterLocation;
  type: string;
  format?: string;
  required: boolean;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
}

/**
 * OpenAPI endpoint definition
 */
export interface EndpointDefinition {
  path: string;
  method: HttpMethod;
  parameters: ParameterDefinition[];
  requestBody?: {
    contentType: string;
    schema: Record<string, unknown>;
  };
}

/**
 * OpenAPI schema (simplified)
 */
export interface OpenAPISchema {
  openapi?: string;
  swagger?: string;
  info?: {
    title: string;
    version: string;
  };
  paths: Record<string, Record<string, {
    parameters?: Array<{
      name: string;
      in: string;
      required?: boolean;
      schema?: Record<string, unknown>;
    }>;
    requestBody?: {
      content?: Record<string, {
        schema?: Record<string, unknown>;
      }>;
    };
  }>>;
}

/**
 * HTTP response for analysis
 */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  timing_ms: number;
}

/**
 * Input for fuzz_endpoint tool
 */
export interface FuzzEndpointInput {
  endpoint: string;
  method: HttpMethod;
  parameters?: ParameterDefinition[];
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Input for fuzz_parameter tool
 */
export interface FuzzParameterInput {
  endpoint: string;
  method: HttpMethod;
  parameter: ParameterDefinition;
  payload_types?: PayloadType[];
  max_payloads?: number;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Payload list result
 */
export interface PayloadListResult {
  type: PayloadType;
  description: string;
  examples: string[];
  risk_level: string;
}

/**
 * Custom error types
 */
export class FuzzerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FuzzerError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public budget: number,
    public used: number
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}
