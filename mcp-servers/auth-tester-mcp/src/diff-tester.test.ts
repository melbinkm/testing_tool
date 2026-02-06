import { describe, it, expect, beforeEach } from 'vitest';
import {
  DifferentialTester,
  DiffTestRequest,
  DiffTestResult,
} from './diff-tester.js';

describe('DifferentialTester', () => {
  let tester: DifferentialTester;

  const sampleRequest: DiffTestRequest = {
    method: 'GET',
    url: 'https://api.example.com/users/123',
    headers: { 'Content-Type': 'application/json' },
  };

  beforeEach(() => {
    tester = new DifferentialTester();
  });

  describe('hashResponse', () => {
    it('should return deterministic hash for same content', () => {
      const body = '{"id": 123, "name": "Test User"}';
      const hash1 = tester.hashResponse(body);
      const hash2 = tester.hashResponse(body);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', () => {
      const hash1 = tester.hashResponse('{"id": 123}');
      const hash2 = tester.hashResponse('{"id": 456}');
      expect(hash1).not.toBe(hash2);
    });

    it('should return valid SHA-256 hash (64 hex characters)', () => {
      const hash = tester.hashResponse('test content');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty string', () => {
      const hash = tester.hashResponse('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('analyzeResults', () => {
    describe('edge cases', () => {
      it('should handle empty results array', () => {
        const summary = tester.analyzeResults(sampleRequest, []);
        expect(summary.analysis.status_codes_differ).toBe(false);
        expect(summary.analysis.response_lengths_differ).toBe(false);
        expect(summary.analysis.potential_bola).toBe(false);
        expect(summary.analysis.potential_idor).toBe(false);
        expect(summary.analysis.recommendation).toContain('No results to analyze');
      });

      it('should handle single result', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1000,
            response_hash: 'abc123',
            contains_target_data: true,
            timing_ms: 50,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.potential_bola).toBe(false);
        expect(summary.analysis.potential_idor).toBe(false);
        expect(summary.analysis.recommendation).toContain('Single identity tested');
      });

      it('should handle all error results', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 0,
            response_length: 0,
            response_hash: '',
            contains_target_data: false,
            timing_ms: 100,
            error: 'Network error',
          },
          {
            identity_id: 'user',
            status_code: 0,
            response_length: 0,
            response_hash: '',
            contains_target_data: false,
            timing_ms: 100,
            error: 'Connection refused',
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.recommendation).toContain('All requests failed');
      });
    });

    describe('BOLA detection', () => {
      it('should detect potential BOLA when multiple users get same response', () => {
        const sameHash = 'abc123def456';
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: sameHash,
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1500,
            response_hash: sameHash,
            contains_target_data: true,
            timing_ms: 52,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.potential_bola).toBe(true);
        expect(summary.analysis.potential_idor).toBe(false);
        expect(summary.analysis.recommendation).toContain('CRITICAL');
        expect(summary.analysis.recommendation).toContain('BOLA');
      });

      it('should not flag BOLA when contains_target_data is false', () => {
        const sameHash = 'abc123def456';
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: sameHash,
            contains_target_data: false,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1500,
            response_hash: sameHash,
            contains_target_data: false,
            timing_ms: 52,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.potential_bola).toBe(false);
      });
    });

    describe('IDOR detection', () => {
      it('should detect potential IDOR when users get different data', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash-admin-data',
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1600,
            response_hash: 'hash-user-data',
            contains_target_data: true,
            timing_ms: 52,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.potential_bola).toBe(false);
        expect(summary.analysis.potential_idor).toBe(true);
        expect(summary.analysis.recommendation).toContain('WARNING');
        expect(summary.analysis.recommendation).toContain('IDOR');
      });

      it('should not flag IDOR when contains_target_data is false', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash-admin-data',
            contains_target_data: false,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1600,
            response_hash: 'hash-user-data',
            contains_target_data: true,
            timing_ms: 52,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.potential_idor).toBe(false);
      });
    });

    describe('status code analysis', () => {
      it('should detect when status codes differ', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 403,
            response_length: 50,
            response_hash: 'hash2',
            contains_target_data: false,
            timing_ms: 30,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.status_codes_differ).toBe(true);
      });

      it('should not flag status codes when all same', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 52,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.status_codes_differ).toBe(false);
      });

      it('should provide recommendation when only status codes differ', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 100,
            response_hash: 'hash1',
            contains_target_data: false,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 403,
            response_length: 50,
            response_hash: 'hash2',
            contains_target_data: false,
            timing_ms: 30,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.recommendation).toContain('Status codes differ');
      });
    });

    describe('response length analysis', () => {
      it('should detect significant response length variance (>10%)', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1000,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1500, // 50% larger
            response_hash: 'hash2',
            contains_target_data: true,
            timing_ms: 52,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.response_lengths_differ).toBe(true);
      });

      it('should not flag response length when variance is small', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1000,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1050, // 5% larger
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 52,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.response_lengths_differ).toBe(false);
      });
    });

    describe('mixed scenarios', () => {
      it('should handle mix of success and error results', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 0,
            response_length: 0,
            response_hash: '',
            contains_target_data: false,
            timing_ms: 100,
            error: 'Connection refused',
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.potential_bola).toBe(false);
        expect(summary.analysis.potential_idor).toBe(false);
        expect(summary.analysis.recommendation).toContain('Only one identity received a successful response');
      });

      it('should handle three identities with same response', () => {
        const sameHash = 'same-hash-for-all';
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: sameHash,
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user1',
            status_code: 200,
            response_length: 1500,
            response_hash: sameHash,
            contains_target_data: true,
            timing_ms: 50,
          },
          {
            identity_id: 'user2',
            status_code: 200,
            response_length: 1500,
            response_hash: sameHash,
            contains_target_data: true,
            timing_ms: 55,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.potential_bola).toBe(true);
        expect(summary.results).toHaveLength(3);
      });

      it('should handle mix of 2xx and 4xx status codes', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 403,
            response_length: 100,
            response_hash: 'hash2',
            contains_target_data: false,
            timing_ms: 30,
          },
          {
            identity_id: 'anonymous',
            status_code: 401,
            response_length: 80,
            response_hash: 'hash3',
            contains_target_data: false,
            timing_ms: 25,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.status_codes_differ).toBe(true);
        expect(summary.analysis.potential_bola).toBe(false);
        expect(summary.analysis.potential_idor).toBe(false);
      });

      it('should provide no anomalies message for proper auth', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash-admin',
            contains_target_data: false,
            timing_ms: 45,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1500,
            response_hash: 'hash-admin',
            contains_target_data: false,
            timing_ms: 52,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.analysis.potential_bola).toBe(false);
        expect(summary.analysis.potential_idor).toBe(false);
        expect(summary.analysis.recommendation).toContain('No authorization anomalies detected');
      });
    });

    describe('result structure', () => {
      it('should include original request in summary', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1000,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 50,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.request).toEqual(sampleRequest);
      });

      it('should include all results in summary', () => {
        const results: DiffTestResult[] = [
          {
            identity_id: 'admin',
            status_code: 200,
            response_length: 1000,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 50,
          },
          {
            identity_id: 'user',
            status_code: 200,
            response_length: 1000,
            response_hash: 'hash1',
            contains_target_data: true,
            timing_ms: 55,
          },
        ];

        const summary = tester.analyzeResults(sampleRequest, results);
        expect(summary.results).toEqual(results);
        expect(summary.results).toHaveLength(2);
      });
    });
  });
});
