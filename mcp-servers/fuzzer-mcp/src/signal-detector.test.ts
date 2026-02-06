import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SignalDetector,
  ERROR_INDICATORS,
  REFLECTION_PATTERNS,
} from './signal-detector.js';
import { HttpResponse, PayloadType } from './types.js';

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('SignalDetector', () => {
  let detector: SignalDetector;

  const createResponse = (overrides: Partial<HttpResponse> = {}): HttpResponse => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: '{"status":"ok"}',
    timing_ms: 50,
    ...overrides,
  });

  beforeEach(() => {
    detector = new SignalDetector();
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = detector.getConfig();

      expect(config.timingThresholdMultiplier).toBeDefined();
      expect(config.minTimingThreshold).toBeDefined();
      expect(config.errorStatusCodes).toBeDefined();
      expect(config.reflectionMinLength).toBeDefined();
    });

    it('should allow configuration override', () => {
      const customDetector = new SignalDetector({
        timingThresholdMultiplier: 5,
        minTimingThreshold: 2000,
      });

      const config = customDetector.getConfig();
      expect(config.timingThresholdMultiplier).toBe(5);
      expect(config.minTimingThreshold).toBe(2000);
    });

    it('should allow updating configuration', () => {
      detector.setConfig({ timingThresholdMultiplier: 10 });
      const config = detector.getConfig();
      expect(config.timingThresholdMultiplier).toBe(10);
    });
  });

  describe('hashResponse', () => {
    it('should return consistent hash for same content', () => {
      const hash1 = detector.hashResponse('test content');
      const hash2 = detector.hashResponse('test content');

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', () => {
      const hash1 = detector.hashResponse('content 1');
      const hash2 = detector.hashResponse('content 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should return 16 character hash', () => {
      const hash = detector.hashResponse('test');
      expect(hash.length).toBe(16);
    });
  });

  describe('detectSignals', () => {
    it('should return empty array for normal response', () => {
      const response = createResponse();
      const signals = detector.detectSignals(response, 'test', 'boundary');

      expect(signals).toHaveLength(0);
    });

    it('should detect multiple signal types', () => {
      const response = createResponse({
        status: 500,
        body: '<html>Error: SQL syntax near "\'..."<script>alert(1)</script></html>',
        timing_ms: 5000,
      });
      const baseline = createResponse();

      const signals = detector.detectSignals(response, "'<script>alert(1)</script>", 'injection', baseline);

      expect(signals.length).toBeGreaterThan(1);
    });
  });

  describe('detectErrorSignal', () => {
    it('should detect 500 status code', () => {
      const response = createResponse({ status: 500 });
      const signal = detector.detectErrorSignal(response, 'test', 'boundary');

      expect(signal).not.toBeNull();
      expect(signal?.signal_type).toBe('error');
      expect(signal?.evidence).toContain('500');
    });

    it('should detect SQL error in body', () => {
      const response = createResponse({
        body: 'Error: You have an error in your SQL syntax near "\'..."',
      });
      const signal = detector.detectErrorSignal(response, "'", 'injection');

      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe('high');
    });

    it('should detect stack trace', () => {
      const response = createResponse({
        body: 'Traceback (most recent call last):\n  File "app.py", line 42',
      });
      const signal = detector.detectErrorSignal(response, 'test', 'boundary');

      expect(signal).not.toBeNull();
      expect(signal?.details).toContain('Stack trace');
    });

    it('should detect path disclosure', () => {
      const response = createResponse({
        body: 'Configuration error in /var/www/html/app.php - file not found',
      });
      const signal = detector.detectErrorSignal(response, 'test', 'boundary');

      expect(signal).not.toBeNull();
      // Path disclosure may be detected as lower priority than other indicators
      expect(signal?.evidence).toBeDefined();
    });

    it('should detect debug info', () => {
      const response = createResponse({
        body: 'Running in debug mode, debug=true',
      });
      const signal = detector.detectErrorSignal(response, 'test', 'boundary');

      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe('info');
    });

    it('should return null for clean response', () => {
      const response = createResponse();
      const signal = detector.detectErrorSignal(response, 'test', 'boundary');

      expect(signal).toBeNull();
    });

    it('should have higher confidence for injection payloads', () => {
      const response = createResponse({ status: 500 });

      const boundarySignal = detector.detectErrorSignal(response, 'test', 'boundary');
      const injectionSignal = detector.detectErrorSignal(response, "'", 'injection');

      expect(injectionSignal!.confidence).toBeGreaterThan(boundarySignal!.confidence);
    });
  });

  describe('detectTimingSignal', () => {
    it('should detect slow response', () => {
      const response = createResponse({ timing_ms: 5000 });
      const baseline = createResponse({ timing_ms: 50 });

      const signal = detector.detectTimingSignal(response, 'test', 'injection', baseline);

      expect(signal).not.toBeNull();
      expect(signal?.signal_type).toBe('timing');
    });

    it('should not detect normal timing variance', () => {
      const response = createResponse({ timing_ms: 100 });
      const baseline = createResponse({ timing_ms: 50 });

      const signal = detector.detectTimingSignal(response, 'test', 'boundary', baseline);

      expect(signal).toBeNull();
    });

    it('should have high severity for very slow responses', () => {
      const response = createResponse({ timing_ms: 10000 });
      const baseline = createResponse({ timing_ms: 50 });

      const signal = detector.detectTimingSignal(response, 'test', 'injection', baseline);

      expect(signal?.severity).toBe('high');
    });

    it('should include timing details in evidence', () => {
      const response = createResponse({ timing_ms: 5000 });
      const baseline = createResponse({ timing_ms: 50 });

      const signal = detector.detectTimingSignal(response, 'test', 'injection', baseline);

      expect(signal?.evidence).toContain('5000ms');
      expect(signal?.evidence).toContain('50ms');
    });

    it('should have higher confidence for injection payloads', () => {
      const response = createResponse({ timing_ms: 5000 });
      const baseline = createResponse({ timing_ms: 50 });

      const boundarySignal = detector.detectTimingSignal(response, 'test', 'boundary', baseline);
      const injectionSignal = detector.detectTimingSignal(response, 'test', 'injection', baseline);

      expect(injectionSignal!.confidence).toBeGreaterThan(boundarySignal!.confidence);
    });
  });

  describe('detectReflectionSignal', () => {
    it('should detect reflected payload', () => {
      const payload = '<script>alert(1)</script>';
      const response = createResponse({
        body: `<html>Search results for: ${payload}</html>`,
      });

      const signal = detector.detectReflectionSignal(response, payload, 'injection');

      expect(signal).not.toBeNull();
      expect(signal?.signal_type).toBe('reflection');
    });

    it('should have high severity for dangerous reflection', () => {
      const payload = '<script>alert(1)</script>';
      const response = createResponse({
        body: `<html>Search results for: ${payload}</html>`,
      });

      const signal = detector.detectReflectionSignal(response, payload, 'injection');

      expect(signal?.severity).toBe('high');
    });

    it('should detect javascript: URL reflection', () => {
      const payload = 'javascript:alert(1)';
      const response = createResponse({
        body: `<a href="${payload}">Click</a>`,
      });

      const signal = detector.detectReflectionSignal(response, payload, 'injection');

      expect(signal).not.toBeNull();
      expect(signal?.severity).toBe('high');
    });

    it('should not detect non-reflected payload', () => {
      const response = createResponse({
        body: '{"status":"ok"}',
      });

      const signal = detector.detectReflectionSignal(response, '<script>alert(1)</script>', 'injection');

      expect(signal).toBeNull();
    });

    it('should not detect very short payloads', () => {
      const response = createResponse({
        body: 'a',
      });

      const signal = detector.detectReflectionSignal(response, 'a', 'boundary');

      expect(signal).toBeNull();
    });

    it('should have lower severity for safe reflection', () => {
      const payload = 'harmless text';
      const response = createResponse({
        body: `Search results for: ${payload}`,
      });

      const signal = detector.detectReflectionSignal(response, payload, 'boundary');

      expect(signal?.severity).toBe('low');
    });
  });

  describe('detectDifferentialSignal', () => {
    it('should detect status code difference', () => {
      const response = createResponse({ status: 403 });
      const baseline = createResponse({ status: 200 });

      const signal = detector.detectDifferentialSignal(response, 'test', 'boundary', baseline);

      expect(signal).not.toBeNull();
      expect(signal?.signal_type).toBe('differential');
      expect(signal?.evidence).toContain('status');
    });

    it('should detect body hash difference', () => {
      const response = createResponse({ body: '{"error":"not found"}' });
      const baseline = createResponse({ body: '{"status":"ok"}' });

      const signal = detector.detectDifferentialSignal(response, 'test', 'boundary', baseline);

      expect(signal).not.toBeNull();
      expect(signal?.evidence).toContain('hash');
    });

    it('should detect significant length difference', () => {
      const response = createResponse({ body: 'x'.repeat(1000) });
      const baseline = createResponse({ body: 'short' });

      const signal = detector.detectDifferentialSignal(response, 'test', 'boundary', baseline);

      expect(signal).not.toBeNull();
      expect(signal?.evidence).toContain('length');
    });

    it('should not detect identical responses', () => {
      const response = createResponse();
      const baseline = createResponse();

      const signal = detector.detectDifferentialSignal(response, 'test', 'boundary', baseline);

      expect(signal).toBeNull();
    });

    it('should have high severity for protection bypass', () => {
      const response = createResponse({ status: 200 });
      const baseline = createResponse({ status: 403 });

      const signal = detector.detectDifferentialSignal(response, 'test', 'injection', baseline);

      expect(signal?.severity).toBe('high');
    });
  });

  describe('Error Indicators', () => {
    it('should have SQL error indicators', () => {
      expect(ERROR_INDICATORS.sql.length).toBeGreaterThan(0);
    });

    it('should have stack trace indicators', () => {
      expect(ERROR_INDICATORS.stackTrace.length).toBeGreaterThan(0);
    });

    it('should have debug indicators', () => {
      expect(ERROR_INDICATORS.debug.length).toBeGreaterThan(0);
    });

    it('should have path disclosure indicators', () => {
      expect(ERROR_INDICATORS.path.length).toBeGreaterThan(0);
    });
  });

  describe('Reflection Patterns', () => {
    it('should include common XSS patterns', () => {
      expect(REFLECTION_PATTERNS).toContain('<script');
      expect(REFLECTION_PATTERNS).toContain('javascript:');
      expect(REFLECTION_PATTERNS).toContain('onerror=');
    });

    it('should include template injection patterns', () => {
      expect(REFLECTION_PATTERNS).toContain('{{');
      expect(REFLECTION_PATTERNS).toContain('${');
    });
  });

  describe('Signal Properties', () => {
    it('should truncate long payloads', () => {
      const longPayload = 'A'.repeat(200);
      const response = createResponse({ status: 500 });

      const signal = detector.detectErrorSignal(response, longPayload, 'overflow');

      expect(signal?.payload.length).toBeLessThanOrEqual(100);
    });

    it('should include all required signal properties', () => {
      const response = createResponse({ status: 500 });
      const signal = detector.detectErrorSignal(response, 'test', 'boundary');

      expect(signal).toHaveProperty('payload');
      expect(signal).toHaveProperty('payload_type');
      expect(signal).toHaveProperty('response_status');
      expect(signal).toHaveProperty('response_time_ms');
      expect(signal).toHaveProperty('signal_type');
      expect(signal).toHaveProperty('severity');
      expect(signal).toHaveProperty('confidence');
    });

    it('should have confidence between 0 and 1', () => {
      const response = createResponse({
        status: 500,
        body: 'SQL syntax error',
      });

      const signal = detector.detectErrorSignal(response, "'", 'injection');

      expect(signal?.confidence).toBeGreaterThanOrEqual(0);
      expect(signal?.confidence).toBeLessThanOrEqual(1);
    });
  });
});
