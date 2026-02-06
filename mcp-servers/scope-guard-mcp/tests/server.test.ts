/**
 * Unit tests for Scope Guard MCP Server tool handlers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScopeGuardServer } from '../src/server.js';
import { EngagementScope } from '../src/types.js';

// Helper to create a test scope
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
    domains: ['*.example.com', 'api.example.com', 'staging.test.io'],
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
  credentials: [
    {
      id: 'admin-user',
      type: 'bearer',
      token_env: 'ADMIN_TOKEN',
      scope: ['admin']
    },
    {
      id: 'basic-user',
      type: 'basic',
      username_env: 'USER_NAME',
      password_env: 'USER_PASS',
      scope: ['user']
    },
    {
      id: 'api-key-user',
      type: 'api_key',
      api_key_env: 'API_KEY',
      scope: ['api']
    }
  ],
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
  actions: {
    forbidden: ['destructive_action', 'delete_data'],
    requires_approval: ['sensitive_action', 'high_risk']
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

describe('ScopeGuardServer', () => {
  let server: ScopeGuardServer;
  let testScope: EngagementScope;

  beforeEach(() => {
    testScope = createTestScope();
    server = new ScopeGuardServer(testScope);
  });

  describe('constructor', () => {
    it('should initialize with valid scope', () => {
      expect(server).toBeDefined();
      expect(server.getScope()).toEqual(testScope);
    });

    it('should initialize validator from scope', () => {
      const validator = server.getValidator();
      expect(validator).toBeDefined();
    });

    it('should initialize budget tracker from constraints', () => {
      const budgetTracker = server.getBudgetTracker();
      expect(budgetTracker).toBeDefined();
    });
  });

  describe('scope_validate_target tool', () => {
    it('should validate allowed domain', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('test.example.com');
      expect(result.valid).toBe(true);
      expect(result.target).toBe('test.example.com');
    });

    it('should validate exact domain match', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('api.example.com');
      expect(result.valid).toBe(true);
    });

    it('should reject non-matching domain', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('evil.com');
      expect(result.valid).toBe(false);
    });

    it('should reject denylisted domain', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('production.example.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('denylist');
    });

    it('should reject wildcard denylisted domain', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('test.prod.example.com');
      expect(result.valid).toBe(false);
    });

    it('should validate allowed IP address', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('192.168.1.100');
      expect(result.valid).toBe(true);
    });

    it('should validate IP in /8 range', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('10.1.2.3');
      expect(result.valid).toBe(true);
    });

    it('should reject non-matching IP', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('8.8.8.8');
      expect(result.valid).toBe(false);
    });

    it('should reject denylisted IP', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('192.168.1.1');
      expect(result.valid).toBe(false);
    });

    it('should validate URL with allowed domain', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('https://api.example.com/users');
      expect(result.valid).toBe(true);
    });

    it('should validate URL with allowed port', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('http://test.example.com:8080/api');
      expect(result.valid).toBe(true);
    });

    it('should reject URL with disallowed port', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('ssh://test.example.com:22');
      expect(result.valid).toBe(false);
    });

    it('should handle deep subdomains', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('a.b.c.example.com');
      expect(result.valid).toBe(true);
    });

    it('should reject keywords in denylisted paths', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('https://test.example.com/admin/settings');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('keyword');
    });
  });

  describe('scope_get_allowlist tool', () => {
    it('should return complete allowlist', () => {
      const scope = server.getScope();
      expect(scope.allowlist.domains).toContain('*.example.com');
      expect(scope.allowlist.domains).toContain('api.example.com');
      expect(scope.allowlist.ip_ranges).toContain('192.168.1.0/24');
      expect(scope.allowlist.ports).toContain(80);
      expect(scope.allowlist.ports).toContain(443);
    });

    it('should return denylist information', () => {
      const scope = server.getScope();
      expect(scope.denylist?.domains).toContain('production.example.com');
      expect(scope.denylist?.ports).toContain(22);
    });

    it('should handle missing denylist', () => {
      const noDenylistScope = createTestScope({ denylist: undefined });
      const serverNoDenylist = new ScopeGuardServer(noDenylistScope);
      expect(serverNoDenylist.getScope().denylist).toBeUndefined();
    });
  });

  describe('scope_get_constraints tool', () => {
    it('should return rate limits', () => {
      const scope = server.getScope();
      expect(scope.constraints.rate_limits.requests_per_second).toBe(10);
      expect(scope.constraints.rate_limits.max_concurrent).toBe(5);
      expect(scope.constraints.rate_limits.burst_limit).toBe(50);
    });

    it('should return budget limits', () => {
      const scope = server.getScope();
      expect(scope.constraints.budget.max_total_requests).toBe(10000);
      expect(scope.constraints.budget.max_requests_per_target).toBe(1000);
      expect(scope.constraints.budget.max_scan_duration_hours).toBe(8);
    });

    it('should return timeout settings', () => {
      const scope = server.getScope();
      expect(scope.constraints.timeouts.connect_timeout_ms).toBe(5000);
      expect(scope.constraints.timeouts.read_timeout_ms).toBe(30000);
      expect(scope.constraints.timeouts.total_timeout_ms).toBe(60000);
    });

    it('should return approval policy', () => {
      const scope = server.getScope();
      expect(scope.approval_policy.mode).toBe('INTERACTIVE');
      expect(scope.approval_policy.timeout_seconds).toBe(300);
      expect(scope.approval_policy.default_action).toBe('DENY');
    });

    it('should return actions configuration', () => {
      const scope = server.getScope();
      expect(scope.actions?.forbidden).toContain('destructive_action');
      expect(scope.actions?.requires_approval).toContain('sensitive_action');
    });
  });

  describe('scope_check_budget tool', () => {
    it('should return initial budget status', () => {
      const budgetTracker = server.getBudgetTracker();
      const status = budgetTracker.getStatus();
      expect(status.total_requests).toBe(0);
      expect(status.max_total_requests).toBe(10000);
      expect(status.remaining_requests).toBe(10000);
      expect(status.budget_exhausted).toBe(false);
    });

    it('should track requests', () => {
      const budgetTracker = server.getBudgetTracker();
      budgetTracker.recordRequest('test.example.com');
      budgetTracker.recordRequest('test.example.com');
      budgetTracker.recordRequest('other.example.com');

      const status = budgetTracker.getStatus();
      expect(status.total_requests).toBe(3);
      expect(status.remaining_requests).toBe(9997);
      expect(status.requests_by_target['test.example.com']).toBe(2);
      expect(status.requests_by_target['other.example.com']).toBe(1);
    });

    it('should track rate limit status', () => {
      const budgetTracker = server.getBudgetTracker();
      const status = budgetTracker.getStatus();
      expect(status.rate_limit_status.current_rate).toBe(0);
      expect(status.rate_limit_status.max_rate).toBe(10);
      expect(status.rate_limit_status.within_limit).toBe(true);
    });

    it('should detect budget exhaustion', () => {
      const smallBudgetScope = createTestScope({
        constraints: {
          ...testScope.constraints,
          budget: {
            max_total_requests: 3,
            max_requests_per_target: 10,
            max_scan_duration_hours: 8
          }
        }
      });
      const serverSmallBudget = new ScopeGuardServer(smallBudgetScope);
      const budgetTracker = serverSmallBudget.getBudgetTracker();

      budgetTracker.recordRequest();
      budgetTracker.recordRequest();
      budgetTracker.recordRequest();

      const status = budgetTracker.getStatus();
      expect(status.budget_exhausted).toBe(true);
      expect(status.remaining_requests).toBe(0);
    });
  });

  describe('scope_record_request tool', () => {
    it('should record requests successfully', () => {
      const budgetTracker = server.getBudgetTracker();
      const result = budgetTracker.recordRequest('test.example.com');
      expect(result).toBe(true);
      expect(budgetTracker.getTotalRequestCount()).toBe(1);
    });

    it('should track per-target requests', () => {
      const budgetTracker = server.getBudgetTracker();
      budgetTracker.recordRequest('target1.example.com');
      budgetTracker.recordRequest('target1.example.com');
      budgetTracker.recordRequest('target2.example.com');

      expect(budgetTracker.getTargetRequestCount('target1.example.com')).toBe(2);
      expect(budgetTracker.getTargetRequestCount('target2.example.com')).toBe(1);
    });

    it('should throw on budget exceeded', () => {
      const smallBudgetScope = createTestScope({
        constraints: {
          ...testScope.constraints,
          budget: {
            max_total_requests: 2,
            max_requests_per_target: 10,
            max_scan_duration_hours: 8
          }
        }
      });
      const serverSmallBudget = new ScopeGuardServer(smallBudgetScope);
      const budgetTracker = serverSmallBudget.getBudgetTracker();

      budgetTracker.recordRequest();
      budgetTracker.recordRequest();
      expect(() => budgetTracker.recordRequest()).toThrow();
    });

    it('should throw on per-target budget exceeded', () => {
      const smallPerTargetScope = createTestScope({
        constraints: {
          ...testScope.constraints,
          budget: {
            max_total_requests: 10000,
            max_requests_per_target: 2,
            max_scan_duration_hours: 8
          }
        }
      });
      const serverSmallPerTarget = new ScopeGuardServer(smallPerTargetScope);
      const budgetTracker = serverSmallPerTarget.getBudgetTracker();

      budgetTracker.recordRequest('target.example.com');
      budgetTracker.recordRequest('target.example.com');
      expect(() => budgetTracker.recordRequest('target.example.com')).toThrow();
    });
  });

  describe('scope_get_identities tool', () => {
    it('should return credentials list', () => {
      const scope = server.getScope();
      expect(scope.credentials).toHaveLength(3);
    });

    it('should include credential types', () => {
      const scope = server.getScope();
      const types = scope.credentials?.map(c => c.type);
      expect(types).toContain('bearer');
      expect(types).toContain('basic');
      expect(types).toContain('api_key');
    });

    it('should include credential scopes', () => {
      const scope = server.getScope();
      const adminCred = scope.credentials?.find(c => c.id === 'admin-user');
      expect(adminCred?.scope).toContain('admin');
    });

    it('should handle empty credentials', () => {
      const noCredsScope = createTestScope({ credentials: undefined });
      const serverNoCreds = new ScopeGuardServer(noCredsScope);
      expect(serverNoCreds.getScope().credentials).toBeUndefined();
    });
  });

  describe('budget duration tracking', () => {
    it('should track elapsed time', () => {
      const budgetTracker = server.getBudgetTracker();
      const elapsed = budgetTracker.getElapsedHours();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(1);
    });

    it('should detect duration exceeded', async () => {
      // Use a scope with very short duration (in hours: 1ms = 0.000000277778 hours)
      const shortDurationScope = createTestScope({
        constraints: {
          ...testScope.constraints,
          budget: {
            max_total_requests: 10000,
            max_requests_per_target: 1000,
            max_scan_duration_hours: 0.00000001 // ~0.036ms - extremely short
          }
        }
      });
      const serverShort = new ScopeGuardServer(shortDurationScope);
      const budgetTracker = serverShort.getBudgetTracker();

      // Wait a tiny bit to ensure duration is exceeded
      await new Promise(resolve => setTimeout(resolve, 5));

      // The duration should be exceeded
      expect(budgetTracker.isDurationExceeded()).toBe(true);
    });

    it('should not exceed duration for normal scan', () => {
      const budgetTracker = server.getBudgetTracker();
      expect(budgetTracker.isDurationExceeded()).toBe(false);
    });
  });

  describe('budget reset', () => {
    it('should reset all counters', () => {
      const budgetTracker = server.getBudgetTracker();

      budgetTracker.recordRequest('target1.example.com');
      budgetTracker.recordRequest('target2.example.com');
      expect(budgetTracker.getTotalRequestCount()).toBe(2);

      budgetTracker.reset();
      expect(budgetTracker.getTotalRequestCount()).toBe(0);
      expect(budgetTracker.getTargetRequestCount('target1.example.com')).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty allowlist domains', () => {
      const emptyDomainsScope = createTestScope({
        allowlist: {
          domains: [],
          ip_ranges: ['192.168.1.0/24'],
          ports: [80, 443]
        }
      });
      const serverEmptyDomains = new ScopeGuardServer(emptyDomainsScope);
      const validator = serverEmptyDomains.getValidator();
      const result = validator.validateTarget('any.domain.com');
      expect(result.valid).toBe(false);
    });

    it('should handle empty allowlist IPs', () => {
      const emptyIPsScope = createTestScope({
        allowlist: {
          domains: ['*.example.com'],
          ip_ranges: [],
          ports: [80, 443]
        }
      });
      const serverEmptyIPs = new ScopeGuardServer(emptyIPsScope);
      const validator = serverEmptyIPs.getValidator();
      const result = validator.validateTarget('8.8.8.8');
      expect(result.valid).toBe(false);
    });

    it('should handle missing ports in allowlist', () => {
      const noPortsScope = createTestScope({
        allowlist: {
          domains: ['*.example.com'],
          ip_ranges: ['192.168.1.0/24']
        }
      });
      const serverNoPorts = new ScopeGuardServer(noPortsScope);
      const validator = serverNoPorts.getValidator();
      // Should still validate domains
      const result = validator.validateTarget('test.example.com');
      expect(result.valid).toBe(true);
    });

    it('should validate staging domain', () => {
      const validator = server.getValidator();
      const result = validator.validateTarget('staging.test.io');
      expect(result.valid).toBe(true);
    });
  });
});
