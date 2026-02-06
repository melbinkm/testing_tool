/**
 * Unit tests for TargetValidator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TargetValidator } from '../src/validators.js';
import { EngagementScope, OutOfScopeError } from '../src/types.js';

// Minimal valid scope for testing
const createTestScope = (overrides: Partial<EngagementScope> = {}): EngagementScope => ({
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
    domains: ['*.example.com', 'api.example.com'],
    ip_ranges: ['192.168.1.0/24', '10.0.0.0/8'],
    ports: [80, 443, 8080],
    services: ['http', 'https']
  },
  denylist: {
    domains: ['production.example.com', '*.prod.example.com'],
    ip_ranges: ['192.168.1.1/32'],
    ports: [22],
    keywords: ['admin', 'backup']
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
  },
  ...overrides
});

describe('TargetValidator', () => {
  let validator: TargetValidator;

  beforeEach(() => {
    validator = new TargetValidator(createTestScope());
  });

  describe('Domain validation', () => {
    it('should validate exact domain match', () => {
      // Use a scope where exact domain is listed first
      const scope = createTestScope({
        allowlist: { domains: ['api.example.com', '*.example.com'], ports: [80, 443] }
      });
      const v = new TargetValidator(scope);
      const result = v.validateTarget('api.example.com');
      expect(result.valid).toBe(true);
      expect(result.matchedRule).toContain('api.example.com');
    });

    it('should validate wildcard subdomain match', () => {
      const result = validator.validateTarget('test.example.com');
      expect(result.valid).toBe(true);
      expect(result.matchedRule).toContain('*.example.com');
    });

    it('should validate deep subdomain match', () => {
      const result = validator.validateTarget('deep.subdomain.example.com');
      expect(result.valid).toBe(true);
    });

    it('should reject base domain when only wildcard is allowed', () => {
      const scope = createTestScope({
        allowlist: { domains: ['*.example.com'] }
      });
      const v = new TargetValidator(scope);
      const result = v.validateTarget('example.com');
      expect(result.valid).toBe(false);
    });

    it('should reject domain not in allowlist', () => {
      const result = validator.validateTarget('malicious.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not in allowlist');
    });

    it('should be case insensitive', () => {
      const result = validator.validateTarget('API.EXAMPLE.COM');
      expect(result.valid).toBe(true);
    });
  });

  describe('Denylist precedence', () => {
    it('should deny exact domain in denylist', () => {
      const result = validator.validateTarget('production.example.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('denylist');
      expect(result.matchedRule).toContain('production.example.com');
    });

    it('should deny wildcard match in denylist', () => {
      const result = validator.validateTarget('api.prod.example.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('denylist');
    });

    it('should deny denied port even on allowed domain', () => {
      const result = validator.validateTarget('https://test.example.com:22');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Port is in denylist');
    });

    it('should deny path containing denied keyword', () => {
      const result = validator.validateTarget('https://test.example.com/admin/dashboard');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('denied keyword');
    });
  });

  describe('IP validation', () => {
    it('should validate IP in allowed CIDR range', () => {
      const result = validator.validateTarget('192.168.1.100');
      expect(result.valid).toBe(true);
      expect(result.matchedRule).toContain('192.168.1.0/24');
    });

    it('should validate IP in large CIDR range', () => {
      const result = validator.validateTarget('10.255.255.255');
      expect(result.valid).toBe(true);
    });

    it('should reject IP not in allowed range', () => {
      const result = validator.validateTarget('172.16.0.1');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not in any allowed range');
    });

    it('should deny IP in denylist even if in allowlist', () => {
      const result = validator.validateTarget('192.168.1.1');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('denylist');
    });

    it('should handle IP with port', () => {
      const result = validator.validateTarget('192.168.1.100:8080');
      expect(result.valid).toBe(true);
    });

    it('should reject IP with denied port', () => {
      const result = validator.validateTarget('192.168.1.100:22');
      expect(result.valid).toBe(false);
    });
  });

  describe('URL parsing', () => {
    it('should parse HTTP URL correctly', () => {
      const result = validator.validateTarget('http://test.example.com/path');
      expect(result.valid).toBe(true);
    });

    it('should parse HTTPS URL correctly', () => {
      const result = validator.validateTarget('https://api.example.com/v1/users');
      expect(result.valid).toBe(true);
    });

    it('should handle URL with explicit port', () => {
      const result = validator.validateTarget('http://test.example.com:8080/api');
      expect(result.valid).toBe(true);
    });

    it('should reject URL with non-allowed port', () => {
      const result = validator.validateTarget('http://test.example.com:9999/api');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not in allowlist');
    });

    it('should handle URL with query parameters', () => {
      const result = validator.validateTarget('https://api.example.com/search?q=test');
      expect(result.valid).toBe(true);
    });

    it('should check path for denied keywords', () => {
      const result = validator.validateTarget('https://test.example.com/backup/files');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('denied keyword');
    });
  });

  describe('matchesDomainPattern', () => {
    it('should match exact domain', () => {
      expect(validator.matchesDomainPattern('api.example.com', 'api.example.com')).toBe(true);
    });

    it('should match wildcard subdomain', () => {
      expect(validator.matchesDomainPattern('test.example.com', '*.example.com')).toBe(true);
    });

    it('should not match base domain with wildcard', () => {
      expect(validator.matchesDomainPattern('example.com', '*.example.com')).toBe(false);
    });

    it('should match deep subdomain with wildcard', () => {
      expect(validator.matchesDomainPattern('a.b.c.example.com', '*.example.com')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(validator.matchesDomainPattern('API.EXAMPLE.COM', 'api.example.com')).toBe(true);
    });
  });

  describe('ipInRange', () => {
    it('should match IP in CIDR /24 range', () => {
      expect(validator.ipInRange('192.168.1.100', '192.168.1.0/24')).toBe(true);
    });

    it('should match IP in CIDR /8 range', () => {
      expect(validator.ipInRange('10.1.2.3', '10.0.0.0/8')).toBe(true);
    });

    it('should not match IP outside range', () => {
      expect(validator.ipInRange('192.168.2.1', '192.168.1.0/24')).toBe(false);
    });

    it('should match single IP (/32)', () => {
      expect(validator.ipInRange('192.168.1.1', '192.168.1.1/32')).toBe(true);
    });

    it('should handle IP without CIDR notation', () => {
      expect(validator.ipInRange('192.168.1.1', '192.168.1.1')).toBe(true);
    });
  });

  describe('assertInScope', () => {
    it('should not throw for valid target', () => {
      expect(() => validator.assertInScope('test.example.com')).not.toThrow();
    });

    it('should throw OutOfScopeError for invalid target', () => {
      expect(() => validator.assertInScope('malicious.com')).toThrow(OutOfScopeError);
    });

    it('should include target and reason in error', () => {
      try {
        validator.assertInScope('production.example.com');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(OutOfScopeError);
        const outOfScopeError = error as OutOfScopeError;
        expect(outOfScopeError.target).toBe('production.example.com');
        expect(outOfScopeError.reason).toContain('denylist');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle empty target', () => {
      const result = validator.validateTarget('');
      expect(result.valid).toBe(false);
    });

    it('should handle whitespace target', () => {
      const result = validator.validateTarget('   ');
      expect(result.valid).toBe(false);
    });

    it('should handle target with leading/trailing whitespace', () => {
      const result = validator.validateTarget('  test.example.com  ');
      expect(result.valid).toBe(true);
    });

    it('should handle invalid URL format', () => {
      const result = validator.validateTarget('not://valid:url:format');
      expect(result.valid).toBe(false);
    });

    it('should handle scope without denylist', () => {
      const scope = createTestScope({ denylist: undefined });
      const v = new TargetValidator(scope);
      const result = v.validateTarget('production.example.com');
      expect(result.valid).toBe(true);
    });
  });
});
