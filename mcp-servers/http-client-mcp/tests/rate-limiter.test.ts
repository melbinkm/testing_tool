/**
 * Rate Limiter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(10); // 10 requests per second
  });

  describe('constructor', () => {
    it('should create a limiter with specified maxRps', () => {
      const status = limiter.getStatus();
      expect(status.maxTokens).toBe(10);
      expect(status.refillRatePerSecond).toBe(10);
    });

    it('should start with full bucket', () => {
      expect(limiter.getAvailableTokens()).toBe(10);
    });

    it('should throw on invalid maxRps', () => {
      expect(() => new RateLimiter(0)).toThrow('maxRps must be positive');
      expect(() => new RateLimiter(-1)).toThrow('maxRps must be positive');
    });
  });

  describe('tryAcquire', () => {
    it('should allow acquisition when tokens available', () => {
      const result = limiter.tryAcquire();
      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBe(0);
    });

    it('should consume a token on acquisition', () => {
      const initialTokens = limiter.getAvailableTokens();
      limiter.tryAcquire();
      expect(limiter.getAvailableTokens()).toBe(initialTokens - 1);
    });

    it('should deny acquisition when no tokens available', () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      const result = limiter.tryAcquire();
      expect(result.allowed).toBe(false);
      expect(result.waitMs).toBeGreaterThan(0);
    });

    it('should calculate correct wait time', () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      const result = limiter.tryAcquire();
      // With 10 tokens/sec, wait for 1 token should be ~100ms
      expect(result.waitMs).toBeLessThanOrEqual(100);
      expect(result.waitMs).toBeGreaterThan(0);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', async () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      expect(limiter.getAvailableTokens()).toBeLessThan(1);

      // Wait 200ms (should refill ~2 tokens at 10/sec)
      await new Promise(resolve => setTimeout(resolve, 200));

      const tokens = limiter.getAvailableTokens();
      expect(tokens).toBeGreaterThanOrEqual(1);
    });

    it('should not exceed max tokens', async () => {
      // Wait some time even though bucket is full
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(limiter.getAvailableTokens()).toBeLessThanOrEqual(10);
    });
  });

  describe('waitForToken', () => {
    it('should resolve immediately when tokens available', async () => {
      const start = Date.now();
      await limiter.waitForToken();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50); // Should be nearly instant
    });

    it('should wait for token when none available', async () => {
      // Use a faster rate limiter for this test
      const fastLimiter = new RateLimiter(100); // 100 tokens/sec = 10ms per token

      // Exhaust all tokens
      for (let i = 0; i < 100; i++) {
        fastLimiter.tryAcquire();
      }

      const start = Date.now();
      await fastLimiter.waitForToken();
      const elapsed = Date.now() - start;

      // Should have waited some time for refill
      expect(elapsed).toBeGreaterThan(5);
    });
  });

  describe('getStatus', () => {
    it('should return correct status', () => {
      limiter.tryAcquire();
      limiter.tryAcquire();

      const status = limiter.getStatus();
      expect(status.tokens).toBeLessThanOrEqual(10);
      expect(status.maxTokens).toBe(10);
      expect(status.refillRatePerSecond).toBe(10);
      expect(status.lastRefillTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('reset', () => {
    it('should restore full bucket', () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      expect(limiter.getAvailableTokens()).toBeLessThan(1);

      limiter.reset();

      expect(limiter.getAvailableTokens()).toBe(10);
    });
  });
});
