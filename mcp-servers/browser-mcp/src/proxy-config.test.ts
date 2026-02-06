/**
 * Tests for Proxy Configuration
 */

import { describe, it, expect } from 'vitest';
import {
  getBrowserLaunchOptions,
  getContextOptions,
  parseProxyUrl,
  validateProxyConfig,
  getDefaultSessionConfig,
  DEFAULT_PROXY_URL,
  DEFAULT_VIEWPORT,
  DEFAULT_TIMEOUT,
} from './proxy-config.js';
import type { BrowserSessionConfig } from './types.js';

describe('proxy-config', () => {
  describe('getBrowserLaunchOptions', () => {
    it('should set headless from config', () => {
      const config: BrowserSessionConfig = {
        headless: true,
      };

      const options = getBrowserLaunchOptions(config);
      expect(options.headless).toBe(true);
    });

    it('should configure proxy when provided', () => {
      const config: BrowserSessionConfig = {
        headless: false,
        proxyUrl: 'http://127.0.0.1:9090',
      };

      const options = getBrowserLaunchOptions(config);
      expect(options.proxy).toBeDefined();
      expect(options.proxy?.server).toBe('http://127.0.0.1:9090');
    });

    it('should not configure proxy when not provided', () => {
      const config: BrowserSessionConfig = {
        headless: false,
      };

      const options = getBrowserLaunchOptions(config);
      expect(options.proxy).toBeUndefined();
    });

    it('should include bypass for localhost', () => {
      const config: BrowserSessionConfig = {
        headless: false,
        proxyUrl: 'http://127.0.0.1:8080',
      };

      const options = getBrowserLaunchOptions(config);
      expect(options.proxy?.bypass).toContain('localhost');
    });

    it('should include browser args', () => {
      const config: BrowserSessionConfig = {
        headless: false,
      };

      const options = getBrowserLaunchOptions(config);
      expect(options.args).toBeDefined();
      expect(options.args).toContain('--disable-blink-features=AutomationControlled');
    });
  });

  describe('getContextOptions', () => {
    it('should use default viewport when not specified', () => {
      const config: BrowserSessionConfig = {
        headless: false,
      };

      const options = getContextOptions(config);
      expect(options.viewport).toEqual(DEFAULT_VIEWPORT);
    });

    it('should use custom viewport when specified', () => {
      const config: BrowserSessionConfig = {
        headless: false,
        viewport: { width: 1920, height: 1080 },
      };

      const options = getContextOptions(config);
      expect(options.viewport).toEqual({ width: 1920, height: 1080 });
    });

    it('should ignore HTTPS errors by default', () => {
      const config: BrowserSessionConfig = {
        headless: false,
      };

      const options = getContextOptions(config);
      expect(options.ignoreHTTPSErrors).toBe(true);
    });

    it('should respect ignoreHTTPSErrors config', () => {
      const config: BrowserSessionConfig = {
        headless: false,
        ignoreHTTPSErrors: false,
      };

      const options = getContextOptions(config);
      expect(options.ignoreHTTPSErrors).toBe(false);
    });

    it('should include correlation headers when provided', () => {
      const config: BrowserSessionConfig = {
        headless: false,
      };
      const headers = {
        'X-Engagement-ID': 'test-123',
        'X-Browser-MCP': 'true',
      };

      const options = getContextOptions(config, headers);
      expect(options.extraHTTPHeaders).toEqual(headers);
    });

    it('should set custom user agent when provided', () => {
      const config: BrowserSessionConfig = {
        headless: false,
        userAgent: 'Custom User Agent',
      };

      const options = getContextOptions(config);
      expect(options.userAgent).toBe('Custom User Agent');
    });
  });

  describe('parseProxyUrl', () => {
    it('should parse valid HTTP proxy URL', () => {
      const result = parseProxyUrl('http://127.0.0.1:8080');

      expect(result).toEqual({ host: '127.0.0.1', port: 8080 });
    });

    it('should parse valid HTTPS proxy URL', () => {
      const result = parseProxyUrl('https://proxy.example.com:443');

      expect(result).toEqual({ host: 'proxy.example.com', port: 443 });
    });

    it('should use default port for HTTP without explicit port', () => {
      const result = parseProxyUrl('http://proxy.example.com');

      expect(result).toEqual({ host: 'proxy.example.com', port: 8080 });
    });

    it('should return null for invalid URL', () => {
      const result = parseProxyUrl('not-a-url');

      expect(result).toBeNull();
    });
  });

  describe('validateProxyConfig', () => {
    it('should validate no proxy as valid', () => {
      const result = validateProxyConfig();

      expect(result.valid).toBe(true);
    });

    it('should validate valid proxy URL', () => {
      const result = validateProxyConfig('http://127.0.0.1:8080');

      expect(result.valid).toBe(true);
    });

    it('should reject invalid proxy URL', () => {
      const result = validateProxyConfig('invalid-url');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid proxy URL format');
    });
  });

  describe('getDefaultSessionConfig', () => {
    it('should return defaults', () => {
      const config = getDefaultSessionConfig();

      expect(config.headless).toBe(false);
      expect(config.proxyUrl).toBe(DEFAULT_PROXY_URL);
      expect(config.viewport).toEqual(DEFAULT_VIEWPORT);
      expect(config.timeout).toBe(DEFAULT_TIMEOUT);
      expect(config.ignoreHTTPSErrors).toBe(true);
    });

    it('should apply overrides', () => {
      const config = getDefaultSessionConfig({
        headless: true,
        proxyUrl: 'http://custom:9090',
      });

      expect(config.headless).toBe(true);
      expect(config.proxyUrl).toBe('http://custom:9090');
    });
  });

  describe('constants', () => {
    it('should export DEFAULT_PROXY_URL', () => {
      expect(DEFAULT_PROXY_URL).toBe('http://127.0.0.1:8080');
    });

    it('should export DEFAULT_VIEWPORT', () => {
      expect(DEFAULT_VIEWPORT).toEqual({ width: 1280, height: 720 });
    });

    it('should export DEFAULT_TIMEOUT', () => {
      expect(DEFAULT_TIMEOUT).toBe(60000);
    });
  });
});
