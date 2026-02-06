/**
 * Budget Tracker - Tracks request counts and enforces rate limits
 */

import {
  ScopeConstraints,
  BudgetStatus,
  BudgetExceededError
} from './types.js';

interface RequestRecord {
  timestamp: number;
  target?: string;
  identityId?: string;
}

/**
 * BudgetTracker - Tracks requests and enforces budget/rate limits
 */
export class BudgetTracker {
  private constraints: ScopeConstraints;
  private requests: RequestRecord[] = [];
  private requestsByTarget: Map<string, number> = new Map();
  private startTime: number;
  private windowMs: number = 1000; // 1 second sliding window for rate limiting

  constructor(constraints: ScopeConstraints) {
    this.constraints = constraints;
    this.startTime = Date.now();
  }

  /**
   * Record a request and check limits
   * @param target Optional target for per-target budget tracking
   * @param identityId Optional identity ID for per-identity tracking
   * @returns true if request is allowed
   * @throws BudgetExceededError if budget is exceeded
   */
  recordRequest(target?: string, identityId?: string): boolean {
    const now = Date.now();

    // Check total budget
    if (this.requests.length >= this.constraints.budget.max_total_requests) {
      throw new BudgetExceededError(
        'total',
        this.requests.length,
        this.constraints.budget.max_total_requests
      );
    }

    // Check per-target budget
    if (target) {
      const targetCount = this.requestsByTarget.get(target) || 0;
      if (targetCount >= this.constraints.budget.max_requests_per_target) {
        throw new BudgetExceededError(
          'per_target',
          targetCount,
          this.constraints.budget.max_requests_per_target
        );
      }
    }

    // Check rate limit (sliding window)
    const windowStart = now - this.windowMs;
    const recentRequests = this.requests.filter(r => r.timestamp >= windowStart);

    if (recentRequests.length >= this.constraints.rate_limits.requests_per_second) {
      throw new BudgetExceededError(
        'rate',
        recentRequests.length,
        this.constraints.rate_limits.requests_per_second
      );
    }

    // Check burst limit
    if (recentRequests.length >= this.constraints.rate_limits.burst_limit) {
      throw new BudgetExceededError(
        'rate',
        recentRequests.length,
        this.constraints.rate_limits.burst_limit
      );
    }

    // Record the request
    this.requests.push({
      timestamp: now,
      target,
      identityId
    });

    // Update per-target count
    if (target) {
      const currentCount = this.requestsByTarget.get(target) || 0;
      this.requestsByTarget.set(target, currentCount + 1);
    }

    // Cleanup old requests (keep last hour for statistics)
    this.cleanupOldRequests();

    return true;
  }

  /**
   * Check if a request would be allowed without recording it
   * @param target Optional target for per-target budget checking
   * @returns true if request would be allowed
   */
  checkRequest(target?: string): boolean {
    try {
      // Check total budget
      if (this.requests.length >= this.constraints.budget.max_total_requests) {
        return false;
      }

      // Check per-target budget
      if (target) {
        const targetCount = this.requestsByTarget.get(target) || 0;
        if (targetCount >= this.constraints.budget.max_requests_per_target) {
          return false;
        }
      }

      // Check rate limit
      const now = Date.now();
      const windowStart = now - this.windowMs;
      const recentRequests = this.requests.filter(r => r.timestamp >= windowStart);

      if (recentRequests.length >= this.constraints.rate_limits.requests_per_second) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current budget status
   * @param identityId Optional identity ID for per-identity status
   */
  getStatus(identityId?: string): BudgetStatus {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const recentRequests = this.requests.filter(r => r.timestamp >= windowStart);

    // Build requests by target object
    const requestsByTarget: Record<string, number> = {};
    for (const [target, count] of this.requestsByTarget.entries()) {
      requestsByTarget[target] = count;
    }

    const totalRequests = this.requests.length;
    const maxTotal = this.constraints.budget.max_total_requests;

    return {
      total_requests: totalRequests,
      max_total_requests: maxTotal,
      remaining_requests: Math.max(0, maxTotal - totalRequests),
      requests_by_target: requestsByTarget,
      rate_limit_status: {
        current_rate: recentRequests.length,
        max_rate: this.constraints.rate_limits.requests_per_second,
        within_limit: recentRequests.length < this.constraints.rate_limits.requests_per_second
      },
      budget_exhausted: totalRequests >= maxTotal
    };
  }

  /**
   * Reset the budget tracker for a new engagement
   */
  reset(): void {
    this.requests = [];
    this.requestsByTarget.clear();
    this.startTime = Date.now();
  }

  /**
   * Get the number of requests for a specific target
   */
  getTargetRequestCount(target: string): number {
    return this.requestsByTarget.get(target) || 0;
  }

  /**
   * Get total request count
   */
  getTotalRequestCount(): number {
    return this.requests.length;
  }

  /**
   * Update constraints
   */
  updateConstraints(constraints: ScopeConstraints): void {
    this.constraints = constraints;
  }

  /**
   * Get current rate (requests in last second)
   */
  getCurrentRate(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    return this.requests.filter(r => r.timestamp >= windowStart).length;
  }

  /**
   * Check if scan duration limit has been exceeded
   */
  isDurationExceeded(): boolean {
    const elapsedMs = Date.now() - this.startTime;
    const maxDurationMs = this.constraints.budget.max_scan_duration_hours * 60 * 60 * 1000;
    return elapsedMs >= maxDurationMs;
  }

  /**
   * Get elapsed scan duration in hours
   */
  getElapsedHours(): number {
    const elapsedMs = Date.now() - this.startTime;
    return elapsedMs / (60 * 60 * 1000);
  }

  /**
   * Cleanup old requests to prevent memory growth
   * Keeps requests from the last hour
   */
  private cleanupOldRequests(): void {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    // Only cleanup periodically (when array gets large)
    if (this.requests.length > 10000) {
      this.requests = this.requests.filter(r => r.timestamp >= oneHourAgo);
    }
  }
}
