/**
 * TypeScript interfaces for Scope Guard MCP Server
 * These types match the structure defined in scope/engagement.yaml
 */

export interface EngagementInfo {
  id: string;
  name: string;
  client: string;
  start_date: string;
  end_date: string;
  timezone: string;
}

export interface ScopeAllowlist {
  domains?: string[];
  ip_ranges?: string[];
  ports?: number[];
  services?: string[];
}

export interface ScopeDenylist {
  domains?: string[];
  ip_ranges?: string[];
  ports?: number[];
  keywords?: string[];
}

export interface RateLimits {
  requests_per_second: number;
  max_concurrent: number;
  burst_limit: number;
}

export interface Budget {
  max_total_requests: number;
  max_requests_per_target: number;
  max_scan_duration_hours: number;
}

export interface Timeouts {
  connect_timeout_ms: number;
  read_timeout_ms: number;
  total_timeout_ms: number;
}

export interface ScopeConstraints {
  rate_limits: RateLimits;
  budget: Budget;
  timeouts: Timeouts;
}

export interface Credential {
  id: string;
  type: 'basic' | 'bearer' | 'api_key' | 'oauth2' | 'custom';
  username_env?: string;
  password_env?: string;
  token_env?: string;
  api_key_env?: string;
  scope: string[];
}

export interface Actions {
  forbidden: string[];
  requires_approval: string[];
}

export interface Escalation {
  on_timeout: 'DENY' | 'ALLOW';
  on_error: 'DENY' | 'ALLOW';
  notify: boolean;
}

export interface ApprovalPolicy {
  mode: 'INTERACTIVE' | 'AUTO_APPROVE' | 'DENY_ALL';
  timeout_seconds: number;
  default_action: 'DENY' | 'ALLOW';
  escalation: Escalation;
}

export interface EvidencePolicy {
  enabled: boolean;
  storage_path: string;
  retention_days: number;
  auto_capture: string[];
  redact_patterns: string[];
  formats: string[];
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  audit_trail: boolean;
  correlation_ids: boolean;
  output: {
    console: boolean;
    file: string;
  };
}

export interface EngagementScope {
  schema_version: string;
  engagement: EngagementInfo;
  allowlist: ScopeAllowlist;
  denylist?: ScopeDenylist;
  credentials?: Credential[];
  constraints: ScopeConstraints;
  actions?: Actions;
  approval_policy: ApprovalPolicy;
  evidence_policy?: EvidencePolicy;
  logging?: LoggingConfig;
}

/**
 * Result of target validation
 */
export interface ValidationResult {
  valid: boolean;
  target: string;
  reason?: string;
  matchedRule?: string;
}

/**
 * Budget status information
 */
export interface BudgetStatus {
  total_requests: number;
  max_total_requests: number;
  remaining_requests: number;
  requests_by_target: Record<string, number>;
  rate_limit_status: {
    current_rate: number;
    max_rate: number;
    within_limit: boolean;
  };
  budget_exhausted: boolean;
}

/**
 * Error thrown when scope validation fails
 */
export class ScopeValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message);
    this.name = 'ScopeValidationError';
  }
}

/**
 * Error thrown when target is out of scope
 */
export class OutOfScopeError extends Error {
  constructor(
    public readonly target: string,
    public readonly reason: string
  ) {
    super(`Target '${target}' is out of scope: ${reason}`);
    this.name = 'OutOfScopeError';
  }
}

/**
 * Error thrown when budget is exceeded
 */
export class BudgetExceededError extends Error {
  constructor(
    public readonly budgetType: 'total' | 'per_target' | 'rate',
    public readonly current: number,
    public readonly limit: number
  ) {
    super(`Budget exceeded: ${budgetType} (${current}/${limit})`);
    this.name = 'BudgetExceededError';
  }
}
