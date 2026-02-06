/**
 * Signal Detector
 * Detects anomalies and potential vulnerabilities in HTTP responses
 */

import {
  HttpResponse,
  FuzzSignal,
  SignalType,
  SignalSeverity,
  PayloadType,
} from './types.js';
import { createHash } from 'crypto';

/**
 * Error indicators in response bodies
 */
const ERROR_INDICATORS = {
  sql: [
    'sql syntax',
    'mysql_fetch',
    'ora-01756',
    'postgresql',
    'sqlite3',
    'jdbc',
    'odbc',
    'syntax error',
    'unclosed quotation',
    'unterminated string',
    'sql server',
    'sqlstate',
  ],
  stackTrace: [
    'stacktrace',
    'stack trace',
    'traceback',
    'at line',
    'exception in',
    'error in',
    'fatal error',
    'caused by',
    'java.lang.',
    'at java.',
    'at org.',
    'at com.',
    'file "',
    '.py", line',
    '.php on line',
    '.rb:',
  ],
  debug: [
    'debug=true',
    'debug mode',
    'development mode',
    'dev server',
    '[debug]',
    'debug info',
    'error_reporting',
  ],
  path: [
    '/var/www',
    '/home/',
    'c:\\',
    'd:\\',
    '/usr/',
    '/etc/',
    'document root',
    'web root',
  ],
  internal: [
    'internal server error',
    'server error',
    'application error',
    'runtime error',
    'unhandled exception',
  ],
};

/**
 * Reflection patterns for XSS detection
 */
const REFLECTION_PATTERNS = [
  '<script',
  'javascript:',
  'onerror=',
  'onload=',
  'onclick=',
  'onmouseover=',
  'alert(',
  'prompt(',
  'confirm(',
  '{{',
  '${',
  '#{',
];

/**
 * Configuration for signal detection
 */
interface DetectorConfig {
  timingThresholdMultiplier: number;  // Response time threshold as multiple of baseline
  minTimingThreshold: number;         // Minimum timing difference in ms
  errorStatusCodes: number[];         // Status codes indicating errors
  reflectionMinLength: number;        // Minimum payload length for reflection check
}

const DEFAULT_CONFIG: DetectorConfig = {
  timingThresholdMultiplier: 3,
  minTimingThreshold: 1000,
  errorStatusCodes: [500, 501, 502, 503, 504],
  reflectionMinLength: 3,
};

export class SignalDetector {
  private config: DetectorConfig;

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Hash a response body for comparison
   */
  hashResponse(body: string): string {
    return createHash('sha256').update(body).digest('hex').substring(0, 16);
  }

  /**
   * Detect all signals from a response
   */
  detectSignals(
    response: HttpResponse,
    payload: string,
    payloadType: PayloadType,
    baseline?: HttpResponse
  ): FuzzSignal[] {
    const signals: FuzzSignal[] = [];

    // Check for error signals
    const errorSignal = this.detectErrorSignal(response, payload, payloadType);
    if (errorSignal) signals.push(errorSignal);

    // Check for timing anomaly (only if baseline provided)
    if (baseline) {
      const timingSignal = this.detectTimingSignal(response, payload, payloadType, baseline);
      if (timingSignal) signals.push(timingSignal);
    }

    // Check for reflection
    const reflectionSignal = this.detectReflectionSignal(response, payload, payloadType);
    if (reflectionSignal) signals.push(reflectionSignal);

    // Check for differential response (only if baseline provided)
    if (baseline) {
      const differentialSignal = this.detectDifferentialSignal(response, payload, payloadType, baseline);
      if (differentialSignal) signals.push(differentialSignal);
    }

    return signals;
  }

  /**
   * Detect error-based signals (5xx status, stack traces, SQL errors)
   */
  detectErrorSignal(
    response: HttpResponse,
    payload: string,
    payloadType: PayloadType
  ): FuzzSignal | null {
    const bodyLower = response.body.toLowerCase();
    let evidence: string | undefined;
    let severity: SignalSeverity = 'low';
    let details: string | undefined;

    // Check for error status codes
    if (this.config.errorStatusCodes.includes(response.status)) {
      evidence = `HTTP ${response.status}`;
      severity = 'medium';
      details = 'Server returned error status code';
    }

    // Check for SQL error indicators
    for (const indicator of ERROR_INDICATORS.sql) {
      if (bodyLower.includes(indicator)) {
        evidence = indicator;
        severity = 'high';
        details = 'Potential SQL error disclosure';
        break;
      }
    }

    // Check for stack traces
    for (const indicator of ERROR_INDICATORS.stackTrace) {
      if (bodyLower.includes(indicator)) {
        evidence = evidence || indicator;
        severity = severity === 'high' ? 'high' : 'medium';
        details = details || 'Stack trace detected in response';
        break;
      }
    }

    // Check for path disclosure
    for (const indicator of ERROR_INDICATORS.path) {
      if (bodyLower.includes(indicator)) {
        evidence = evidence || indicator;
        severity = severity === 'high' ? 'high' : 'low';
        details = details || 'Path disclosure detected';
        break;
      }
    }

    // Check for debug info
    for (const indicator of ERROR_INDICATORS.debug) {
      if (bodyLower.includes(indicator)) {
        evidence = evidence || indicator;
        severity = 'info';
        details = details || 'Debug information detected';
        break;
      }
    }

    if (!evidence) return null;

    // Calculate confidence based on evidence strength
    let confidence = 0.5;
    if (this.config.errorStatusCodes.includes(response.status)) confidence += 0.2;
    if (severity === 'high') confidence += 0.2;
    if (payloadType === 'injection') confidence += 0.1;

    return {
      payload: this.truncatePayload(payload),
      payload_type: payloadType,
      response_status: response.status,
      response_time_ms: response.timing_ms,
      signal_type: 'error',
      severity,
      confidence: Math.min(confidence, 1.0),
      evidence,
      details,
    };
  }

