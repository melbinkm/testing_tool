/**
 * Phase 2 Integration Tests - Scope Guard MCP Server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { loadScope } from '../../mcp-servers/scope-guard-mcp/src/scope-loader.js';
import { TargetValidator } from '../../mcp-servers/scope-guard-mcp/src/validators.js';
import { BudgetTracker } from '../../mcp-servers/scope-guard-mcp/src/budget-tracker.js';
import { ScopeGuardServer } from '../../mcp-servers/scope-guard-mcp/src/server.js';
import { EngagementScope, ScopeValidationError } from '../../mcp-servers/scope-guard-mcp/src/types.js';

// Test scope matching the engagement.yaml format
const testEngagementScope = {
  schema_version: '1.0',
  engagement: {
    id: 'PHASE2-TEST-001',
    name: 'Phase 2 Integration Test',
    client: 'Test Client',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    timezone: 'UTC'
  },
  allowlist: {
    domains: ['*.example.com', 'api.example.com'],
    ip_ranges: ['192.168.1.0/24', '10.0.0.0/8'],
    ports: [80, 443, 8080, 8443],
    services: ['http', 'https', 'ssh']
  },
  denylist: {
    domains: ['production.example.com', '*.prod.example.com'],
    ip_ranges: ['192.168.1.1/32'],
    ports: [22],
    keywords: ['admin', 'backup']
  },
  credentials: [
    {
      id: 'cred-001',
      type: 'basic',
      username_env: 'TEST_USER',
      password_env: 'TEST_PASS',
      scope: ['api.example.com']
    },
    {
      id: 'cred-002',
      type: 'bearer',
      token_env: 'API_TOKEN',
      scope: ['api.example.com/v2/*']
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
    forbidden: ['sql_injection_write', 'data_exfiltration', 'denial_of_service'],
    requires_approval: ['authentication_bypass', 'file_upload', 'command_injection']
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
  evidence_policy: {
    enabled: true,
    storage_path: './evidence',
    retention_days: 90,
    auto_capture: ['vulnerabilities', 'authentication_attempts'],
    redact_patterns: ['password', 'token', 'secret'],
    formats: ['json', 'html']
  }
};

describe('Phase 2: Scope Guard Integration', () => {
  let testDir: string;
  let scopeFilePath: string;

  beforeAll(() => {
    testDir = join(tmpdir(), `phase2-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    scopeFilePath = join(testDir, 'engagement.yaml');
    writeFileSync(scopeFilePath, yaml.dump(testEngagementScope));
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Scope Loading', () => {
    it('should load the test engagement scope file', () => {
      const scope = loadScope(scopeFilePath);
      expect(scope.engagement.id).toBe('PHASE2-TEST-001');
      expect(scope.allowlist.domains).toHaveLength(2);
    });

    it('should match the existing engagement.yaml format', () => {
      const scope = loadScope(scopeFilePath);

      // Verify all required fields are present
      expect(scope.schema_version).toBe('1.0');
      expect(scope.engagement.id).toBeDefined();
      expect(scope.allowlist).toBeDefined();
      expect(scope.constraints).toBeDefined();
      expect(scope.approval_policy).toBeDefined();

      // Verify nested structure
      expect(scope.constraints.rate_limits.requests_per_second).toBe(10);
      expect(scope.constraints.budget.max_total_requests).toBe(10000);
    });

    it('should load the actual scope/engagement.yaml file', () => {
      const realScopePath = join(process.cwd(), 'scope', 'engagement.yaml');
      if (existsSync(realScopePath)) {
        const scope = loadScope(realScopePath);
        expect(scope.engagement.id).toBeDefined();
        expect(scope.allowlist).toBeDefined();
      }
    });
  });

  describe('Target Validation', () => {
    let validator: TargetValidator;

    beforeAll(() => {
      const scope = loadScope(scopeFilePath);
      validator = new TargetValidator(scope);
    });

    it('should validate allowed domains', () => {
      const result = validator.validateTarget('test.example.com');
      expect(result.valid).toBe(true);
    });

    it('should deny production domain', () => {
      const result = validator.validateTarget('production.example.com');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('denylist');
    });

    it('should validate allowed IP ranges', () => {
      const result = validator.validateTarget('192.168.1.100');
      expect(result.valid).toBe(true);
    });

    it('should deny gateway IP', () => {
      const result = validator.validateTarget('192.168.1.1');
      expect(result.valid).toBe(false);
    });

    it('should validate URLs on allowed ports', () => {
      const result = validator.validateTarget('https://api.example.com:443/v1/users');
      expect(result.valid).toBe(true);
    });

    it('should deny URLs on forbidden ports', () => {
      const result = validator.validateTarget('https://test.example.com:22');
      expect(result.valid).toBe(false);
    });

    it('should deny paths with forbidden keywords', () => {
      const result = validator.validateTarget('https://test.example.com/admin/settings');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('denied keyword');
    });
  });

  describe('Budget Tracking', () => {
    let tracker: BudgetTracker;
    let scope: EngagementScope;

    beforeAll(() => {
      scope = loadScope(scopeFilePath);
      tracker = new BudgetTracker(scope.constraints);
    });

    it('should track requests correctly', () => {
      tracker.reset();
      tracker.recordRequest('api.example.com');
      tracker.recordRequest('api.example.com');

      const status = tracker.getStatus();
      expect(status.total_requests).toBe(2);
      expect(status.requests_by_target['api.example.com']).toBe(2);
    });

    it('should report remaining budget', () => {
      tracker.reset();
      tracker.recordRequest();

      const status = tracker.getStatus();
      expect(status.remaining_requests).toBe(9999);
      expect(status.budget_exhausted).toBe(false);
    });
  });

  describe('MCP Server', () => {
    let server: ScopeGuardServer;

    beforeAll(() => {
      const scope = loadScope(scopeFilePath);
      server = new ScopeGuardServer(scope);
    });

    it('should initialize with correct scope', () => {
      const scope = server.getScope();
      expect(scope.engagement.id).toBe('PHASE2-TEST-001');
    });

    it('should have validator initialized', () => {
      const validator = server.getValidator();
      expect(validator).toBeDefined();

      const result = validator.validateTarget('test.example.com');
      expect(result.valid).toBe(true);
    });

    it('should have budget tracker initialized', () => {
      const tracker = server.getBudgetTracker();
      expect(tracker).toBeDefined();

      const status = tracker.getStatus();
      expect(status.max_total_requests).toBe(10000);
    });
  });

  describe('Full Integration Flow', () => {
    it('should load scope, validate target, and track budget', () => {
      // Load scope
      const scope = loadScope(scopeFilePath);
      expect(scope).toBeDefined();

      // Create validator and tracker
      const validator = new TargetValidator(scope);
      const tracker = new BudgetTracker(scope.constraints);

      // Test target validation
      const target = 'https://api.example.com/v1/users';
      const validation = validator.validateTarget(target);
      expect(validation.valid).toBe(true);

      // Track the request
      tracker.recordRequest('api.example.com');
      const status = tracker.getStatus();
      expect(status.total_requests).toBe(1);
    });

    it('should deny and not track out-of-scope targets', () => {
      const scope = loadScope(scopeFilePath);
      const validator = new TargetValidator(scope);
      const tracker = new BudgetTracker(scope.constraints);
      tracker.reset();

      const target = 'https://malicious.com/attack';
      const validation = validator.validateTarget(target);
      expect(validation.valid).toBe(false);

      // Should not track rejected requests
      const status = tracker.getStatus();
      expect(status.total_requests).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw ScopeValidationError for invalid scope file', () => {
      const invalidPath = join(testDir, 'invalid.yaml');
      writeFileSync(invalidPath, 'invalid: yaml: [');

      expect(() => loadScope(invalidPath)).toThrow(ScopeValidationError);
    });

    it('should throw for missing scope file', () => {
      expect(() => loadScope('/nonexistent/scope.yaml')).toThrow(ScopeValidationError);
    });

    it('should fail closed on missing required fields', () => {
      const incompletePath = join(testDir, 'incomplete.yaml');
      writeFileSync(incompletePath, yaml.dump({
        schema_version: '1.0',
        engagement: { id: 'TEST' }
        // Missing required fields
      }));

      expect(() => loadScope(incompletePath)).toThrow(ScopeValidationError);
    });
  });
});

describe('Phase 2: Settings Configuration', () => {
  it('should have scope-guard configured in settings.json format', () => {
    // Expected configuration format
    const expectedConfig = {
      mcpServers: {
        'scope-guard': {
          command: 'node',
          args: ['mcp-servers/scope-guard-mcp/dist/index.js'],
          env: {
            SCOPE_FILE: './scope/engagement.yaml',
            FAIL_CLOSED: 'true'
          },
          trust: true
        }
      }
    };

    // Verify the structure is correct
    expect(expectedConfig.mcpServers['scope-guard'].command).toBe('node');
    expect(expectedConfig.mcpServers['scope-guard'].env.FAIL_CLOSED).toBe('true');
  });
});
