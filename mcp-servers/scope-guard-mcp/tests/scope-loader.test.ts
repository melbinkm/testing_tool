/**
 * Unit tests for Scope Loader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadScope, validateScope, normalizeScope } from '../src/scope-loader.js';
import { ScopeValidationError, EngagementScope } from '../src/types.js';

// Valid minimal scope for testing
const validScope = {
  schema_version: '1.0',
  engagement: {
    id: 'TEST-001',
    name: 'Test Engagement',
    client: 'Test Client',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    timezone: 'UTC'
  },
  allowlist: {
    domains: ['*.example.com'],
    ip_ranges: ['192.168.1.0/24'],
    ports: [80, 443]
  },
  constraints: {
    rate_limits: {
      requests_per_second: 10,
      max_concurrent: 5,
      burst_limit: 50
    },
    budget: {
      max_total_requests: 10000,
      max_requests_per_target: 1000,
      max_scan_duration_hours: 8
    },
    timeouts: {
      connect_timeout_ms: 5000,
      read_timeout_ms: 30000,
      total_timeout_ms: 60000
    }
  },
  approval_policy: {
    mode: 'INTERACTIVE',
    timeout_seconds: 300,
    default_action: 'DENY',
    escalation: {
      on_timeout: 'DENY',
      on_error: 'DENY',
      notify: true
    }
  }
};

describe('Scope Loader', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `scope-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('loadScope', () => {
    it('should load valid YAML scope file', () => {
      const yaml = require('js-yaml');
      const filePath = join(testDir, 'scope.yaml');
      writeFileSync(filePath, yaml.dump(validScope));

      const scope = loadScope(filePath);
      expect(scope.engagement.id).toBe('TEST-001');
      expect(scope.allowlist.domains).toContain('*.example.com');
    });

    it('should load valid JSON scope file', () => {
      const filePath = join(testDir, 'scope.json');
      writeFileSync(filePath, JSON.stringify(validScope, null, 2));

      const scope = loadScope(filePath);
      expect(scope.engagement.id).toBe('TEST-001');
    });

    it('should throw ScopeValidationError for non-existent file', () => {
      expect(() => loadScope('/nonexistent/path/scope.yaml')).toThrow(ScopeValidationError);
    });

    it('should throw ScopeValidationError for invalid YAML', () => {
      const filePath = join(testDir, 'invalid.yaml');
      writeFileSync(filePath, 'invalid: yaml: content: [');

      expect(() => loadScope(filePath)).toThrow(ScopeValidationError);
    });

    it('should throw ScopeValidationError for invalid JSON', () => {
      const filePath = join(testDir, 'invalid.json');
      writeFileSync(filePath, '{ invalid json }');

      expect(() => loadScope(filePath)).toThrow(ScopeValidationError);
    });
  });

  describe('validateScope', () => {
    it('should validate valid scope data', () => {
      const scope = validateScope(validScope);
      expect(scope.schema_version).toBe('1.0');
    });

    it('should throw for missing required field: engagement', () => {
      const invalid = { ...validScope };
      delete (invalid as any).engagement;

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });

    it('should throw for missing required field: allowlist', () => {
      const invalid = { ...validScope };
      delete (invalid as any).allowlist;

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });

    it('should throw for missing required field: constraints', () => {
      const invalid = { ...validScope };
      delete (invalid as any).constraints;

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });

    it('should throw for missing required field: approval_policy', () => {
      const invalid = { ...validScope };
      delete (invalid as any).approval_policy;

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });

    it('should throw for invalid engagement.id (empty)', () => {
      const invalid = {
        ...validScope,
        engagement: { ...validScope.engagement, id: '' }
      };

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });

    it('should throw for invalid port (out of range)', () => {
      const invalid = {
        ...validScope,
        allowlist: { ...validScope.allowlist, ports: [99999] }
      };

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });

    it('should throw for invalid approval_policy.mode', () => {
      const invalid = {
        ...validScope,
        approval_policy: { ...validScope.approval_policy, mode: 'INVALID' }
      };

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });

    it('should throw for invalid rate_limits (negative)', () => {
      const invalid = {
        ...validScope,
        constraints: {
          ...validScope.constraints,
          rate_limits: { ...validScope.constraints.rate_limits, requests_per_second: -1 }
        }
      };

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });

    it('should allow optional fields to be missing', () => {
      // denylist, credentials, actions, evidence_policy, logging are all optional
      const minimal = { ...validScope };
      const scope = validateScope(minimal);
      expect(scope.denylist).toBeUndefined();
      expect(scope.credentials).toBeUndefined();
    });

    it('should validate credentials when present', () => {
      const withCreds = {
        ...validScope,
        credentials: [
          {
            id: 'cred-001',
            type: 'basic',
            username_env: 'USER',
            password_env: 'PASS',
            scope: ['api.example.com']
          }
        ]
      };

      const scope = validateScope(withCreds);
      expect(scope.credentials).toHaveLength(1);
    });

    it('should throw for invalid credential type', () => {
      const invalid = {
        ...validScope,
        credentials: [
          {
            id: 'cred-001',
            type: 'invalid_type',
            scope: ['api.example.com']
          }
        ]
      };

      expect(() => validateScope(invalid)).toThrow(ScopeValidationError);
    });
  });

  describe('normalizeScope', () => {
    it('should lowercase allowlist domains', () => {
      const scope = {
        ...validScope,
        allowlist: { ...validScope.allowlist, domains: ['API.EXAMPLE.COM', '*.TEST.COM'] }
      } as EngagementScope;

      const normalized = normalizeScope(scope);
      expect(normalized.allowlist.domains).toContain('api.example.com');
      expect(normalized.allowlist.domains).toContain('*.test.com');
    });

    it('should lowercase denylist domains', () => {
      const scope = {
        ...validScope,
        denylist: { domains: ['PRODUCTION.EXAMPLE.COM'] }
      } as EngagementScope;

      const normalized = normalizeScope(scope);
      expect(normalized.denylist?.domains).toContain('production.example.com');
    });

    it('should lowercase denylist keywords', () => {
      const scope = {
        ...validScope,
        denylist: { keywords: ['ADMIN', 'BACKUP'] }
      } as EngagementScope;

      const normalized = normalizeScope(scope);
      expect(normalized.denylist?.keywords).toContain('admin');
      expect(normalized.denylist?.keywords).toContain('backup');
    });

    it('should not modify original scope object', () => {
      const scope = {
        ...validScope,
        allowlist: { ...validScope.allowlist, domains: ['API.EXAMPLE.COM'] }
      } as EngagementScope;

      normalizeScope(scope);
      expect(scope.allowlist.domains).toContain('API.EXAMPLE.COM');
    });

    it('should handle missing denylist', () => {
      const scope = { ...validScope } as EngagementScope;
      delete (scope as any).denylist;

      const normalized = normalizeScope(scope);
      expect(normalized.denylist).toBeUndefined();
    });
  });

  describe('Error messages', () => {
    it('should include file path in error for missing file', () => {
      try {
        loadScope('/path/to/missing.yaml');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ScopeValidationError);
        expect((error as ScopeValidationError).message).toContain('/path/to/missing.yaml');
      }
    });

    it('should include all validation errors', () => {
      const invalid = {
        schema_version: '1.0'
        // Missing all required fields
      };

      try {
        validateScope(invalid);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ScopeValidationError);
        const scopeError = error as ScopeValidationError;
        expect(scopeError.errors.length).toBeGreaterThan(0);
      }
    });
  });
});