  /**
   * Detect timing-based signals (slow responses indicating injection)
   */
  detectTimingSignal(
    response: HttpResponse,
    payload: string,
    payloadType: PayloadType,
    baseline: HttpResponse
  ): FuzzSignal | null {
    const baselineTime = baseline.timing_ms;
    const responseTime = response.timing_ms;

    // Calculate threshold
    const threshold = Math.max(
      baselineTime * this.config.timingThresholdMultiplier,
      this.config.minTimingThreshold
    );

    if (responseTime <= threshold) return null;

    const multiplier = responseTime / baselineTime;
    let severity: SignalSeverity = 'low';

    if (multiplier > 10) {
      severity = 'high';
    } else if (multiplier > 5) {
      severity = 'medium';
    }

    // Higher confidence for injection payloads
    let confidence = 0.4;
    if (payloadType === 'injection') confidence += 0.3;
    if (multiplier > 5) confidence += 0.2;

    return {
      payload: this.truncatePayload(payload),
      payload_type: payloadType,
      response_status: response.status,
      response_time_ms: responseTime,
      signal_type: 'timing',
      severity,
      confidence: Math.min(confidence, 1.0),
      evidence: `${responseTime}ms (baseline: ${baselineTime}ms, ${multiplier.toFixed(1)}x)`,
      details: `Response time ${multiplier.toFixed(1)}x slower than baseline`,
    };
  }

  /**
   * Detect reflection-based signals (XSS potential)
   */
  detectReflectionSignal(
    response: HttpResponse,
    payload: string,
    payloadType: PayloadType
  ): FuzzSignal | null {
    if (payload.length < this.config.reflectionMinLength) return null;

    const body = response.body;
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Check if payload is reflected in response
    if (!body.includes(payloadStr)) return null;

    let severity: SignalSeverity = 'low';
    let evidence = `Payload reflected in response`;
    let details = 'Input is echoed back in response';

    // Check for dangerous reflection patterns
    const payloadLower = payloadStr.toLowerCase();
    const bodyLower = body.toLowerCase();

    for (const pattern of REFLECTION_PATTERNS) {
      if (payloadLower.includes(pattern) && bodyLower.includes(pattern)) {
        severity = 'high';
        evidence = `Dangerous pattern "${pattern}" reflected`;
        details = 'Potential XSS - dangerous pattern reflected without encoding';
        break;
      }
    }

    // Higher confidence for injection payloads reflecting
    let confidence = 0.5;
    if (payloadType === 'injection') confidence += 0.3;
    if (severity === 'high') confidence += 0.2;

    return {
      payload: this.truncatePayload(payloadStr),
      payload_type: payloadType,
      response_status: response.status,
      response_time_ms: response.timing_ms,
      signal_type: 'reflection',
      severity,
      confidence: Math.min(confidence, 1.0),
      evidence,
      details,
    };
  }

  /**
   * Detect differential signals (different response vs baseline)
   */
  detectDifferentialSignal(
    response: HttpResponse,
    payload: string,
    payloadType: PayloadType,
    baseline: HttpResponse
  ): FuzzSignal | null {
    // Compare status codes
    const statusDiff = response.status !== baseline.status;

    // Compare response body hashes
    const responseHash = this.hashResponse(response.body);
    const baselineHash = this.hashResponse(baseline.body);
    const bodyDiff = responseHash !== baselineHash;

    // Compare response lengths (significant difference)
    const lengthRatio = response.body.length / (baseline.body.length || 1);
    const lengthDiff = lengthRatio < 0.5 || lengthRatio > 2;

    if (!statusDiff && !bodyDiff && !lengthDiff) return null;

    // Only flag significant differences
    const differences: string[] = [];
    if (statusDiff) differences.push(`status: ${baseline.status} -> ${response.status}`);
    if (bodyDiff) differences.push(`body hash changed`);
    if (lengthDiff) differences.push(`length: ${baseline.body.length} -> ${response.body.length}`);

    let severity: SignalSeverity = 'info';
    if (statusDiff && this.config.errorStatusCodes.includes(response.status)) {
      severity = 'medium';
    }
    if (statusDiff && response.status >= 200 && response.status < 300 && baseline.status >= 400) {
      severity = 'high'; // Bypassed protection
    }

    let confidence = 0.3;
    if (statusDiff) confidence += 0.2;
    if (payloadType === 'injection' || payloadType === 'boundary') confidence += 0.2;
    if (severity === 'high') confidence += 0.2;

    return {
      payload: this.truncatePayload(payload),
      payload_type: payloadType,
      response_status: response.status,
      response_time_ms: response.timing_ms,
      signal_type: 'differential',
      severity,
      confidence: Math.min(confidence, 1.0),
      evidence: differences.join(', '),
      details: 'Response differs significantly from baseline',
    };
  }

  /**
   * Truncate long payloads for display
   */
  private truncatePayload(payload: string): string {
    const maxLength = 100;
    if (payload.length <= maxLength) return payload;
    return payload.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get configuration
   */
  getConfig(): DetectorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export a default instance
export const signalDetector = new SignalDetector();

// Export error indicators for testing
export { ERROR_INDICATORS, REFLECTION_PATTERNS };
