/**
 * Concurrency Limiter Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrencyLimiter } from '../src/concurrency-limiter.js';

describe('ConcurrencyLimiter', () => {
  let limiter: ConcurrencyLimiter;

  beforeEach(() => {
    limiter = new ConcurrencyLimiter(3); // Max 3 concurrent
  });

  describe('constructor', () => {
    it('should create a limiter with specified max concurrent', () => {
      const status = limiter.getStatus();
      expect(status.max).toBe(3);
      expect(status.current).toBe(0);
      expect(status.queued).toBe(0);
    });

    it('should throw on invalid maxConcurrent', () => {
      expect(() => new ConcurrencyLimiter(0)).toThrow('maxConcurrent must be positive');
      expect(() => new ConcurrencyLimiter(-1)).toThrow('maxConcurrent must be positive');
    });
  });

  describe('acquire', () => {
    it('should acquire immediately when under limit', async () => {
      await limiter.acquire();
      expect(limiter.getActiveCount()).toBe(1);
    });

    it('should allow acquisition up to max', async () => {
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.getActiveCount()).toBe(3);
      expect(limiter.isAvailable()).toBe(false);
    });

    it('should queue when at limit', async () => {
      // Acquire up to limit
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      // This should queue
      let acquired = false;
      const acquirePromise = limiter.acquire().then(() => {
        acquired = true;
      });

      // Check it's queued, not immediately acquired
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(acquired).toBe(false);
      expect(limiter.getQueueLength()).toBe(1);

      // Release one and the queued request should proceed
      limiter.release();
      await acquirePromise;
      expect(acquired).toBe(true);
    });
  });

  describe('release', () => {
    it('should decrement count when no queue', async () => {
      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.getActiveCount()).toBe(2);

      limiter.release();
      expect(limiter.getActiveCount()).toBe(1);
    });

    it('should process queue when releasing', async () => {
      // Acquire to limit
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      // Queue some requests
      let queued1Acquired = false;
      let queued2Acquired = false;

      const q1 = limiter.acquire().then(() => { queued1Acquired = true; });
      const q2 = limiter.acquire().then(() => { queued2Acquired = true; });

      expect(limiter.getQueueLength()).toBe(2);

      // Release one - should process first queued
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(queued1Acquired).toBe(true);
      expect(queued2Acquired).toBe(false);
      expect(limiter.getQueueLength()).toBe(1);

      // Release another
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(queued2Acquired).toBe(true);
      expect(limiter.getQueueLength()).toBe(0);
    });

    it('should do nothing when count is zero', () => {
      expect(limiter.getActiveCount()).toBe(0);
      limiter.release();
      expect(limiter.getActiveCount()).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return correct status', async () => {
      await limiter.acquire();
      await limiter.acquire();

      const status = limiter.getStatus();
      expect(status.current).toBe(2);
      expect(status.max).toBe(3);
      expect(status.queued).toBe(0);
    });

    it('should report queued count', async () => {
      // Acquire to limit
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      // Queue requests
      limiter.acquire();
      limiter.acquire();

      const status = limiter.getStatus();
      expect(status.queued).toBe(2);
    });
  });

  describe('reset', () => {
    it('should release all and clear queue', async () => {
      // Acquire to limit
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      // Queue some
      let resolved = false;
      limiter.acquire().then(() => { resolved = true; });

      expect(limiter.getActiveCount()).toBe(3);
      expect(limiter.getQueueLength()).toBe(1);

      limiter.reset();

      // Wait for queue to be cleared
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(limiter.getActiveCount()).toBe(0);
      expect(limiter.getQueueLength()).toBe(0);
      expect(resolved).toBe(true); // Queued request should have resolved
    });
  });

  describe('isAvailable', () => {
    it('should return true when under limit', async () => {
      expect(limiter.isAvailable()).toBe(true);

      await limiter.acquire();
      expect(limiter.isAvailable()).toBe(true);

      await limiter.acquire();
      expect(limiter.isAvailable()).toBe(true);
    });

    it('should return false at limit', async () => {
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.isAvailable()).toBe(false);
    });

    it('should return true after release', async () => {
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      limiter.release();
      expect(limiter.isAvailable()).toBe(true);
    });
  });
});
