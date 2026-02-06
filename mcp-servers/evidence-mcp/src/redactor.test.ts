/**
 * Redactor unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Redactor, DEFAULT_PATTERNS, getRedactor, resetRedactor } from './redactor.js';
import type { Artifact } from './types.js';

describe('Redactor', () => {
  let redactor: Redactor;

  beforeEach(() => {
    redactor = new Redactor();
    resetRedactor();
  });

  describe('constructor', () => {
    it('should load default patterns', () => {
      const patterns = redactor.getPatterns();
      expect(patterns.length).toBe(DEFAULT_PATTERNS.length);
    });

    it('should accept custom config', () => {
      const customRedactor = new Redactor({
        mask_char: '#',
        preserve_length: true,
        patterns: [{ name: 'custom', pattern: 'secret\\d+' }],
      });

      expect(customRedactor.getMaskChar()).toBe('#');
      const patterns = customRedactor.getPatterns();
      expect(patterns.some((p) => p.name === 'custom')).toBe(true);
    });

    it('should override default patterns with custom patterns of same name', () => {
      const customRedactor = new Redactor({
        patterns: [{ name: 'api_key', pattern: 'my-custom-pattern' }],
      });

      const patterns = customRedactor.getPatterns();
      const apiKeyPattern = patterns.find((p) => p.name === 'api_key');
      expect(apiKeyPattern?.pattern).toBe('my-custom-pattern');
    });
  });

  describe('addPattern', () => {
    it('should add a new pattern', () => {
      const initialCount = redactor.getPatterns().length;
      redactor.addPattern({ name: 'new_pattern', pattern: 'test\\d+' });

      expect(redactor.getPatterns().length).toBe(initialCount + 1);
    });

    it('should throw error for pattern without name', () => {
      expect(() => {
        redactor.addPattern({ name: '', pattern: 'test' });
      }).toThrow('Pattern must have name and pattern properties');
    });

    it('should throw error for pattern without pattern string', () => {
      expect(() => {
        redactor.addPattern({ name: 'test', pattern: '' });
      }).toThrow('Pattern must have name and pattern properties');
    });

    it('should update existing pattern with same name', () => {
      redactor.addPattern({ name: 'test', pattern: 'pattern1' });
      redactor.addPattern({ name: 'test', pattern: 'pattern2' });

      const patterns = redactor.getPatterns();
      const testPattern = patterns.find((p) => p.name === 'test');
      expect(testPattern?.pattern).toBe('pattern2');
    });
  });

  describe('removePattern', () => {
    it('should remove an existing pattern', () => {
      const initialCount = redactor.getPatterns().length;
      const removed = redactor.removePattern('api_key');

      expect(removed).toBe(true);
      expect(redactor.getPatterns().length).toBe(initialCount - 1);
    });

    it('should return false for non-existent pattern', () => {
      const removed = redactor.removePattern('non_existent');
      expect(removed).toBe(false);
    });
  });

  describe('setMaskChar', () => {
    it('should set mask character', () => {
      redactor.setMaskChar('#');
      expect(redactor.getMaskChar()).toBe('#');
    });

    it('should throw error for multi-character mask', () => {
      expect(() => {
        redactor.setMaskChar('##');
      }).toThrow('Mask character must be a single character');
    });

    it('should throw error for empty mask', () => {
      expect(() => {
        redactor.setMaskChar('');
      }).toThrow('Mask character must be a single character');
    });
  });

  describe('redact', () => {
    it('should handle empty content', () => {
      const { content, result } = redactor.redact('');

      expect(content).toBe('');
      expect(result.original_length).toBe(0);
      expect(result.redacted_length).toBe(0);
      expect(result.patterns_applied).toEqual([]);
      expect(result.redaction_count).toBe(0);
    });

    it('should preserve non-sensitive content', () => {
      const text = 'This is a normal message without secrets';
      const { content, result } = redactor.redact(text);

      expect(content).toBe(text);
      expect(result.redaction_count).toBe(0);
    });

    it('should redact API keys', () => {
      const text = 'api_key=abc123def456ghi789jkl012mno345';
      const { content, result } = redactor.redact(text);

      expect(content).not.toContain('abc123def456ghi789jkl012mno345');
      expect(result.patterns_applied).toContain('api_key');
      expect(result.redaction_count).toBeGreaterThan(0);
    });

    it('should redact Bearer tokens', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[REDACTED]');
      expect(result.patterns_applied).toContain('bearer_token');
    });

    it('should redact Basic auth', () => {
      const text = 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[REDACTED]');
      expect(result.patterns_applied).toContain('basic_auth');
    });

    it('should redact passwords', () => {
      const text = 'password=mysecretpassword123';
      const { content, result } = redactor.redact(text);

      expect(content).not.toContain('mysecretpassword123');
      expect(result.patterns_applied).toContain('password');
    });

    it('should redact credit card numbers', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[CREDIT_CARD_REDACTED]');
      expect(result.patterns_applied).toContain('credit_card');
    });

    it('should redact credit card numbers without dashes', () => {
      const text = 'Card: 4111111111111111';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[CREDIT_CARD_REDACTED]');
    });

    it('should redact SSN', () => {
      const text = 'SSN: 123-45-6789';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[SSN_REDACTED]');
      expect(result.patterns_applied).toContain('ssn');
    });

    it('should redact email addresses', () => {
      const text = 'Email: user@example.com';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[EMAIL_REDACTED]');
      expect(result.patterns_applied).toContain('email');
    });

    it('should redact private IP addresses', () => {
      const text = 'Server: 192.168.1.100';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[PRIVATE_IP_REDACTED]');
      expect(result.patterns_applied).toContain('private_ip');
    });

    it('should redact 10.x.x.x private IPs', () => {
      const text = 'Server: 10.0.0.1';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[PRIVATE_IP_REDACTED]');
    });

    it('should redact 172.16-31.x.x private IPs', () => {
      const text = 'Server: 172.16.0.1';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[PRIVATE_IP_REDACTED]');
    });

    it('should redact JWT tokens', () => {
      const text = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[JWT_REDACTED]');
      expect(result.patterns_applied).toContain('jwt_token');
    });

    it('should redact AWS keys', () => {
      const text = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[AWS_KEY_REDACTED]');
      expect(result.patterns_applied).toContain('aws_key');
    });

    it('should redact GitHub tokens', () => {
      const text = 'Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[GITHUB_TOKEN_REDACTED]');
      expect(result.patterns_applied).toContain('github_token');
    });

    it('should redact multiple patterns in same content', () => {
      const text = 'email: user@example.com, password=secret123, ip: 192.168.1.1';
      const { content, result } = redactor.redact(text);

      expect(content).toContain('[EMAIL_REDACTED]');
      expect(content).toContain('[REDACTED]');
      expect(content).toContain('[PRIVATE_IP_REDACTED]');
      expect(result.patterns_applied.length).toBeGreaterThan(1);
    });

    it('should preserve length when configured', () => {
      const lengthRedactor = new Redactor({ preserve_length: true });
      const text = 'Email: test@example.com';
      const { content } = lengthRedactor.redact(text);

      // The redacted content should have same length as original
      expect(content.length).toBe(text.length);
      expect(content).toContain('*'.repeat('test@example.com'.length));
    });
  });

  describe('redactArtifact', () => {
    it('should redact artifact content', () => {
      const artifact: Artifact = {
        artifact_id: 'ART-001',
        type: 'request',
        name: 'login-request',
        content: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        content_type: 'text/plain',
        timestamp: '2024-01-01T00:00:00Z',
        redacted: false,
      };

      const { artifact: redacted, result } = redactor.redactArtifact(artifact);

      expect(redacted.content).toContain('[REDACTED]');
      expect(redacted.redacted).toBe(true);
      expect(result.redaction_count).toBeGreaterThan(0);
    });

    it('should preserve redacted flag if already true', () => {
      const artifact: Artifact = {
        artifact_id: 'ART-001',
        type: 'request',
        name: 'request',
        content: 'no sensitive data',
        content_type: 'text/plain',
        timestamp: '2024-01-01T00:00:00Z',
        redacted: true,
      };

      const { artifact: redacted } = redactor.redactArtifact(artifact);

      expect(redacted.redacted).toBe(true);
    });

    it('should not modify original artifact', () => {
      const artifact: Artifact = {
        artifact_id: 'ART-001',
        type: 'request',
        name: 'request',
        content: 'password=secret',
        content_type: 'text/plain',
        timestamp: '2024-01-01T00:00:00Z',
        redacted: false,
      };

      redactor.redactArtifact(artifact);

      expect(artifact.content).toBe('password=secret');
      expect(artifact.redacted).toBe(false);
    });
  });

  describe('containsSensitiveData', () => {
    it('should return false for empty content', () => {
      expect(redactor.containsSensitiveData('')).toBe(false);
    });

    it('should return false for safe content', () => {
      expect(redactor.containsSensitiveData('Hello world')).toBe(false);
    });

    it('should return true for content with API key', () => {
      expect(redactor.containsSensitiveData('api_key=abc123def456ghi789jkl012mno345')).toBe(true);
    });

    it('should return true for content with email', () => {
      expect(redactor.containsSensitiveData('contact: user@example.com')).toBe(true);
    });

    it('should return true for content with password', () => {
      // The pattern expects password=value or password:value without space after
      expect(redactor.containsSensitiveData('password=mysecret')).toBe(true);
    });
  });

  describe('getRedactor singleton', () => {
    it('should return same instance', () => {
      resetRedactor();
      const instance1 = getRedactor();
      const instance2 = getRedactor();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getRedactor();
      resetRedactor();
      const instance2 = getRedactor();

      expect(instance1).not.toBe(instance2);
    });
  });
});
