/**
 * HTTP Client Unit Tests
 *
 * Note: These tests use a mock HTTP server or mock fetch to avoid
 * actual network requests.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HttpClient } from '../src/http-client.js';
import { HttpClientConfig } from '../src/types.js';
import { BudgetExhaustedError } from '../src/errors.js';

// Mock undici fetch
vi.mock('undici', () => ({
  fetch: vi.fn(),
  ProxyAgent: vi.fn().mockImplementation((url) => ({ url }))
}));

import { fetch as mockedFetch } from 'undici';

describe('HttpClient', () => {
  let client: HttpClient;
  const defaultConfig: HttpClientConfig = {
    engagementId: 'TEST-ENG-001',
    maxRps: 100, // High rate for testing
    maxConcurrent: 10,
    maxTotalRequests: 100,
    defaultTimeout: 5000
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new HttpClient(defaultConfig);

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

  describe('correlation headers', () => {
    it('should add X-Engagement-ID header', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test' });

      expect(mockedFetch).toHaveBeenCalled();
      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['X-Engagement-ID']).toBe('TEST-ENG-001');
    });

    it('should add X-Action-ID header', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test' });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['X-Action-ID']).toBeDefined();
      expect(headers['X-Action-ID']).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('should add X-Request-ID header', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test' });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['X-Request-ID']).toBeDefined();
      expect(headers['X-Request-ID']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should add X-Identity-ID header when provided', async () => {
      await client.send(
        { method: 'GET', url: 'https://example.com/test' },
        'user-123'
      );

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['X-Identity-ID']).toBe('user-123');
    });

    it('should not add X-Identity-ID header when not provided', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test' });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers['X-Identity-ID']).toBeUndefined();
    });

    it('should return correlation IDs in result', async () => {
      const result = await client.send(
        { method: 'GET', url: 'https://example.com/test' },
        'user-456'
      );

      expect(result.correlation_ids.engagement_id).toBe('TEST-ENG-001');
      expect(result.correlation_ids.action_id).toBeDefined();
      expect(result.correlation_ids.request_id).toBeDefined();
      expect(result.correlation_ids.identity_id).toBe('user-456');
    });
  });

  describe('action ID management', () => {
    it('should use same action ID for multiple requests', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test1' });
      await client.send({ method: 'GET', url: 'https://example.com/test2' });

      const calls = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls;
      const actionId1 = calls[0][1].headers['X-Action-ID'];
      const actionId2 = calls[1][1].headers['X-Action-ID'];

      expect(actionId1).toBe(actionId2);
    });

    it('should generate new action ID with newAction()', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test1' });
      const oldActionId = client.getActionId();

      client.newAction();
      const newActionId = client.getActionId();

      expect(newActionId).not.toBe(oldActionId);
    });

    it('should use unique request IDs for each request', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test1' });
      await client.send({ method: 'GET', url: 'https://example.com/test2' });

      const calls = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls;
      const requestId1 = calls[0][1].headers['X-Request-ID'];
      const requestId2 = calls[1][1].headers['X-Request-ID'];

      expect(requestId1).not.toBe(requestId2);
    });
  });

  describe('request tracking', () => {
    it('should track total requests', async () => {
      expect(client.getStats().totalRequests).toBe(0);

      await client.send({ method: 'GET', url: 'https://example.com/test1' });
      expect(client.getStats().totalRequests).toBe(1);

      await client.send({ method: 'GET', url: 'https://example.com/test2' });
      expect(client.getStats().totalRequests).toBe(2);
    });

    it('should track successful requests', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test' });

      const stats = client.getStats();
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
    });

    it('should track failed requests', async () => {
      (mockedFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      );

      await client.send({ method: 'GET', url: 'https://example.com/test' });

      const stats = client.getStats();
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(1);
    });

    it('should calculate remaining budget', async () => {
      expect(client.getRemainingBudget()).toBe(100);

      await client.send({ method: 'GET', url: 'https://example.com/test' });
      expect(client.getRemainingBudget()).toBe(99);
    });
  });

  describe('budget enforcement', () => {
    it('should throw BudgetExhaustedError when budget exceeded', async () => {
      // Create client with very low budget
      const lowBudgetClient = new HttpClient({
        ...defaultConfig,
        maxTotalRequests: 2
      });

      await lowBudgetClient.send({ method: 'GET', url: 'https://example.com/1' });
      await lowBudgetClient.send({ method: 'GET', url: 'https://example.com/2' });

      await expect(
        lowBudgetClient.send({ method: 'GET', url: 'https://example.com/3' })
      ).rejects.toThrow(BudgetExhaustedError);
    });

    it('should check budget before rate limiting', async () => {
      const lowBudgetClient = new HttpClient({
        ...defaultConfig,
        maxTotalRequests: 1,
        maxRps: 1 // Very slow rate limiter
      });

      await lowBudgetClient.send({ method: 'GET', url: 'https://example.com/1' });

      // Should fail immediately with budget error, not wait for rate limiter
      const start = Date.now();
      await expect(
        lowBudgetClient.send({ method: 'GET', url: 'https://example.com/2' })
      ).rejects.toThrow(BudgetExhaustedError);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Should fail fast
    });

    it('should report budget exhaustion state', async () => {
      const lowBudgetClient = new HttpClient({
        ...defaultConfig,
        maxTotalRequests: 1
      });

      expect(lowBudgetClient.isBudgetExhausted()).toBe(false);

      await lowBudgetClient.send({ method: 'GET', url: 'https://example.com/1' });

      expect(lowBudgetClient.isBudgetExhausted()).toBe(true);
    });
  });

  describe('request sending', () => {
    it('should send request with correct method', async () => {
      await client.send({ method: 'POST', url: 'https://example.com/test' });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].method).toBe('POST');
    });

    it('should send request with body', async () => {
      await client.send({
        method: 'POST',
        url: 'https://example.com/test',
        body: '{"data": "test"}'
      });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].body).toBe('{"data": "test"}');
    });

    it('should merge custom headers with correlation headers', async () => {
      await client.send({
        method: 'GET',
        url: 'https://example.com/test',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json'
        }
      });

      const callArgs = (mockedFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['Authorization']).toBe('Bearer token123');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Engagement-ID']).toBe('TEST-ENG-001');
    });

    it('should return successful response data', async () => {
      const result = await client.send({
        method: 'GET',
        url: 'https://example.com/test'
      });

      expect(result.success).toBe(true);
      expect(result.response?.status).toBe(200);
      expect(result.response?.body).toBe('{"success": true}');
    });

    it('should return error result on failure', async () => {
      (mockedFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection refused')
      );

      const result = await client.send({
        method: 'GET',
        url: 'https://example.com/test'
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Connection refused');
    });
  });

  describe('getStats', () => {
    it('should return complete statistics', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test' });

      const stats = client.getStats();

      expect(stats.engagementId).toBe('TEST-ENG-001');
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
      expect(stats.remainingBudget).toBe(99);
      expect(stats.rateLimiter).toBeDefined();
      expect(stats.concurrencyLimiter).toBeDefined();
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', async () => {
      await client.send({ method: 'GET', url: 'https://example.com/test' });
      expect(client.getStats().totalRequests).toBe(1);

      client.resetStats();

      const stats = client.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.remainingBudget).toBe(100);
    });
  });
});
