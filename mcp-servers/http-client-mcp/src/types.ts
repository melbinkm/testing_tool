/**
 * HTTP Client MCP Server Type Definitions
 */

/**
 * HTTP request configuration
 */
export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

/**
 * HTTP response data
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timing: {
    startTime: number;
    endTime: number;
    durationMs: number;
  };
}

/**
 * Correlation identifiers for request tracking
 */
export interface CorrelationIds {
  engagement_id: string;
  action_id: string;
  request_id: string;
  identity_id?: string;
}

/**
 * Result of an HTTP request
 */
export interface RequestResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  response?: HttpResponse;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  engagementId: string;
  proxyUrl?: string;
  maxRps: number;
  maxConcurrent: number;
  defaultTimeout: number;
  maxTotalRequests: number;
}

/**
 * Rate limiter status
 */
export interface RateLimiterStatus {
  tokens: number;
  maxTokens: number;
  refillRatePerSecond: number;
  lastRefillTime: number;
}

/**
 * Concurrency limiter status
 */
export interface ConcurrencyLimiterStatus {
  current: number;
  max: number;
  queued: number;
}

/**
 * HTTP client statistics
 */
export interface HttpClientStats {
  engagementId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  remainingBudget: number;
  rateLimiter: RateLimiterStatus;
  concurrencyLimiter: ConcurrencyLimiterStatus;
}

/**
 * Batch request item
 */
export interface BatchRequestItem {
  request: HttpRequest;
  identity_id?: string;
}

/**
 * Batch result
 */
export interface BatchResult {
  total: number;
  successful: number;
  failed: number;
  results: RequestResult[];
}
