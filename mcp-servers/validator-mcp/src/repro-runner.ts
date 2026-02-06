/**
 * ReproRunner - Handles reproduction validation of findings
 *
 * Runs the same test N times to confirm the finding is consistent
 * and reproducible.
 */

import * as crypto from 'crypto';
import {
  Finding,
  FindingExpectation,
  ReproAttempt,
  ReproResult,
} from './types.js';

/**
 * Default number of reproduction attempts
 */
const DEFAULT_REPRO_COUNT = 3;

/**
 * Handles reproduction testing for finding validation
 */
export class ReproRunner {
  private readonly defaultCount: number;

  constructor(defaultCount: number = DEFAULT_REPRO_COUNT) {
    this.defaultCount = defaultCount;
  }

  /**
   * Generate SHA-256 hash of response body
   */
  hashResponse(body: string): string {
    return crypto.createHash('sha256').update(body).digest('hex');
  }

  /**
   * Check if response matches expected characteristics
   */
  matchesExpectations(
    statusCode: number,
    responseBody: string,
    expected?: FindingExpectation
  ): boolean {
    if (!expected) {
      // If no expectations specified, consider 2xx responses as matching
      return statusCode >= 200 && statusCode < 300;
    }

    // Check status code if specified
    if (expected.status_code !== undefined && statusCode !== expected.status_code) {
      return false;
    }

    // Check body contains patterns
    if (expected.body_contains) {
      for (const pattern of expected.body_contains) {
        if (!responseBody.includes(pattern)) {
          return false;
        }
      }
    }

    // Check body does not contain patterns
    if (expected.body_not_contains) {
      for (const pattern of expected.body_not_contains) {
        if (responseBody.includes(pattern)) {
          return false;
        }
      }
    }

    // Check body regex pattern
    if (expected.body_regex) {
      const regex = new RegExp(expected.body_regex);
      if (!regex.test(responseBody)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute a single reproduction attempt
   */
  async executeAttempt(
    finding: Finding,
    attemptNumber: number
  ): Promise<ReproAttempt> {
    const startTime = performance.now();

    try {
      const fetchOptions: RequestInit = {
        method: finding.request.method,
        headers: finding.request.headers,
      };

      if (
        finding.request.body &&
        ['POST', 'PUT', 'PATCH'].includes(finding.request.method.toUpperCase())
      ) {
        fetchOptions.body = finding.request.body;
      }

      const response = await fetch(finding.request.url, fetchOptions);
      const responseBody = await response.text();
      const endTime = performance.now();

      const matchedExpectations = this.matchesExpectations(
        response.status,
        responseBody,
        finding.expected
      );

      return {
        attempt: attemptNumber,
        success: true,
        status_code: response.status,
        response_length: responseBody.length,
        response_hash: this.hashResponse(responseBody),
        matched_expectations: matchedExpectations,
        timing_ms: Math.round(endTime - startTime),
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        attempt: attemptNumber,
        success: false,
        status_code: 0,
        response_length: 0,
        response_hash: '',
        matched_expectations: false,
        timing_ms: Math.round(endTime - startTime),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run reproduction validation for a finding
   *
   * @param finding The finding to reproduce
   * @param count Number of reproduction attempts (optional)
   * @returns ReproResult with success rate and consistency info
   */
  async runRepro(finding: Finding, count?: number): Promise<ReproResult> {
    const attemptCount = count ?? this.defaultCount;
    const attempts: ReproAttempt[] = [];

    for (let i = 1; i <= attemptCount; i++) {
      const attempt = await this.executeAttempt(finding, i);
      attempts.push(attempt);
    }

    // Calculate statistics
    const successfulAttempts = attempts.filter((a) => a.success && a.matched_expectations);
    const failedAttempts = attempts.filter((a) => !a.success || !a.matched_expectations);

    // Check consistency - all successful attempts should have similar responses
    const successfulHashes = successfulAttempts.map((a) => a.response_hash);
    const uniqueHashes = new Set(successfulHashes);
    const consistent = uniqueHashes.size <= 1 && successfulAttempts.length > 0;

    return {
      finding_id: finding.finding_id,
      total_attempts: attemptCount,
      successful_attempts: successfulAttempts.length,
      failed_attempts: failedAttempts.length,
      success_rate: attemptCount > 0 ? successfulAttempts.length / attemptCount : 0,
      consistent,
      attempts,
    };
  }

  /**
   * Get the default reproduction count
   */
  getDefaultCount(): number {
    return this.defaultCount;
  }
}
