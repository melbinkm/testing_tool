/**
 * Phase 3 Integration Tests - HTTP Client MCP Server
 *
 * Tests the HTTP Client MCP server's rate limiting, concurrency control,
 * correlation headers, and budget enforcement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClientServer } from '../../mcp-servers/http-client-mcp/src/server.js';
import { HttpClient } from '../../mcp-servers/http-client-mcp/src/http-client.js';
import { RateLimiter } from '../../mcp-servers/http-client-mcp/src/rate-limiter.js';
import { ConcurrencyLimiter } from '../../mcp-servers/http-client-mcp/src/concurrency-limiter.js';
import { HttpClientConfig } from '../../mcp-servers/http-client-mcp/src/types.js';
import { BudgetExhaustedError, RateLimitError, HttpClientInitError, InvalidRequestError } from '../../mcp-servers/http-client-mcp/src/errors.js';

// Mock undici for HTTP client tests
vi.mock('undici', () => ({
  fetch: vi.fn(),
  ProxyAgent: vi.fn().mockImplementation((url) => ({ url }))
}));

import { fetch as mockedFetch } from 'undici';

describe('Phase 3: HTTP Client MCP Server Integration', () => {
  const testConfig: HttpClientConfig = {
    engagementId: 'PHASE3-TEST-001',
    maxRps: 50,
    maxConcurrent: 5,
    maxTotalRequests: 100,
    defaultTimeout: 5000
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful response mock
    (mockedFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve('{"status": "ok"}')
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rate Limiting Enforcement', () => {
    it('should enforce rate limit on rapid requests', async () => {
      const limiter = new RateLimiter(5); // 5 requests/second

      // Make 5 requests quickly (should all succeed)
      for (let i = 0; i < 5; i++) {
        const result = limiter.tryAcquire();
        expect(result.allowed).toBe(true);
      }

      // 6th request should be rate limited
      const result = limiter.tryAcquire();
      expect(result.allowed).toBe(false);
      expect(result.waitMs).toBeGreaterThan(0);
    });

    it('should allow requests after rate limit refill', async () => {
      const limiter = new RateLimiter(10); // 10 tokens/sec

      // Exhaust tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      expect(limiter.tryAcquire().allowed).toBe(false);

      // Wait for partial refill (~300ms should give ~3 tokens)
      await new Promise(resolve => setTimeout(resolve, 300));

      const result = limiter.tryAcquire();
      expect(result.allowed).toBe(true);
    });

    it('should provide accurate wait time when rate limited', () => {
      const limiter = new RateLimiter(10); // 10 per second = 100ms per token

      // Exhaust tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      const result = limiter.tryAcquire();
      expect(result.allowed).toBe(false);
      // Wait time should be ~100ms or less for 1 token at 10/sec
      expect(result.waitMs).toBeLessThanOrEqual(100);
      expect(result.waitMs).toBeGreaterThan(0);
    });
  });

  describe('Concurrency Limiting', () => {
    it('should limit concurrent operations', async () => {
      const limiter = new ConcurrencyLimiter(3);

      // Acquire 3 slots
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.getActiveCount()).toBe(3);
      expect(limiter.isAvailable()).toBe(false);
    });

    it('should queue requests when at capacity', async () => {
      const limiter = new ConcurrencyLimiter(2);

      await limiter.acquire();
      await limiter.acquire();

      // This will queue
      let queued = false;
      const acquirePromise = limiter.acquire().then(() => { queued = true; });

      // Should be queued, not immediately acquired
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(queued).toBe(false);
      expect(limiter.getQueueLength()).toBe(1);

      // Release one slot
      limiter.release();
      await acquirePromise;
      expect(queued).toBe(true);
    });

    it('should process queue in FIFO order', async () => {
      const limiter = new ConcurrencyLimiter(1);
      const order: number[] = [];

      await limiter.acquire(); // Take the only slot

      // Queue multiple requests
      const p1 = limiter.acquire().then(() => order.push(1));
      const p2 = limiter.acquire().then(() => order.push(2));
      const p3 = limiter.acquire().then(() => order.push(3));

      // Release slots one by one
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      limiter.release();

      await Promise.all([p1, p2, p3]);
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('HTTP Client Statistics', () => {
    it('should track total requests accurately', async () => {
      const client = new HttpClient(testConfig);

      expect(client.getStats().totalRequests).toBe(0);

      await client.send({ method: 'GET', url: 'https://example.com/1' });
      await client.send({ method: 'GET', url: 'https://example.com/2' });
      await client.send({ method: 'GET', url: 'https://example.com/3' });

      expect(client.getStats().totalRequests).toBe(3);
    });

    it('should track successful vs failed requests', async () => {
      const client = new HttpClient(testConfig);

      // Successful request
      await client.send({ method: 'GET', url: 'https://example.com/success' });

      // Failed request
      (mockedFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
      await client.send({ method: 'GET', url: 'https://example.com/fail' });

      // Another successful request
      await client.send({ method: 'GET', url: 'https://example.com/success2' });

      const stats = client.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(1);
    });

    it('should track remaining budget', async () => {
      const client = new HttpClient({ ...testConfig, maxTotalRequests: 10 });

      expect(client.getRemainingBudget()).toBe(10);

      await client.send({ method: 'GET', url: 'https://example.com/1' });
      await client.send({ method: 'GET', url: 'https://example.com/2' });
      await client.send({ method: 'GET', url: 'https://example.com/3' });

      expect(client.getRemainingBudget()).toBe(7);
    });
  });

  describe('Correlation Headers', () => {
    it('should include all correlation headers in requests', async () => {
      const client = new HttpClient(testConfig);

      await client.send({ method: 'GET', url: 'https://example.com/test' });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['X-Engagement-ID']).toBe('PHASE3-TEST-001');
      expect(headers['X-Action-ID']).toBeDefined();
      expect(headers['X-Request-ID']).toBeDefined();
    });

    it('should use engagement ID from config', async () => {
      const client = new HttpClient({
        ...testConfig,
        engagementId: 'CUSTOM-ENGAGEMENT-ID'
      });

      await client.send({ method: 'GET', url: 'https://example.com/test' });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers['X-Engagement-ID']).toBe('CUSTOM-ENGAGEMENT-ID');
    });

    it('should include identity header when provided', async () => {
      const client = new HttpClient(testConfig);

      await client.send(
        { method: 'GET', url: 'https://example.com/test' },
        'admin-user'
      );

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers['X-Identity-ID']).toBe('admin-user');
    });

    it('should generate unique request IDs for each request', async () => {
      const client = new HttpClient(testConfig);

      await client.send({ method: 'GET', url: 'https://example.com/1' });
      await client.send({ method: 'GET', url: 'https://example.com/2' });
      await client.send({ method: 'GET', url: 'https://example.com/3' });

      const calls = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls;
      const requestIds = calls.map(call => call[1].headers['X-Request-ID']);

      // All request IDs should be unique
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should maintain action ID within an action group', async () => {
      const client = new HttpClient(testConfig);

      await client.send({ method: 'GET', url: 'https://example.com/1' });
      await client.send({ method: 'GET', url: 'https://example.com/2' });

      const calls = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls;
      const actionId1 = calls[0][1].headers['X-Action-ID'];
      const actionId2 = calls[1][1].headers['X-Action-ID'];

      expect(actionId1).toBe(actionId2);
    });

    it('should generate new action ID when newAction() is called', async () => {
      const client = new HttpClient(testConfig);

      await client.send({ method: 'GET', url: 'https://example.com/1' });
      const actionId1 = client.getActionId();

      client.newAction();

      await client.send({ method: 'GET', url: 'https://example.com/2' });
      const actionId2 = client.getActionId();

      expect(actionId1).not.toBe(actionId2);
    });
  });

  describe('Budget Enforcement', () => {
    it('should throw BudgetExhaustedError when budget exceeded', async () => {
      const client = new HttpClient({ ...testConfig, maxTotalRequests: 3 });

      await client.send({ method: 'GET', url: 'https://example.com/1' });
      await client.send({ method: 'GET', url: 'https://example.com/2' });
      await client.send({ method: 'GET', url: 'https://example.com/3' });

      await expect(
        client.send({ method: 'GET', url: 'https://example.com/4' })
      ).rejects.toThrow(BudgetExhaustedError);
    });

    it('should include budget details in BudgetExhaustedError', async () => {
      const client = new HttpClient({ ...testConfig, maxTotalRequests: 2 });

      await client.send({ method: 'GET', url: 'https://example.com/1' });
      await client.send({ method: 'GET', url: 'https://example.com/2' });

      try {
        await client.send({ method: 'GET', url: 'https://example.com/3' });
        expect.fail('Should have thrown BudgetExhaustedError');
      } catch (error) {
        expect(error).toBeInstanceOf(BudgetExhaustedError);
        expect((error as BudgetExhaustedError).totalRequests).toBe(2);
        expect((error as BudgetExhaustedError).maxRequests).toBe(2);
      }
    });

    it('should check budget before rate limiting (fail fast)', async () => {
      const client = new HttpClient({
        ...testConfig,
        maxTotalRequests: 1,
        maxRps: 1 // Very slow rate limiter
      });

      await client.send({ method: 'GET', url: 'https://example.com/1' });

      // Should fail immediately, not wait for rate limiter
      const start = Date.now();
      await expect(
        client.send({ method: 'GET', url: 'https://example.com/2' })
      ).rejects.toThrow(BudgetExhaustedError);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('MCP Server Initialization', () => {
    it('should create server with valid config', () => {
      const server = new HttpClientServer(testConfig);
      expect(server).toBeDefined();
      expect(server.getConfig().engagementId).toBe('PHASE3-TEST-001');
    });

    it('should expose HTTP client for testing', () => {
      const server = new HttpClientServer(testConfig);
      const client = server.getHttpClient();

      expect(client).toBeDefined();
      expect(client.getStats().engagementId).toBe('PHASE3-TEST-001');
    });

    it('should configure rate limiter from config', () => {
      const server = new HttpClientServer({
        ...testConfig,
        maxRps: 25
      });

      const stats = server.getHttpClient().getStats();
      expect(stats.rateLimiter.maxTokens).toBe(25);
    });

    it('should configure concurrency limiter from config', () => {
      const server = new HttpClientServer({
        ...testConfig,
        maxConcurrent: 8
      });

      const stats = server.getHttpClient().getStats();
      expect(stats.concurrencyLimiter.max).toBe(8);
    });
  });

  describe('Error Classes', () => {
    it('should create BudgetExhaustedError with correct properties', () => {
      const error = new BudgetExhaustedError(100, 100);

      expect(error.name).toBe('BudgetExhaustedError');
      expect(error.code).toBe('BUDGET_EXHAUSTED');
      expect(error.totalRequests).toBe(100);
      expect(error.maxRequests).toBe(100);
      expect(error.message).toContain('100/100');
    });

    it('should create RateLimitError with wait time', () => {
      const error = new RateLimitError(500);

      expect(error.name).toBe('RateLimitError');
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.waitMs).toBe(500);
      expect(error.message).toContain('500ms');
    });

    it('should create HttpClientInitError for initialization failures', () => {
      const error = new HttpClientInitError('Missing engagement ID');

      expect(error.name).toBe('HttpClientInitError');
      expect(error.code).toBe('INIT_ERROR');
      expect(error.message).toContain('initialization failed');
    });

    it('should create InvalidRequestError for bad requests', () => {
      const error = new InvalidRequestError('URL is required');

      expect(error.name).toBe('InvalidRequestError');
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.message).toBe('URL is required');
    });
  });

  describe('Proxy Configuration', () => {
    it('should accept proxy URL in config', () => {
      const server = new HttpClientServer({
        ...testConfig,
        proxyUrl: 'http://127.0.0.1:8080'
      });

      expect(server.getConfig().proxyUrl).toBe('http://127.0.0.1:8080');
    });

    it('should work without proxy URL', () => {
      const server = new HttpClientServer({
        ...testConfig,
        proxyUrl: undefined
      });

      expect(server.getConfig().proxyUrl).toBeUndefined();
    });
  });

  describe('Batch Request Handling', () => {
    it('should track batch requests in statistics', async () => {
      const client = new HttpClient(testConfig);

      await client.sendBatch([
        { request: { method: 'GET', url: 'https://example.com/1' } },
        { request: { method: 'GET', url: 'https://example.com/2' } },
        { request: { method: 'GET', url: 'https://example.com/3' } }
      ]);

      const stats = client.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(3);
    });

    it('should generate new action ID for batch', async () => {
      const client = new HttpClient(testConfig);
      const initialActionId = client.getActionId();

      await client.sendBatch([
        { request: { method: 'GET', url: 'https://example.com/1' } }
      ]);

      expect(client.getActionId()).not.toBe(initialActionId);
    });

    it('should return batch results with statistics', async () => {
      const client = new HttpClient(testConfig);

      const result = await client.sendBatch([
        { request: { method: 'GET', url: 'https://example.com/1' } },
        { request: { method: 'GET', url: 'https://example.com/2' } }
      ]);

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
    });
  });
});
