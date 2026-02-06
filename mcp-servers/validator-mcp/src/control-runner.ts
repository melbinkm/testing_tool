/**
 * ControlRunner - Handles negative control and cross-identity validation
 *
 * Negative controls verify the vulnerability doesn't exist in control scenarios.
 * Cross-identity validation confirms authorization is properly enforced.
 */

import * as crypto from 'crypto';
import {
  Finding,
  NegativeControlConfig,
  NegativeControlResult,
  IdentityConfig,
  CrossIdentityTestResult,
  CrossIdentityResult,
} from './types.js';

/**
 * Handles negative control and cross-identity testing
 */
export class ControlRunner {
  /**
   * Generate SHA-256 hash of response body
   */
  hashResponse(body: string): string {
    return crypto.createHash('sha256').update(body).digest('hex');
  }

  /**
   * Build authentication headers for an identity
   */
  buildAuthHeaders(identity: IdentityConfig): Record<string, string> {
    const headers: Record<string, string> = {};

    // Handle cookie auth type separately since it uses cookies object, not auth_header
    if (identity.auth_type === 'cookie' && identity.cookies) {
      const cookieStr = Object.entries(identity.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
      headers['Cookie'] = cookieStr;
      return headers;
    }

    if (identity.auth_header) {
      switch (identity.auth_type) {
        case 'bearer':
        case 'basic':
          headers['Authorization'] = identity.auth_header;
          break;
        case 'api_key':
          headers['X-API-Key'] = identity.auth_header;
          break;
      }
    }

    return headers;
  }

  /**
   * Modify request headers based on control configuration
   */
  private buildControlHeaders(
    originalHeaders: Record<string, string> | undefined,
    config: NegativeControlConfig
  ): Record<string, string> {
    let headers = { ...originalHeaders };

    // Remove authentication if specified
    if (config.remove_auth) {
      delete headers['Authorization'];
      delete headers['X-API-Key'];
      delete headers['Cookie'];
    }

    // Apply modified headers
    if (config.modified_headers) {
      headers = { ...headers, ...config.modified_headers };
    }

    return headers;
  }

  /**
   * Get expected behavior description for a control type
   */
  private getExpectedBehavior(config: NegativeControlConfig): string {
    switch (config.control_type) {
      case 'unauthenticated':
        return 'Request without authentication should be rejected (401/403)';
      case 'invalid_token':
        return 'Request with invalid token should be rejected (401/403)';
      case 'different_user':
        return 'Request from unauthorized user should be rejected (403)';
      case 'modified_request':
        return config.expected_status
          ? `Modified request should return status ${config.expected_status}`
          : 'Modified request should be rejected';
      default:
        return 'Request should be rejected';
    }
  }

  /**
   * Determine if the control test passed
   */
  private evaluateControlResult(
    statusCode: number,
    config: NegativeControlConfig
  ): boolean {
    // If specific expected status is provided, check for it
    if (config.expected_status !== undefined) {
      return statusCode === config.expected_status;
    }

    // Default: control passes if request is rejected (4xx status)
    switch (config.control_type) {
      case 'unauthenticated':
        return statusCode === 401 || statusCode === 403;
      case 'invalid_token':
        return statusCode === 401 || statusCode === 403;
      case 'different_user':
        return statusCode === 403 || statusCode === 404;
      case 'modified_request':
        return statusCode >= 400;
      default:
        return statusCode >= 400;
    }
  }

  /**
   * Run negative control test for a finding
   *
   * @param finding The finding to test
   * @param config Control configuration
   * @returns NegativeControlResult with pass/fail status
   */
  async runNegativeControl(
    finding: Finding,
    config: NegativeControlConfig
  ): Promise<NegativeControlResult> {
    try {
      const headers = this.buildControlHeaders(finding.request.headers, config);
      const body = config.modified_body ?? finding.request.body;

      const fetchOptions: RequestInit = {
        method: finding.request.method,
        headers,
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(finding.request.method.toUpperCase())) {
        fetchOptions.body = body;
      }

      const response = await fetch(finding.request.url, fetchOptions);
      const passed = this.evaluateControlResult(response.status, config);

      return {
        finding_id: finding.finding_id,
        control_type: config.control_type,
        passed,
        expected_behavior: this.getExpectedBehavior(config),
        actual_status: response.status,
        actual_behavior: passed
          ? 'Request was properly rejected'
          : `Request unexpectedly returned status ${response.status}`,
        message: passed
          ? `Negative control passed: ${config.control_type} test confirmed authorization is enforced`
          : `Negative control FAILED: ${config.control_type} test shows potential authorization bypass`,
      };
    } catch (error) {
      return {
        finding_id: finding.finding_id,
        control_type: config.control_type,
        passed: false,
        expected_behavior: this.getExpectedBehavior(config),
        actual_status: 0,
        actual_behavior: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        message: `Negative control error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Test a single identity for cross-identity validation
   */
  private async testIdentity(
    finding: Finding,
    identity: IdentityConfig
  ): Promise<CrossIdentityTestResult> {
    const startTime = performance.now();

    try {
      const authHeaders = this.buildAuthHeaders(identity);
      const headers = { ...finding.request.headers, ...authHeaders };

      const fetchOptions: RequestInit = {
        method: finding.request.method,
        headers,
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

      // Determine if the identity has access based on status code
      const hasAccess = response.status >= 200 && response.status < 400;

      return {
        identity_id: identity.identity_id,
        status_code: response.status,
        response_hash: this.hashResponse(responseBody),
        has_access: hasAccess,
        expected_access: identity.should_have_access,
        timing_ms: Math.round(endTime - startTime),
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        identity_id: identity.identity_id,
        status_code: 0,
        response_hash: '',
        has_access: false,
        expected_access: identity.should_have_access,
        timing_ms: Math.round(endTime - startTime),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run cross-identity validation for a finding
   *
   * @param finding The finding to test
   * @param identities Array of identity configurations to test
   * @returns CrossIdentityResult with authorization enforcement status
   */
  async runCrossIdentity(
    finding: Finding,
    identities: IdentityConfig[]
  ): Promise<CrossIdentityResult> {
    const results: CrossIdentityTestResult[] = [];

    for (const identity of identities) {
      const result = await this.testIdentity(finding, identity);
      results.push(result);
    }

    // Check for authorization violations
    const violations: string[] = [];
    for (const result of results) {
      if (result.has_access !== result.expected_access) {
        if (result.has_access && !result.expected_access) {
          violations.push(
            `${result.identity_id}: Gained unauthorized access (status ${result.status_code})`
          );
        } else if (!result.has_access && result.expected_access) {
          violations.push(
            `${result.identity_id}: Denied expected access (status ${result.status_code})`
          );
        }
      }
    }

    const authorizationEnforced = violations.length === 0;

    return {
      finding_id: finding.finding_id,
      identities_tested: identities.map((i) => i.identity_id),
      results,
      authorization_enforced: authorizationEnforced,
      violations,
      message: authorizationEnforced
        ? 'Authorization is properly enforced across all tested identities'
        : `Authorization violations detected: ${violations.join('; ')}`,
    };
  }
}
