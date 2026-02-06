/**
 * Types for the Validator MCP Server
 */

/**
 * HTTP request configuration for a finding
 */
export interface FindingRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Expected response characteristics for validation
 */
export interface FindingExpectation {
  status_code?: number;
  body_contains?: string[];
  body_not_contains?: string[];
  body_regex?: string;
}

/**
 * A security finding to be validated
 */
export interface Finding {
  finding_id: string;
  title: string;
  request: FindingRequest;
  expected?: FindingExpectation;
  identity_id?: string;
}

/**
 * Result of a single reproduction attempt
 */
export interface ReproAttempt {
  attempt: number;
  success: boolean;
  status_code: number;
  response_length: number;
  response_hash: string;
  matched_expectations: boolean;
  timing_ms: number;
  error?: string;
}

/**
 * Summary of reproduction validation
 */
export interface ReproResult {
  finding_id: string;
  total_attempts: number;
  successful_attempts: number;
  failed_attempts: number;
  success_rate: number;
  consistent: boolean;
  attempts: ReproAttempt[];
}

/**
 * Configuration for negative control testing
 */
export interface NegativeControlConfig {
  control_type: 'unauthenticated' | 'invalid_token' | 'different_user' | 'modified_request';
  modified_headers?: Record<string, string>;
  modified_body?: string;
  remove_auth?: boolean;
  expected_status?: number;
}

/**
 * Result of negative control validation
 */
export interface NegativeControlResult {
  finding_id: string;
  control_type: string;
  passed: boolean;
  expected_behavior: string;
  actual_status: number;
  actual_behavior: string;
  message: string;
}

/**
 * Identity configuration for cross-identity testing
 */
export interface IdentityConfig {
  identity_id: string;
  auth_header?: string;
  auth_type?: 'bearer' | 'basic' | 'api_key' | 'cookie';
  cookies?: Record<string, string>;
  should_have_access: boolean;
}

/**
 * Single identity test result for cross-identity validation
 */
export interface CrossIdentityTestResult {
  identity_id: string;
  status_code: number;
  response_hash: string;
  has_access: boolean;
  expected_access: boolean;
  timing_ms: number;
  error?: string;
}

/**
 * Result of cross-identity validation
 */
export interface CrossIdentityResult {
  finding_id: string;
  identities_tested: string[];
  results: CrossIdentityTestResult[];
  authorization_enforced: boolean;
  violations: string[];
  message: string;
}

/**
 * Confidence score for a finding
 */
export interface ConfidenceScore {
  finding_id: string;
  repro_score: number;
  negative_control_score: number;
  cross_identity_score: number;
  overall_score: number;
  recommendation: 'promote' | 'investigate' | 'dismiss';
  factors: string[];
}

/**
 * Input for confidence calculation
 */
export interface ValidationInputs {
  finding_id: string;
  repro_result?: ReproResult;
  negative_control_result?: NegativeControlResult;
  cross_identity_result?: CrossIdentityResult;
}
