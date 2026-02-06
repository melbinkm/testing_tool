/**
 * Token Bucket Rate Limiter
 *
 * Implements the token bucket algorithm for rate limiting HTTP requests.
 * Tokens refill at a constant rate up to a maximum bucket size.
 */

import { RateLimiterStatus } from './types.js';

export interface TryAcquireResult {
  allowed: boolean;
  waitMs: number;
}

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRatePerSecond: number;
  private lastRefillTime: number;

  /**
   * Create a new rate limiter
   * @param maxRps Maximum requests per second (also the bucket size)
   */
  constructor(maxRps: number) {
    if (maxRps <= 0) {
      throw new Error('maxRps must be positive');
    }
    this.maxTokens = maxRps;
    this.tokens = maxRps; // Start with full bucket
    this.refillRatePerSecond = maxRps;
    this.lastRefillTime = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const elapsedSeconds = elapsedMs / 1000;

    const tokensToAdd = elapsedSeconds * this.refillRatePerSecond;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  /**
   * Try to acquire a token without waiting
   * @returns Whether acquisition was allowed and wait time if not
   */
  tryAcquire(): TryAcquireResult {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true, waitMs: 0 };
    }

    // Calculate how long until a token is available
    const tokensNeeded = 1 - this.tokens;
    const waitMs = Math.ceil((tokensNeeded / this.refillRatePerSecond) * 1000);

    return { allowed: false, waitMs };
  }

  /**
   * Wait for a token to become available
   * @returns Promise that resolves when a token is acquired
   */
  async waitForToken(): Promise<void> {
    const result = this.tryAcquire();

    if (result.allowed) {
      return;
    }

    // Wait and try again
    await new Promise(resolve => setTimeout(resolve, result.waitMs));

    // After waiting, try to acquire again
    const retryResult = this.tryAcquire();
    if (!retryResult.allowed) {
      // Edge case: if still not allowed, wait the remaining time
      await new Promise(resolve => setTimeout(resolve, retryResult.waitMs));
      const finalResult = this.tryAcquire();
      if (!finalResult.allowed) {
        throw new Error('Failed to acquire token after waiting');
      }
    }
  }

  /**
   * Get current rate limiter status
   */
  getStatus(): RateLimiterStatus {
    this.refill();
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      refillRatePerSecond: this.refillRatePerSecond,
      lastRefillTime: this.lastRefillTime
    };
  }

  /**
   * Reset the rate limiter to initial state (for testing)
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Get the number of available tokens (for testing)
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}
