/**
 * Tests for Scope Validator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScopeValidator,
  createDisabledValidator,
  createScopeValidator,
} from './scope-validator.js';
import { ScopeValidationError } from './errors.js';

describe('ScopeValidator', () => {
  describe('disabled validator', () => {
    it('should allow any URL when disabled', async () => {
      const validator = createDisabledValidator();

      const result = await validator.validate('http://any-domain.com');
      expect(result.valid).toBe(true);
    });

    it('should report disabled status', () => {
      const validator = createDisabledValidator();
      expect(validator.isEnabled()).toBe(false);
    });
  });

  describe('enabled validator', () => {
    let validator: ScopeValidator;

    beforeEach(() => {
      validator = createScopeValidator(true, ['example.com', '*.test.com'], ['denied.com']);
    });

    it('should report enabled status', () => {
      expect(validator.isEnabled()).toBe(true);
    });

    describe('protocol validation', () => {
      it('should allow http URLs', async () => {
        const result = await validator.validate('http://example.com');
        expect(result.valid).toBe(true);
      });

      it('should allow https URLs', async () => {
        const result = await validator.validate('https://example.com');
        expect(result.valid).toBe(true);
      });

      it('should reject file URLs', async () => {
        const result = await validator.validate('file:///etc/passwd');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Invalid protocol');
      });

      it('should reject javascript URLs', async () => {
        const result = await validator.validate('javascript:alert(1)');
        expect(result.valid).toBe(false);
      });

      it('should reject ftp URLs', async () => {
        const result = await validator.validate('ftp://ftp.example.com');
        expect(result.valid).toBe(false);
      });
    });

    describe('private IP validation', () => {
      it('should reject localhost by default', async () => {
        const result = await validator.validate('http://localhost');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Private IP');
      });

      it('should reject 127.0.0.1 by default', async () => {
        const result = await validator.validate('http://127.0.0.1');
        expect(result.valid).toBe(false);
      });

      it('should reject 10.x.x.x addresses', async () => {
        const result = await validator.validate('http://10.0.0.1');
        expect(result.valid).toBe(false);
      });

      it('should reject 192.168.x.x addresses', async () => {
        const result = await validator.validate('http://192.168.1.1');
        expect(result.valid).toBe(false);
      });

      it('should reject 172.16-31.x.x addresses', async () => {
        const result = await validator.validate('http://172.16.0.1');
        expect(result.valid).toBe(false);
      });

      it('should allow private IPs when configured', async () => {
        const validatorWithPrivate = createScopeValidator(true, undefined, undefined, true);
        const result = await validatorWithPrivate.validate('http://192.168.1.1');
        expect(result.valid).toBe(true);
      });
    });

    describe('port validation', () => {
      it('should reject dangerous port 22 (SSH)', async () => {
        const result = await validator.validate('http://example.com:22');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Dangerous port');
      });

      it('should reject dangerous port 3389 (RDP)', async () => {
        const result = await validator.validate('http://example.com:3389');
        expect(result.valid).toBe(false);
      });

      it('should allow standard HTTP port 80', async () => {
        const result = await validator.validate('http://example.com:80');
        expect(result.valid).toBe(true);
      });

      it('should allow standard HTTPS port 443', async () => {
        const result = await validator.validate('https://example.com:443');
        expect(result.valid).toBe(true);
      });

      it('should allow common web ports', async () => {
        const result = await validator.validate('http://example.com:8080');
        expect(result.valid).toBe(true);
      });
    });

    describe('domain allowlist', () => {
      it('should allow exact domain match', async () => {
        const result = await validator.validate('http://example.com');
        expect(result.valid).toBe(true);
      });

      it('should allow wildcard subdomain match', async () => {
        const result = await validator.validate('http://sub.test.com');
        expect(result.valid).toBe(true);
      });

      it('should allow deep subdomain with wildcard', async () => {
        const result = await validator.validate('http://deep.sub.test.com');
        expect(result.valid).toBe(true);
      });

      it('should reject domain not in allowlist', async () => {
        const result = await validator.validate('http://other-domain.com');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('not in allowed list');
      });
    });

    describe('domain denylist', () => {
      it('should reject denied domain', async () => {
        const validator = createScopeValidator(true, undefined, ['denied.com']);
        const result = await validator.validate('http://denied.com');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('explicitly denied');
      });

      it('should reject before checking allowlist', async () => {
        const validator = createScopeValidator(true, ['denied.com'], ['denied.com']);
        const result = await validator.validate('http://denied.com');
        expect(result.valid).toBe(false);
      });
    });

    describe('invalid URLs', () => {
      it('should reject malformed URLs', async () => {
        const result = await validator.validate('not-a-valid-url');
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Invalid URL format');
      });
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw for valid URL', async () => {
      const validator = createDisabledValidator();
      await expect(validator.validateOrThrow('http://any.com')).resolves.toBeUndefined();
    });

    it('should throw ScopeValidationError for invalid URL', async () => {
      const validator = createScopeValidator(true, ['allowed.com']);
      await expect(validator.validateOrThrow('http://other.com')).rejects.toThrow(
        ScopeValidationError
      );
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', async () => {
      const validator = new ScopeValidator({ enabled: true, allowedDomains: ['old.com'] });

      let result = await validator.validate('http://new.com');
      expect(result.valid).toBe(false);

      validator.updateConfig({ allowedDomains: ['new.com'] });

      result = await validator.validate('http://new.com');
      expect(result.valid).toBe(true);
    });

    it('should allow disabling validation', async () => {
      const validator = new ScopeValidator({ enabled: true, allowedDomains: ['allowed.com'] });

      validator.updateConfig({ enabled: false });

      const result = await validator.validate('http://any.com');
      expect(result.valid).toBe(true);
    });
  });
});
