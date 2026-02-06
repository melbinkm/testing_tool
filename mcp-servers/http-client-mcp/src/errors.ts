/**
 * Custom error classes for HTTP Client MCP Server
 */

/**
 * Base error class for HTTP client errors
 */
export class HttpClientError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HttpClientError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the total request budget is exhausted
 */
export class BudgetExhaustedError extends HttpClientError {
  public readonly totalRequests: number;
  public readonly maxRequests: number;

  constructor(totalRequests: number, maxRequests: number) {
    super(
      'BUDGET_EXHAUSTED',
      `Request budget exhausted: ${totalRequests}/${maxRequests} requests used`
    );
    this.name = 'BudgetExhaustedError';
    this.totalRequests = totalRequests;
    this.maxRequests = maxRequests;
  }
}

/**
 * Thrown when rate limited (includes wait time)
 */
export class RateLimitError extends HttpClientError {
  public readonly waitMs: number;

  constructor(waitMs: number) {
    super(
      'RATE_LIMITED',
      `Rate limited. Retry after ${waitMs}ms`
    );
    this.name = 'RateLimitError';
    this.waitMs = waitMs;
  }
}

/**
 * Thrown when a request times out
 */
export class RequestTimeoutError extends HttpClientError {
  public readonly timeoutMs: number;
  public readonly url: string;

  constructor(url: string, timeoutMs: number) {
    super(
      'REQUEST_TIMEOUT',
      `Request to ${url} timed out after ${timeoutMs}ms`
    );
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
    this.url = url;
  }
}

/**
 * Thrown when HTTP client initialization fails
 */
export class HttpClientInitError extends HttpClientError {
  constructor(message: string) {
    super('INIT_ERROR', `HTTP client initialization failed: ${message}`);
    this.name = 'HttpClientInitError';
  }
}

/**
 * Thrown when an invalid request is provided
 */
export class InvalidRequestError extends HttpClientError {
  constructor(message: string) {
    super('INVALID_REQUEST', message);
    this.name = 'InvalidRequestError';
  }
}
