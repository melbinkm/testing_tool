/**
 * Unit tests for BudgetTracker
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BudgetTracker } from '../src/budget-tracker.js';
import { ScopeConstraints, BudgetExceededError } from '../src/types.js';

const createTestConstraints = (overrides: Partial<ScopeConstraints> = {}): ScopeConstraints => ({
  rate_limits: {
    requests_per_second: 10,
    max_concurrent: 5,
    burst_limit: 50
  },
  budget: {
    max_total_requests: 100,
    max_requests_per_target: 20,
    max_scan_duration_hours: 1
  },
  timeouts: {
    connect_timeout_ms: 5000,
    read_timeout_ms: 30000,
    total_timeout_ms: 60000
  },
  ...overrides
});

describe('BudgetTracker', () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new BudgetTracker(createTestConstraints());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordRequest', () => {
    it('should record a request successfully', () => {
      const result = tracker.recordRequest();
      expect(result).toBe(true);
      expect(tracker.getTotalRequestCount()).toBe(1);
    });

    it('should track requests per target', () => {
      tracker.recordRequest('api.example.com');
      tracker.recordRequest('api.example.com');
      tracker.recordRequest('test.example.com');

      expect(tracker.getTargetRequestCount('api.example.com')).toBe(2);
      expect(tracker.getTargetRequestCount('test.example.com')).toBe(1);
    });

    it('should throw BudgetExceededError when total budget exceeded', () => {
      const smallBudget = createTestConstraints({
        budget: {
          max_total_requests: 5,
          max_requests_per_target: 20,
          max_scan_duration_hours: 1
        }
      });
      tracker = new BudgetTracker(smallBudget);

      // Record 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        tracker.recordRequest();
      }

      expect(() => tracker.recordRequest()).toThrow(BudgetExceededError);
    });

    it('should throw BudgetExceededError when per-target budget exceeded', () => {
      const smallTarget = createTestConstraints({
        budget: {
          max_total_requests: 1000,
          max_requests_per_target: 3,
          max_scan_duration_hours: 1
        }
      });
      tracker = new BudgetTracker(smallTarget);

      // Record 3 requests to same target
      for (let i = 0; i < 3; i++) {
        tracker.recordRequest('api.example.com');
      }

      expect(() => tracker.recordRequest('api.example.com')).toThrow(BudgetExceededError);

      // Other targets should still work
      expect(() => tracker.recordRequest('other.example.com')).not.toThrow();
    });

    it('should throw BudgetExceededError when rate limit exceeded', () => {
      const lowRate = createTestConstraints({
        rate_limits: {
          requests_per_second: 3,
          max_concurrent: 5,
          burst_limit: 50
        }
      });
      tracker = new BudgetTracker(lowRate);

      // Record 3 requests quickly
      for (let i = 0; i < 3; i++) {
        tracker.recordRequest();
      }

      expect(() => tracker.recordRequest()).toThrow(BudgetExceededError);
    });

    it('should allow requests after rate limit window passes', () => {
      const lowRate = createTestConstraints({
        rate_limits: {
          requests_per_second: 2,
          max_concurrent: 5,
          burst_limit: 50
        }
      });
      tracker = new BudgetTracker(lowRate);

      // Record 2 requests
      tracker.recordRequest();
      tracker.recordRequest();

      // Should fail immediately
      expect(() => tracker.recordRequest()).toThrow(BudgetExceededError);

      // Advance time by 1 second
      vi.advanceTimersByTime(1001);

      // Should work now
      expect(() => tracker.recordRequest()).not.toThrow();
    });
  });

  describe('checkRequest', () => {
    it('should return true for allowed request', () => {
      expect(tracker.checkRequest()).toBe(true);
    });

    it('should return false when budget exceeded', () => {
      const smallBudget = createTestConstraints({
        budget: {
          max_total_requests: 2,
          max_requests_per_target: 20,
          max_scan_duration_hours: 1
        }
      });
      tracker = new BudgetTracker(smallBudget);

      tracker.recordRequest();
      tracker.recordRequest();

      expect(tracker.checkRequest()).toBe(false);
    });

    it('should not record the request when checking', () => {
      tracker.checkRequest();
      expect(tracker.getTotalRequestCount()).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return correct initial status', () => {
      const status = tracker.getStatus();

      expect(status.total_requests).toBe(0);
      expect(status.max_total_requests).toBe(100);
      expect(status.remaining_requests).toBe(100);
      expect(status.budget_exhausted).toBe(false);
      expect(status.rate_limit_status.within_limit).toBe(true);
    });

    it('should update status after requests', () => {
      tracker.recordRequest('api.example.com');
      tracker.recordRequest('api.example.com');
      tracker.recordRequest('test.example.com');

      const status = tracker.getStatus();

      expect(status.total_requests).toBe(3);
      expect(status.remaining_requests).toBe(97);
      expect(status.requests_by_target['api.example.com']).toBe(2);
      expect(status.requests_by_target['test.example.com']).toBe(1);
    });

    it('should report budget exhausted when at limit', () => {
      const smallBudget = createTestConstraints({
        budget: {
          max_total_requests: 3,
          max_requests_per_target: 20,
          max_scan_duration_hours: 1
        }
      });
      tracker = new BudgetTracker(smallBudget);

      tracker.recordRequest();
      tracker.recordRequest();
      tracker.recordRequest();

      const status = tracker.getStatus();
      expect(status.budget_exhausted).toBe(true);
      expect(status.remaining_requests).toBe(0);
    });

    it('should report current rate', () => {
      tracker.recordRequest();
      tracker.recordRequest();

      const status = tracker.getStatus();
      expect(status.rate_limit_status.current_rate).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset all counters', () => {
      tracker.recordRequest('api.example.com');
      tracker.recordRequest('api.example.com');

      tracker.reset();

      expect(tracker.getTotalRequestCount()).toBe(0);
      expect(tracker.getTargetRequestCount('api.example.com')).toBe(0);
    });

    it('should allow new requests after reset', () => {
      const smallBudget = createTestConstraints({
        budget: {
          max_total_requests: 2,
          max_requests_per_target: 20,
          max_scan_duration_hours: 1
        }
      });
      tracker = new BudgetTracker(smallBudget);

      tracker.recordRequest();
      tracker.recordRequest();

      // Budget exhausted
      expect(() => tracker.recordRequest()).toThrow();

      tracker.reset();

      // Should work after reset
      expect(() => tracker.recordRequest()).not.toThrow();
    });
  });

  describe('getCurrentRate', () => {
    it('should return current requests per second', () => {
      tracker.recordRequest();
      tracker.recordRequest();
      tracker.recordRequest();

      expect(tracker.getCurrentRate()).toBe(3);
    });

    it('should exclude old requests from rate', () => {
      tracker.recordRequest();
      tracker.recordRequest();

      // Advance time by 1.1 seconds
      vi.advanceTimersByTime(1100);

      expect(tracker.getCurrentRate()).toBe(0);
    });
  });

  describe('duration tracking', () => {
    it('should report duration not exceeded initially', () => {
      expect(tracker.isDurationExceeded()).toBe(false);
    });

    it('should report duration exceeded after time passes', () => {
      // Advance time by 1 hour + 1 minute
      vi.advanceTimersByTime(61 * 60 * 1000);

      expect(tracker.isDurationExceeded()).toBe(true);
    });

    it('should report elapsed hours', () => {
      // Advance time by 30 minutes
      vi.advanceTimersByTime(30 * 60 * 1000);

      expect(tracker.getElapsedHours()).toBeCloseTo(0.5, 1);
    });
  });

  describe('updateConstraints', () => {
    it('should update constraints without resetting counters', () => {
      tracker.recordRequest();
      tracker.recordRequest();

      const newConstraints = createTestConstraints({
        budget: {
          max_total_requests: 1000,
          max_requests_per_target: 500,
          max_scan_duration_hours: 24
        }
      });

      tracker.updateConstraints(newConstraints);

      // Should still have 2 requests recorded
      expect(tracker.getTotalRequestCount()).toBe(2);

      // Should use new budget limits
      const status = tracker.getStatus();
      expect(status.max_total_requests).toBe(1000);
    });
  });

  describe('BudgetExceededError', () => {
    it('should include budget type and values', () => {
      const smallBudget = createTestConstraints({
        budget: {
          max_total_requests: 1,
          max_requests_per_target: 20,
          max_scan_duration_hours: 1
        }
      });
      tracker = new BudgetTracker(smallBudget);

      tracker.recordRequest();

      try {
        tracker.recordRequest();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BudgetExceededError);
        const budgetError = error as BudgetExceededError;
        expect(budgetError.budgetType).toBe('total');
        expect(budgetError.current).toBe(1);
        expect(budgetError.limit).toBe(1);
      }
    });
  });
});
