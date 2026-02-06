/**
 * Unit tests for HTTP Client MCP Server tool handlers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClientConfig } from '../src/types.js';
import { BudgetExhaustedError } from '../src/errors.js';

// Mock undici before imports
vi.mock('undici', () => ({
  fetch: vi.fn(),
  ProxyAgent: vi.fn().mockImplementation((url) => ({ url }))
}));

import { fetch as mockedFetch } from 'undici';
import { HttpClientServer } from '../src/server.js';

// Helper to create test config
const createTestConfig = (overrides: Partial<HttpClientConfig> = {}): HttpClientConfig => ({
  engagementId: 'TEST-001',
  maxRps: 100, // High rate to avoid rate limiting in tests
  maxConcurrent: 10,
  defaultTimeout: 30000,
  maxTotalRequests: 1000,
  ...overrides,
});

describe('HttpClientServer', () => {
  let server: HttpClientServer;
  let config: HttpClientConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createTestConfig();
    server = new HttpClientServer(config);

    // Default mock response
    (mockedFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      text: () => Promise.resolve('{"success": true}')
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(server).toBeDefined();
      expect(server.getConfig()).toEqual(config);
    });

    it('should initialize http client', () => {
      const httpClient = server.getHttpClient();
      expect(httpClient).toBeDefined();
    });

    it('should initialize with proxy config', () => {
      const proxyConfig = createTestConfig({ proxyUrl: 'http://localhost:8080' });
      const proxyServer = new HttpClientServer(proxyConfig);
      expect(proxyServer.getConfig().proxyUrl).toBe('http://localhost:8080');
    });
  });

  describe('http_send tool', () => {
    it('should send a GET request successfully', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api/users',
      });

      expect(result.success).toBe(true);
      expect(result.request.method).toBe('GET');
      expect(result.request.url).toBe('https://example.com/api/users');
      expect(result.correlation_ids).toBeDefined();
      expect(result.correlation_ids.engagement_id).toBe('TEST-001');
    });

    it('should send a POST request with body', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'POST',
        url: 'https://example.com/api/users',
        headers: { 'Content-Type': 'application/json' },
        body: '{"name": "test"}',
      });

      expect(result.success).toBe(true);
      expect(result.request.method).toBe('POST');
    });

    it('should include correlation headers', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api',
      });

      expect(result.correlation_ids.engagement_id).toBe('TEST-001');
      expect(result.correlation_ids.action_id).toBeDefined();
      expect(result.correlation_ids.request_id).toBeDefined();
    });

    it('should include identity_id in correlation when provided', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send(
        { method: 'GET', url: 'https://example.com/api' },
        'user-123'
      );

      expect(result.correlation_ids.identity_id).toBe('user-123');
    });

    it('should track request statistics', async () => {
      const httpClient = server.getHttpClient();
      await httpClient.send({ method: 'GET', url: 'https://example.com/api/1' });
      await httpClient.send({ method: 'GET', url: 'https://example.com/api/2' });

      const stats = httpClient.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(2);
    });

    it('should throw on budget exhausted', async () => {
      const smallBudgetConfig = createTestConfig({ maxTotalRequests: 2 });
      const smallServer = new HttpClientServer(smallBudgetConfig);
      const httpClient = smallServer.getHttpClient();

      await httpClient.send({ method: 'GET', url: 'https://example.com/1' });
      await httpClient.send({ method: 'GET', url: 'https://example.com/2' });

      await expect(
        httpClient.send({ method: 'GET', url: 'https://example.com/3' })
      ).rejects.toThrow(BudgetExhaustedError);
    });

    it('should handle all HTTP methods', async () => {
      const httpClient = server.getHttpClient();
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

      for (const method of methods) {
        const result = await httpClient.send({
          method,
          url: 'https://example.com/api',
        });
        expect(result.success).toBe(true);
        expect(result.request.method).toBe(method);
      }
    });

    it('should handle failed requests', async () => {
      (mockedFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('http_send_batch tool', () => {
    it('should send multiple requests', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.sendBatch([
        { request: { method: 'GET', url: 'https://example.com/1' } },
        { request: { method: 'GET', url: 'https://example.com/2' } },
        { request: { method: 'GET', url: 'https://example.com/3' } },
      ]);

      expect(result.total).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);
    });

    it('should include identity_id per request in batch', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.sendBatch([
        { request: { method: 'GET', url: 'https://example.com/1' }, identity_id: 'user-1' },
        { request: { method: 'GET', url: 'https://example.com/2' }, identity_id: 'user-2' },
      ]);

      expect(result.results[0].correlation_ids.identity_id).toBe('user-1');
      expect(result.results[1].correlation_ids.identity_id).toBe('user-2');
    });

    it('should handle empty batch', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.sendBatch([]);

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should track all requests in batch statistics', async () => {
      const httpClient = server.getHttpClient();
      await httpClient.sendBatch([
        { request: { method: 'GET', url: 'https://example.com/1' } },
        { request: { method: 'GET', url: 'https://example.com/2' } },
      ]);

      const stats = httpClient.getStats();
      expect(stats.totalRequests).toBe(2);
    });

    it('should count failed requests in batch', async () => {
      (mockedFetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          text: () => Promise.resolve('{"success": true}')
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const httpClient = server.getHttpClient();
      const result = await httpClient.sendBatch([
        { request: { method: 'GET', url: 'https://example.com/1' } },
        { request: { method: 'GET', url: 'https://example.com/2' } },
      ]);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('http_get_stats tool', () => {
    it('should return initial stats', () => {
      const httpClient = server.getHttpClient();
      const stats = httpClient.getStats();

      expect(stats.engagementId).toBe('TEST-001');
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.remainingBudget).toBe(1000);
    });

    it('should update stats after requests', async () => {
      const httpClient = server.getHttpClient();
      await httpClient.send({ method: 'GET', url: 'https://example.com/api' });

      const stats = httpClient.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.remainingBudget).toBe(999);
    });

    it('should track failed requests in stats', async () => {
      (mockedFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const httpClient = server.getHttpClient();
      await httpClient.send({ method: 'GET', url: 'https://example.com/api' });

      const stats = httpClient.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.failedRequests).toBe(1);
    });

    it('should include rate limiter status', () => {
      const httpClient = server.getHttpClient();
      const stats = httpClient.getStats();

      expect(stats.rateLimiter).toBeDefined();
      expect(stats.rateLimiter.maxTokens).toBe(100);
      expect(stats.rateLimiter.refillRatePerSecond).toBe(100);
    });

    it('should include concurrency limiter status', () => {
      const httpClient = server.getHttpClient();
      const stats = httpClient.getStats();

      expect(stats.concurrencyLimiter).toBeDefined();
      expect(stats.concurrencyLimiter.max).toBe(10);
      expect(stats.concurrencyLimiter.current).toBe(0);
    });
  });

  describe('action ID management', () => {
    it('should generate new action ID', () => {
      const httpClient = server.getHttpClient();
      const actionId1 = httpClient.getActionId();
      const actionId2 = httpClient.newAction();

      expect(actionId1).not.toBe(actionId2);
    });

    it('should use same action ID for grouped requests', async () => {
      const httpClient = server.getHttpClient();
      const actionId = httpClient.getActionId();

      const result1 = await httpClient.send({ method: 'GET', url: 'https://example.com/1' });
      const result2 = await httpClient.send({ method: 'GET', url: 'https://example.com/2' });

      expect(result1.correlation_ids.action_id).toBe(actionId);
      expect(result2.correlation_ids.action_id).toBe(actionId);
    });

    it('should use new action ID after newAction()', async () => {
      const httpClient = server.getHttpClient();
      const result1 = await httpClient.send({ method: 'GET', url: 'https://example.com/1' });

      const newActionId = httpClient.newAction();
      const result2 = await httpClient.send({ method: 'GET', url: 'https://example.com/2' });

      expect(result1.correlation_ids.action_id).not.toBe(newActionId);
      expect(result2.correlation_ids.action_id).toBe(newActionId);
    });
  });

  describe('request headers', () => {
    it('should include engagement ID header in fetch call', async () => {
      const httpClient = server.getHttpClient();
      await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api',
      });

      expect(mockedFetch).toHaveBeenCalled();
      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['X-Engagement-ID']).toBe('TEST-001');
    });

    it('should include user headers in fetch call', async () => {
      const httpClient = server.getHttpClient();
      await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api',
        headers: {
          'Authorization': 'Bearer token123',
          'X-Custom-Header': 'custom-value',
        },
      });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['Authorization']).toBe('Bearer token123');
      expect(headers['X-Custom-Header']).toBe('custom-value');
    });
  });

  describe('config access', () => {
    it('should return correct engagement ID', () => {
      expect(server.getConfig().engagementId).toBe('TEST-001');
    });

    it('should return correct rate limit config', () => {
      expect(server.getConfig().maxRps).toBe(100);
    });

    it('should return correct concurrency config', () => {
      expect(server.getConfig().maxConcurrent).toBe(10);
    });

    it('should return correct timeout config', () => {
      expect(server.getConfig().defaultTimeout).toBe(30000);
    });

    it('should return correct budget config', () => {
      expect(server.getConfig().maxTotalRequests).toBe(1000);
    });
  });

  describe('budget tracking', () => {
    it('should track remaining budget correctly', async () => {
      const httpClient = server.getHttpClient();

      await httpClient.send({ method: 'GET', url: 'https://example.com/1' });
      expect(httpClient.getStats().remainingBudget).toBe(999);

      await httpClient.send({ method: 'GET', url: 'https://example.com/2' });
      expect(httpClient.getStats().remainingBudget).toBe(998);
    });

    it('should prevent requests when budget exhausted', async () => {
      const smallConfig = createTestConfig({ maxTotalRequests: 1 });
      const smallServer = new HttpClientServer(smallConfig);
      const httpClient = smallServer.getHttpClient();

      await httpClient.send({ method: 'GET', url: 'https://example.com/1' });

      await expect(
        httpClient.send({ method: 'GET', url: 'https://example.com/2' })
      ).rejects.toThrow(BudgetExhaustedError);
    });
  });

  describe('response parsing', () => {
    it('should capture response status', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api',
      });

      expect(result.response?.status).toBe(200);
      expect(result.response?.statusText).toBe('OK');
    });

    it('should capture response headers', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api',
      });

      expect(result.response?.headers).toBeDefined();
    });

    it('should capture response body', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api',
      });

      expect(result.response?.body).toBe('{"success": true}');
    });

    it('should capture timing information', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api',
      });

      expect(result.response?.timing).toBeDefined();
      expect(result.response?.timing.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should handle URL with port', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com:8443/api',
      });

      expect(result.success).toBe(true);
      expect(result.request.url).toBe('https://example.com:8443/api');
    });

    it('should handle URL with query params', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api?foo=bar&baz=qux',
      });

      expect(result.success).toBe(true);
      expect(result.request.url).toBe('https://example.com/api?foo=bar&baz=qux');
    });

    it('should handle URL with path', async () => {
      const httpClient = server.getHttpClient();
      const result = await httpClient.send({
        method: 'GET',
        url: 'https://example.com/api/v1/users/123',
      });

      expect(result.success).toBe(true);
    });

    it('should generate unique request IDs', async () => {
      const httpClient = server.getHttpClient();
      const result1 = await httpClient.send({ method: 'GET', url: 'https://example.com/1' });
      const result2 = await httpClient.send({ method: 'GET', url: 'https://example.com/2' });

      expect(result1.correlation_ids.request_id).not.toBe(result2.correlation_ids.request_id);
    });
  });
});
