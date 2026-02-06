import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReproRunner } from './repro-runner.js';
import { Finding } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('ReproRunner', () => {
  let runner: ReproRunner;

  const sampleFinding: Finding = {
    finding_id: 'F-001',
    title: 'SQL Injection in login',
    request: {
      method: 'POST',
      url: 'https://api.example.com/login',
      headers: { 'Content-Type': 'application/json' },
      body: '{"username": "admin\' OR 1=1--", "password": "x"}',
    },
    expected: {
      status_code: 200,
      body_contains: ['token'],
    },
  };

  beforeEach(() => {
    runner = new ReproRunner(3);
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('hashResponse', () => {
    it('should return deterministic hash for same content', () => {
      const body = '{"id": 123, "name": "test"}';
      const hash1 = runner.hashResponse(body);
      const hash2 = runner.hashResponse(body);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', () => {
      const hash1 = runner.hashResponse('{"id": 123}');
      const hash2 = runner.hashResponse('{"id": 456}');
      expect(hash1).not.toBe(hash2);
    });

    it('should return valid SHA-256 hash (64 hex characters)', () => {
      const hash = runner.hashResponse('test content');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('matchesExpectations', () => {
    it('should return true for 2xx status when no expectations', () => {
      expect(runner.matchesExpectations(200, 'body', undefined)).toBe(true);
      expect(runner.matchesExpectations(201, 'body', undefined)).toBe(true);
      expect(runner.matchesExpectations(204, 'body', undefined)).toBe(true);
    });

    it('should return false for non-2xx status when no expectations', () => {
      expect(runner.matchesExpectations(400, 'body', undefined)).toBe(false);
      expect(runner.matchesExpectations(500, 'body', undefined)).toBe(false);
    });

    it('should check status code when specified', () => {
      expect(runner.matchesExpectations(200, 'body', { status_code: 200 })).toBe(true);
      expect(runner.matchesExpectations(201, 'body', { status_code: 200 })).toBe(false);
    });

    it('should check body_contains patterns', () => {
      const body = '{"token": "abc123", "user": "admin"}';
      expect(runner.matchesExpectations(200, body, { body_contains: ['token'] })).toBe(true);
      expect(runner.matchesExpectations(200, body, { body_contains: ['token', 'user'] })).toBe(true);
      expect(runner.matchesExpectations(200, body, { body_contains: ['missing'] })).toBe(false);
    });

    it('should check body_not_contains patterns', () => {
      const body = '{"error": "invalid"}';
      expect(runner.matchesExpectations(200, body, { body_not_contains: ['token'] })).toBe(true);
      expect(runner.matchesExpectations(200, body, { body_not_contains: ['error'] })).toBe(false);
    });

    it('should check body_regex pattern', () => {
      const body = '{"token": "abc123"}';
      expect(runner.matchesExpectations(200, body, { body_regex: 'token.*abc' })).toBe(true);
      expect(runner.matchesExpectations(200, body, { body_regex: '^\\{.*\\}$' })).toBe(true);
      expect(runner.matchesExpectations(200, body, { body_regex: 'xyz\\d+' })).toBe(false);
    });

    it('should combine multiple expectations', () => {
      const body = '{"token": "abc123"}';
      expect(
        runner.matchesExpectations(200, body, {
          status_code: 200,
          body_contains: ['token'],
          body_not_contains: ['error'],
        })
      ).toBe(true);

      expect(
        runner.matchesExpectations(200, body, {
          status_code: 201,
          body_contains: ['token'],
        })
      ).toBe(false);
    });
  });

  describe('executeAttempt', () => {
    it('should execute successful attempt', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"token": "abc123"}'),
      });

      const result = await runner.executeAttempt(sampleFinding, 1);

      expect(result.attempt).toBe(1);
      expect(result.success).toBe(true);
      expect(result.status_code).toBe(200);
      expect(result.matched_expectations).toBe(true);
      expect(result.timing_ms).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await runner.executeAttempt(sampleFinding, 1);

      expect(result.success).toBe(false);
      expect(result.status_code).toBe(0);
      expect(result.matched_expectations).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should include body for POST requests', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"token": "abc123"}'),
      });

      await runner.executeAttempt(sampleFinding, 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/login',
        expect.objectContaining({
          method: 'POST',
          body: '{"username": "admin\' OR 1=1--", "password": "x"}',
        })
      );
    });

    it('should not include body for GET requests', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"data": "test"}'),
      });

      const getFinding: Finding = {
        finding_id: 'F-002',
        title: 'Test GET',
        request: {
          method: 'GET',
          url: 'https://api.example.com/data',
        },
      };

      await runner.executeAttempt(getFinding, 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.not.objectContaining({
          body: expect.anything(),
        })
      );
    });
  });

  describe('runRepro', () => {
    it('should run specified number of attempts', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"token": "abc123"}'),
      });

      const result = await runner.runRepro(sampleFinding, 5);

      expect(result.total_attempts).toBe(5);
      expect(result.attempts).toHaveLength(5);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should use default count when not specified', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"token": "abc123"}'),
      });

      const result = await runner.runRepro(sampleFinding);

      expect(result.total_attempts).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should calculate success rate correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"token": "abc123"}') })
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"token": "abc123"}') })
        .mockResolvedValueOnce({ status: 500, text: () => Promise.resolve('error') });

      const result = await runner.runRepro(sampleFinding, 3);

      expect(result.successful_attempts).toBe(2);
      expect(result.failed_attempts).toBe(1);
      expect(result.success_rate).toBeCloseTo(0.667, 2);
    });

    it('should detect consistent responses', async () => {
      const sameResponse = '{"token": "abc123"}';
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve(sameResponse),
      });

      const result = await runner.runRepro(sampleFinding, 3);

      expect(result.consistent).toBe(true);
    });

    it('should detect inconsistent responses', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"token": "abc123"}') })
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"token": "xyz789"}') })
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"token": "abc123"}') });

      const result = await runner.runRepro(sampleFinding, 3);

      // Different responses = inconsistent (unique hashes > 1)
      expect(result.consistent).toBe(false);
    });

    it('should handle all failures', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await runner.runRepro(sampleFinding, 3);

      expect(result.successful_attempts).toBe(0);
      expect(result.failed_attempts).toBe(3);
      expect(result.success_rate).toBe(0);
      expect(result.consistent).toBe(false);
    });

    it('should include finding_id in result', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('{"token": "abc123"}'),
      });

      const result = await runner.runRepro(sampleFinding);

      expect(result.finding_id).toBe('F-001');
    });
  });

  describe('getDefaultCount', () => {
    it('should return default count', () => {
      expect(runner.getDefaultCount()).toBe(3);
    });

    it('should return custom default count', () => {
      const customRunner = new ReproRunner(5);
      expect(customRunner.getDefaultCount()).toBe(5);
    });
  });
});
