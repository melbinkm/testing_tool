import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Scope Template', () => {
  const scopePath = path.join(PROJECT_ROOT, 'scope/engagement.yaml');

  it('should exist', () => {
    expect(fs.existsSync(scopePath)).toBe(true);
  });

  it('should be valid YAML', () => {
    const content = fs.readFileSync(scopePath, 'utf-8');
    expect(() => yaml.load(content)).not.toThrow();
  });

  describe('Schema Structure', () => {
    let scope: Record<string, unknown>;

    beforeAll(() => {
      const content = fs.readFileSync(scopePath, 'utf-8');
      scope = yaml.load(content) as Record<string, unknown>;
    });

    it('should have schema_version', () => {
      expect(scope).toHaveProperty('schema_version');
    });

    it('should have engagement section', () => {
      expect(scope).toHaveProperty('engagement');
      expect(scope.engagement).toHaveProperty('id');
      expect(scope.engagement).toHaveProperty('name');
    });

    it('should have allowlist section', () => {
      expect(scope).toHaveProperty('allowlist');
      const allowlist = scope.allowlist as Record<string, unknown>;
      expect(allowlist).toHaveProperty('domains');
      expect(allowlist).toHaveProperty('ip_ranges');
      expect(Array.isArray(allowlist.domains)).toBe(true);
      expect(Array.isArray(allowlist.ip_ranges)).toBe(true);
    });

    it('should have denylist section', () => {
      expect(scope).toHaveProperty('denylist');
      const denylist = scope.denylist as Record<string, unknown>;
      expect(denylist).toHaveProperty('domains');
      expect(denylist).toHaveProperty('ip_ranges');
    });

    it('should have credentials section', () => {
      expect(scope).toHaveProperty('credentials');
      expect(Array.isArray(scope.credentials)).toBe(true);

      const creds = scope.credentials as Array<Record<string, unknown>>;
      if (creds.length > 0) {
        expect(creds[0]).toHaveProperty('id');
        expect(creds[0]).toHaveProperty('type');
      }
    });

    it('should have constraints section with rate limits', () => {
      expect(scope).toHaveProperty('constraints');
      const constraints = scope.constraints as Record<string, unknown>;
      expect(constraints).toHaveProperty('rate_limits');
      expect(constraints).toHaveProperty('budget');

      const rateLimits = constraints.rate_limits as Record<string, unknown>;
      expect(rateLimits).toHaveProperty('requests_per_second');
      expect(rateLimits).toHaveProperty('max_concurrent');
    });

    it('should have actions section with forbidden and requires_approval', () => {
      expect(scope).toHaveProperty('actions');
      const actions = scope.actions as Record<string, unknown>;
      expect(actions).toHaveProperty('forbidden');
      expect(actions).toHaveProperty('requires_approval');
      expect(Array.isArray(actions.forbidden)).toBe(true);
      expect(Array.isArray(actions.requires_approval)).toBe(true);
    });

    it('should have approval_policy section', () => {
      expect(scope).toHaveProperty('approval_policy');
      const policy = scope.approval_policy as Record<string, unknown>;
      expect(policy).toHaveProperty('mode');
      expect(policy).toHaveProperty('default_action');

      const validModes = ['INTERACTIVE', 'AUTO_APPROVE', 'DENY_ALL'];
      expect(validModes).toContain(policy.mode);
    });

    it('should have evidence_policy section', () => {
      expect(scope).toHaveProperty('evidence_policy');
      const evidence = scope.evidence_policy as Record<string, unknown>;
      expect(evidence).toHaveProperty('enabled');
      expect(evidence).toHaveProperty('storage_path');
      expect(evidence).toHaveProperty('auto_capture');
    });

    it('should have logging section', () => {
      expect(scope).toHaveProperty('logging');
      const logging = scope.logging as Record<string, unknown>;
      expect(logging).toHaveProperty('level');
      expect(logging).toHaveProperty('audit_trail');
    });
  });

  describe('Security Defaults', () => {
    let scope: Record<string, unknown>;

    beforeAll(() => {
      const content = fs.readFileSync(scopePath, 'utf-8');
      scope = yaml.load(content) as Record<string, unknown>;
    });

    it('should have forbidden dangerous actions', () => {
      const actions = scope.actions as Record<string, unknown>;
      const forbidden = actions.forbidden as string[];

      expect(forbidden).toContain('denial_of_service');
      expect(forbidden).toContain('data_exfiltration');
    });

    it('should default to DENY on approval timeout', () => {
      const policy = scope.approval_policy as Record<string, unknown>;
      expect(policy.default_action).toBe('DENY');
    });

    it('should have redaction patterns for sensitive data', () => {
      const evidence = scope.evidence_policy as Record<string, unknown>;
      const redactPatterns = evidence.redact_patterns as string[];

      expect(redactPatterns).toContain('password');
      expect(redactPatterns).toContain('token');
      expect(redactPatterns).toContain('secret');
    });
  });
});
