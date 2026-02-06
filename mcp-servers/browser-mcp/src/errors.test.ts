/**
 * Tests for Custom Errors
 */

import { describe, it, expect } from 'vitest';
import {
  BrowserMCPError,
  SessionNotFoundError,
  NoActiveSessionError,
  SessionLimitError,
  NavigationError,
  ScopeValidationError,
  ActionError,
  ExtractionError,
  XSSTestError,
  ScreenshotError,
  FormNotFoundError,
  FieldNotFoundError,
  BrowserMCPInitError,
  TimeoutError,
  ProxyConnectionError,
} from './errors.js';

describe('Custom Errors', () => {
  describe('BrowserMCPError', () => {
    it('should set code and message', () => {
      const error = new BrowserMCPError('TEST_CODE', 'Test message');

      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('BrowserMCPError');
    });

    it('should be instanceof Error', () => {
      const error = new BrowserMCPError('TEST', 'Test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BrowserMCPError);
    });
  });

  describe('SessionNotFoundError', () => {
    it('should include session ID', () => {
      const error = new SessionNotFoundError('session-123');

      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.sessionId).toBe('session-123');
      expect(error.message).toContain('session-123');
    });
  });

  describe('NoActiveSessionError', () => {
    it('should have correct code and message', () => {
      const error = new NoActiveSessionError();

      expect(error.code).toBe('NO_ACTIVE_SESSION');
      expect(error.message).toContain('browser_session_create');
    });
  });

  describe('SessionLimitError', () => {
    it('should include limit details', () => {
      const error = new SessionLimitError(5, 5);

      expect(error.code).toBe('SESSION_LIMIT_EXCEEDED');
      expect(error.maxSessions).toBe(5);
      expect(error.currentSessions).toBe(5);
      expect(error.message).toContain('5');
    });
  });

  describe('NavigationError', () => {
    it('should include URL', () => {
      const error = new NavigationError('https://example.com', 'Connection refused');

      expect(error.code).toBe('NAVIGATION_FAILED');
      expect(error.url).toBe('https://example.com');
      expect(error.message).toContain('https://example.com');
      expect(error.message).toContain('Connection refused');
    });

    it('should include original error', () => {
      const originalError = new Error('Network error');
      const error = new NavigationError('https://example.com', 'Failed', originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe('ScopeValidationError', () => {
    it('should include target and reason', () => {
      const error = new ScopeValidationError('https://evil.com', 'Not in allowlist');

      expect(error.code).toBe('SCOPE_VALIDATION_FAILED');
      expect(error.target).toBe('https://evil.com');
      expect(error.reason).toBe('Not in allowlist');
    });
  });

  describe('ActionError', () => {
    it('should include action', () => {
      const error = new ActionError('click button', 'Element not found');

      expect(error.code).toBe('ACTION_FAILED');
      expect(error.action).toBe('click button');
      expect(error.message).toContain('click button');
    });
  });

  describe('ExtractionError', () => {
    it('should include instruction', () => {
      const error = new ExtractionError('get prices', 'No data found');

      expect(error.code).toBe('EXTRACTION_FAILED');
      expect(error.instruction).toBe('get prices');
    });
  });

  describe('XSSTestError', () => {
    it('should include field name', () => {
      const error = new XSSTestError('search', 'Form not found');

      expect(error.code).toBe('XSS_TEST_FAILED');
      expect(error.fieldName).toBe('search');
      expect(error.message).toContain('search');
    });
  });

  describe('ScreenshotError', () => {
    it('should have correct code', () => {
      const error = new ScreenshotError('Page not loaded');

      expect(error.code).toBe('SCREENSHOT_FAILED');
    });

    it('should include original error', () => {
      const originalError = new Error('Buffer error');
      const error = new ScreenshotError('Failed', originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe('FormNotFoundError', () => {
    it('should include selector', () => {
      const error = new FormNotFoundError('#login-form');

      expect(error.code).toBe('FORM_NOT_FOUND');
      expect(error.selector).toBe('#login-form');
      expect(error.message).toContain('#login-form');
    });
  });

  describe('FieldNotFoundError', () => {
    it('should include field name', () => {
      const error = new FieldNotFoundError('email');

      expect(error.code).toBe('FIELD_NOT_FOUND');
      expect(error.fieldName).toBe('email');
    });

    it('should include form selector if provided', () => {
      const error = new FieldNotFoundError('email', '#contact-form');

      expect(error.formSelector).toBe('#contact-form');
      expect(error.message).toContain('#contact-form');
    });
  });

  describe('BrowserMCPInitError', () => {
    it('should have correct code', () => {
      const error = new BrowserMCPInitError('Missing config');

      expect(error.code).toBe('INIT_ERROR');
    });
  });

  describe('TimeoutError', () => {
    it('should include operation and timeout', () => {
      const error = new TimeoutError('navigation', 30000);

      expect(error.code).toBe('TIMEOUT');
      expect(error.operation).toBe('navigation');
      expect(error.timeoutMs).toBe(30000);
      expect(error.message).toContain('30000');
    });
  });

  describe('ProxyConnectionError', () => {
    it('should include proxy URL', () => {
      const error = new ProxyConnectionError('http://127.0.0.1:8080');

      expect(error.code).toBe('PROXY_CONNECTION_FAILED');
      expect(error.proxyUrl).toBe('http://127.0.0.1:8080');
    });
  });
});
