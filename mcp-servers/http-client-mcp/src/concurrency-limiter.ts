/**
 * Concurrency Limiter (Semaphore Pattern)
 *
 * Limits the number of concurrent operations, queueing excess requests
 * until slots become available.
 */

import { ConcurrencyLimiterStatus } from './types.js';

interface QueuedRequest {
  resolve: () => void;
}

export class ConcurrencyLimiter {
  private current: number = 0;
  private readonly max: number;
  private readonly queue: QueuedRequest[] = [];

  /**
   * Create a new concurrency limiter
   * @param maxConcurrent Maximum number of concurrent operations
   */
  constructor(maxConcurrent: number) {
    if (maxConcurrent <= 0) {
      throw new Error('maxConcurrent must be positive');
    }
    this.max = maxConcurrent;
  }

  /**
   * Acquire a slot, waiting if at capacity
   * @returns Promise that resolves when a slot is acquired
   */
  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }

    // At capacity, queue the request
    return new Promise<void>(resolve => {
      this.queue.push({ resolve });
    });
  }

  /**
   * Release a slot, processing next queued request if any
   */
  release(): void {
    if (this.current <= 0) {
      return; // Nothing to release
    }

    const nextInQueue = this.queue.shift();
    if (nextInQueue) {
      // Pass the slot to the next queued request
      nextInQueue.resolve();
    } else {
      // No queue, decrement count
      this.current--;
    }
  }

  /**
   * Get current concurrency limiter status
   */
  getStatus(): ConcurrencyLimiterStatus {
    return {
      current: this.current,
      max: this.max,
      queued: this.queue.length
    };
  }

  /**
   * Reset the limiter (for testing)
   */
  reset(): void {
    // Resolve all queued requests
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        request.resolve();
      }
    }
    this.current = 0;
  }

  /**
   * Check if a slot is immediately available (for testing)
   */
  isAvailable(): boolean {
    return this.current < this.max;
  }

  /**
   * Get current active count (for testing)
   */
  getActiveCount(): number {
    return this.current;
  }

  /**
   * Get queue length (for testing)
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}
