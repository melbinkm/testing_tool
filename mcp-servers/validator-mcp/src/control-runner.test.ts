import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ControlRunner } from './control-runner.js';
import { Finding, NegativeControlConfig, IdentityConfig } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('ControlRunner', () => {
  let runner: ControlRunner;

  const sampleFinding: Finding = {
    finding_id: 'F-001',
    title: 'Unauthorized Data Access',
    request: {
      method: 'GET',
      url: 'https://api.example.com/users/123/data',
      headers: {
        Authorization: 'Bearer valid-token-123',
        'Content-Type': 'application/json',
      },
    },
  };

  beforeEach(() => {
    runner = new ControlRunner();
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('hashResponse', () => {
    it('should return deterministic hash', () => {
      const hash1 = runner.hashResponse('test');
      const hash2 = runner.hashResponse('test');
      expect(hash1).toBe(hash2);
    });

    it('should return valid SHA-256 hash', () => {
      const hash = runner.hashResponse('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('buildAuthHeaders', () => {
    it('should build bearer auth header', () => {
      const identity: IdentityConfig = {
        identity_id: 'user1',
        auth_header: 'Bearer token123',
        auth_type: 'bearer',
        should_have_access: true,
      };

      const headers = runner.buildAuthHeaders(identity);
      expect(headers.Authorization).toBe('Bearer token123');
    });

    it('should build basic auth header', () => {
      const identity: IdentityConfig = {
        identity_id: 'user1',
        auth_header: 'Basic dXNlcjpwYXNz',
        auth_type: 'basic',
        should_have_access: true,
      };

      const headers = runner.buildAuthHeaders(identity);
      expect(headers.Authorization).toBe('Basic dXNlcjpwYXNz');
    });

    it('should build api key header', () => {
      const identity: IdentityConfig = {
        identity_id: 'user1',
        auth_header: 'sk-api-key-123',
        auth_type: 'api_key',
        should_have_access: true,
      };

      const headers = runner.buildAuthHeaders(identity);
      expect(headers['X-API-Key']).toBe('sk-api-key-123');
    });

    it('should build cookie header', () => {
      const identity: IdentityConfig = {
        identity_id: 'user1',
        auth_header: '',
        auth_type: 'cookie',
        cookies: { session_id: 'abc123', csrf: 'xyz789' },
        should_have_access: true,
      };

      const headers = runner.buildAuthHeaders(identity);
      expect(headers.Cookie).toContain('session_id=abc123');
      expect(headers.Cookie).toContain('csrf=xyz789');
    });

    it('should return empty headers when no auth_header', () => {
      const identity: IdentityConfig = {
        identity_id: 'anonymous',
        should_have_access: false,
      };

      const headers = runner.buildAuthHeaders(identity);
      expect(Object.keys(headers)).toHaveLength(0);
    });
  });

  describe('runNegativeControl', () => {
    describe('unauthenticated control', () => {
      it('should pass when unauthenticated request returns 401', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        const config: NegativeControlConfig = {
          control_type: 'unauthenticated',
          remove_auth: true,
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(true);
        expect(result.control_type).toBe('unauthenticated');
        expect(result.actual_status).toBe(401);
      });

      it('should pass when unauthenticated request returns 403', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 403,
          text: () => Promise.resolve('Forbidden'),
        });

        const config: NegativeControlConfig = {
          control_type: 'unauthenticated',
          remove_auth: true,
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(true);
      });

      it('should fail when unauthenticated request returns 200', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 200,
          text: () => Promise.resolve('{"data": "sensitive"}'),
        });

        const config: NegativeControlConfig = {
          control_type: 'unauthenticated',
          remove_auth: true,
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('FAILED');
      });

      it('should remove auth headers when remove_auth is true', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        const config: NegativeControlConfig = {
          control_type: 'unauthenticated',
          remove_auth: true,
        };

        await runner.runNegativeControl(sampleFinding, config);

        const calledHeaders = mockFetch.mock.calls[0][1].headers;
        expect(calledHeaders.Authorization).toBeUndefined();
      });
    });

    describe('invalid_token control', () => {
      it('should pass when invalid token returns 401', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 401,
          text: () => Promise.resolve('Invalid token'),
        });

        const config: NegativeControlConfig = {
          control_type: 'invalid_token',
          modified_headers: { Authorization: 'Bearer invalid-token' },
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(true);
        expect(result.control_type).toBe('invalid_token');
      });

      it('should fail when invalid token returns 200', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 200,
          text: () => Promise.resolve('{"data": "sensitive"}'),
        });

        const config: NegativeControlConfig = {
          control_type: 'invalid_token',
          modified_headers: { Authorization: 'Bearer invalid-token' },
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(false);
      });
    });

    describe('different_user control', () => {
      it('should pass when different user returns 403', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 403,
          text: () => Promise.resolve('Access denied'),
        });

        const config: NegativeControlConfig = {
          control_type: 'different_user',
          modified_headers: { Authorization: 'Bearer other-user-token' },
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(true);
      });

      it('should pass when different user returns 404', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 404,
          text: () => Promise.resolve('Not found'),
        });

        const config: NegativeControlConfig = {
          control_type: 'different_user',
          modified_headers: { Authorization: 'Bearer other-user-token' },
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(true);
      });
    });

    describe('modified_request control', () => {
      it('should use expected_status when provided', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 400,
          text: () => Promise.resolve('Bad request'),
        });

        const config: NegativeControlConfig = {
          control_type: 'modified_request',
          modified_body: '{"invalid": "data"}',
          expected_status: 400,
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(true);
      });

      it('should fail when expected_status does not match', async () => {
        mockFetch.mockResolvedValueOnce({
          status: 200,
          text: () => Promise.resolve('OK'),
        });

        const config: NegativeControlConfig = {
          control_type: 'modified_request',
          expected_status: 400,
        };

        const result = await runner.runNegativeControl(sampleFinding, config);

        expect(result.passed).toBe(false);
      });
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const config: NegativeControlConfig = {
        control_type: 'unauthenticated',
        remove_auth: true,
      };

      const result = await runner.runNegativeControl(sampleFinding, config);

      expect(result.passed).toBe(false);
      expect(result.actual_status).toBe(0);
      expect(result.message).toContain('error');
    });

    it('should include finding_id in result', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const config: NegativeControlConfig = {
        control_type: 'unauthenticated',
        remove_auth: true,
      };

      const result = await runner.runNegativeControl(sampleFinding, config);

      expect(result.finding_id).toBe('F-001');
    });
  });

  describe('runCrossIdentity', () => {
    const identities: IdentityConfig[] = [
      {
        identity_id: 'admin',
        auth_header: 'Bearer admin-token',
        auth_type: 'bearer',
        should_have_access: true,
      },
      {
        identity_id: 'user',
        auth_header: 'Bearer user-token',
        auth_type: 'bearer',
        should_have_access: false,
      },
    ];

    it('should test all identities', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"data": "admin"}') })
        .mockResolvedValueOnce({ status: 403, text: () => Promise.resolve('Forbidden') });

      const result = await runner.runCrossIdentity(sampleFinding, identities);

      expect(result.identities_tested).toEqual(['admin', 'user']);
      expect(result.results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should detect authorization enforced correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"data": "admin"}') })
        .mockResolvedValueOnce({ status: 403, text: () => Promise.resolve('Forbidden') });

      const result = await runner.runCrossIdentity(sampleFinding, identities);

      expect(result.authorization_enforced).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect unauthorized access violation', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"data": "admin"}') })
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"data": "user"}') });

      const result = await runner.runCrossIdentity(sampleFinding, identities);

      expect(result.authorization_enforced).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('unauthorized access');
    });

    it('should detect denied expected access violation', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 403, text: () => Promise.resolve('Forbidden') })
        .mockResolvedValueOnce({ status: 403, text: () => Promise.resolve('Forbidden') });

      const result = await runner.runCrossIdentity(sampleFinding, identities);

      expect(result.authorization_enforced).toBe(false);
      expect(result.violations).toContain('admin: Denied expected access (status 403)');
    });

    it('should include response hashes in results', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{"data": "admin"}') })
        .mockResolvedValueOnce({ status: 403, text: () => Promise.resolve('Forbidden') });

      const result = await runner.runCrossIdentity(sampleFinding, identities);

      expect(result.results[0].response_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.results[1].response_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should include timing in results', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{}') })
        .mockResolvedValueOnce({ status: 403, text: () => Promise.resolve('{}') });

      const result = await runner.runCrossIdentity(sampleFinding, identities);

      expect(result.results[0].timing_ms).toBeGreaterThanOrEqual(0);
      expect(result.results[1].timing_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle fetch errors for individual identities', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{}') })
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await runner.runCrossIdentity(sampleFinding, identities);

      expect(result.results[0].error).toBeUndefined();
      expect(result.results[1].error).toBe('Network error');
    });

    it('should include finding_id in result', async () => {
      mockFetch.mockResolvedValue({ status: 200, text: () => Promise.resolve('{}') });

      const result = await runner.runCrossIdentity(sampleFinding, [identities[0]]);

      expect(result.finding_id).toBe('F-001');
    });

    it('should determine has_access based on status code', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('{}') })
        .mockResolvedValueOnce({ status: 302, text: () => Promise.resolve('') })
        .mockResolvedValueOnce({ status: 401, text: () => Promise.resolve('') })
        .mockResolvedValueOnce({ status: 404, text: () => Promise.resolve('') });

      const multiIdentities: IdentityConfig[] = [
        { identity_id: 'i1', should_have_access: true },
        { identity_id: 'i2', should_have_access: true },
        { identity_id: 'i3', should_have_access: false },
        { identity_id: 'i4', should_have_access: false },
      ];

      const result = await runner.runCrossIdentity(sampleFinding, multiIdentities);

      expect(result.results[0].has_access).toBe(true);  // 200
      expect(result.results[1].has_access).toBe(true);  // 302
      expect(result.results[2].has_access).toBe(false); // 401
      expect(result.results[3].has_access).toBe(false); // 404
    });
  });
});
