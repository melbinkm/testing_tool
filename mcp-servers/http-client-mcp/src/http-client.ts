/**
 * HTTP Client with Correlation Headers, Rate Limiting, and Proxy Support
 *
 * Sends HTTP requests with:
 * - Rate limiting (token bucket)
 * - Concurrency limiting (semaphore)
 * - Correlation headers for request tracking
 * - Optional proxy routing (for Burp Suite)
 * - Total request budget enforcement
 */

import { ProxyAgent, fetch as undiciFetch, type RequestInit } from 'undici';
import { RateLimiter } from './rate-limiter.js';
import { ConcurrencyLimiter } from './concurrency-limiter.js';
import {
  HttpRequest,
  HttpResponse,
  CorrelationIds,
  RequestResult,
  HttpClientConfig,
  HttpClientStats,
  BatchRequestItem,
  BatchResult
} from './types.js';
import {
  BudgetExhaustedError,
  RequestTimeoutError,
  HttpClientError
} from './errors.js';
import { randomUUID } from 'crypto';

export class HttpClient {
  private readonly config: HttpClientConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly concurrencyLimiter: ConcurrencyLimiter;
  private readonly proxyAgent?: ProxyAgent;

  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private currentActionId: string;

  constructor(config: HttpClientConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(config.maxRps);
    this.concurrencyLimiter = new ConcurrencyLimiter(config.maxConcurrent);
    this.currentActionId = randomUUID();

    // Set up proxy if configured
    if (config.proxyUrl) {
      this.proxyAgent = new ProxyAgent(config.proxyUrl);
    }
  }

  /**
   * Generate a new action ID (for grouping related requests)
   */
  newAction(): string {
    this.currentActionId = randomUUID();
    return this.currentActionId;
  }

  /**
   * Get the current action ID
   */
  getActionId(): string {
    return this.currentActionId;
  }

  /**
   * Build correlation headers for a request
   */
  private buildCorrelationHeaders(identityId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Engagement-ID': this.config.engagementId,
      'X-Action-ID': this.currentActionId,
      'X-Request-ID': randomUUID()
    };

    if (identityId) {
      headers['X-Identity-ID'] = identityId;
    }

    return headers;
  }

  /**
   * Send a single HTTP request
   */
  async send(request: HttpRequest, identityId?: string): Promise<RequestResult> {
    // Check budget BEFORE rate limiting (fail fast)
    if (this.totalRequests >= this.config.maxTotalRequests) {
      throw new BudgetExhaustedError(this.totalRequests, this.config.maxTotalRequests);
    }

    // Wait for rate limit token
    await this.rateLimiter.waitForToken();

    // Wait for concurrency slot
    await this.concurrencyLimiter.acquire();

    const correlationHeaders = this.buildCorrelationHeaders(identityId);
    const correlationIds: CorrelationIds = {
      engagement_id: this.config.engagementId,
      action_id: this.currentActionId,
      request_id: correlationHeaders['X-Request-ID'],
      identity_id: identityId
    };

    // Merge headers (request headers take precedence except for correlation)
    const headers: Record<string, string> = {
      ...request.headers,
      ...correlationHeaders
    };

    const timeout = request.timeout ?? this.config.defaultTimeout;
    const startTime = Date.now();

    try {
      this.totalRequests++;

      const fetchOptions: RequestInit = {
        method: request.method,
        headers,
        body: request.body,
        signal: AbortSignal.timeout(timeout)
      };

      // Add proxy dispatcher if configured
      if (this.proxyAgent) {
        fetchOptions.dispatcher = this.proxyAgent;
      }

      const response = await undiciFetch(request.url, fetchOptions);

      const endTime = Date.now();
      const responseBody = await response.text();

      // Convert headers to plain object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const httpResponse: HttpResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        timing: {
          startTime,
          endTime,
          durationMs: endTime - startTime
        }
      };

      this.successfulRequests++;

      return {
        success: true,
        correlation_ids: correlationIds,
        request: {
          method: request.method,
          url: request.url,
          headers
        },
        response: httpResponse
      };
    } catch (error) {
      this.failedRequests++;

      let errorCode = 'REQUEST_ERROR';
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;

        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
          throw new RequestTimeoutError(request.url, timeout);
        }

        if (error instanceof HttpClientError) {
          throw error;
        }
      }

      return {
        success: false,
        correlation_ids: correlationIds,
        request: {
          method: request.method,
          url: request.url,
          headers
        },
        error: {
          code: errorCode,
          message: errorMessage
        }
      };
    } finally {
      this.concurrencyLimiter.release();
    }
  }

  /**
   * Send multiple requests with concurrency control
   */
  async sendBatch(items: BatchRequestItem[]): Promise<BatchResult> {
    // Start a new action for the batch
    this.newAction();

    const results: RequestResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process requests with controlled concurrency
    const promises = items.map(async (item) => {
      try {
        const result = await this.send(item.request, item.identity_id);
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
        return result;
      } catch (error) {
        failed++;
        const correlationIds: CorrelationIds = {
          engagement_id: this.config.engagementId,
          action_id: this.currentActionId,
          request_id: randomUUID(),
          identity_id: item.identity_id
        };

        return {
          success: false,
          correlation_ids: correlationIds,
          request: {
            method: item.request.method,
            url: item.request.url,
            headers: item.request.headers ?? {}
          },
          error: {
            code: error instanceof HttpClientError ? error.code : 'REQUEST_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        } as RequestResult;
      }
    });

    results.push(...await Promise.all(promises));

    return {
      total: items.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Get HTTP client statistics
   */
  getStats(): HttpClientStats {
    return {
      engagementId: this.config.engagementId,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      remainingBudget: this.config.maxTotalRequests - this.totalRequests,
      rateLimiter: this.rateLimiter.getStatus(),
      concurrencyLimiter: this.concurrencyLimiter.getStatus()
    };
  }

  /**
   * Get remaining request budget
   */
  getRemainingBudget(): number {
    return this.config.maxTotalRequests - this.totalRequests;
  }

  /**
   * Check if budget is exhausted
   */
  isBudgetExhausted(): boolean {
    return this.totalRequests >= this.config.maxTotalRequests;
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.rateLimiter.reset();
    this.concurrencyLimiter.reset();
    this.currentActionId = randomUUID();
  }
}
