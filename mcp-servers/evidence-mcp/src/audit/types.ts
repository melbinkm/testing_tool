/**
 * Types for Audit Trail Components
 */

/**
 * Run environment type
 */
export type Environment = 'SANDBOX' | 'STAGING' | 'PRODUCTION';

/**
 * Action status type
 */
export type ActionStatus = 'proposed' | 'approved' | 'blocked' | 'executed' | 'failed';

/**
 * Run manifest - captures metadata about a pentest run
 */
export interface RunManifest {
  schema_version: string;
  engagement_id: string;
  run_id: string;
  started_at: string;        // ISO 8601
  ended_at?: string;         // ISO 8601
  scope_hash: string;        // SHA-256 of scope file
  scope_file?: string;       // Path to scope file
  environment: Environment;
  operator?: string;
  tool_versions: Record<string, string>;
  tags?: string[];
  notes?: string;
}

/**
 * Action ledger entry - tracks individual actions
 */
export interface ActionLedgerEntry {
  schema_version: string;
  action_id: string;
  run_id: string;
  hypothesis_id?: string;
  tool_name: string;
  tool_params?: Record<string, unknown>;
  status: ActionStatus;
  requested_at: string;      // ISO 8601
  executed_at?: string;      // ISO 8601
  completed_at?: string;     // ISO 8601
  correlation_ids?: Record<string, string>;
  request_hash?: string;
  response_hash?: string;
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Options for creating a run manifest
 */
export interface CreateManifestOptions {
  engagement_id: string;
  scope_file?: string;
  scope_content?: string;
  environment?: Environment;
  operator?: string;
  tool_versions?: Record<string, string>;
  tags?: string[];
  notes?: string;
}

/**
 * Options for recording an action
 */
export interface RecordActionOptions {
  run_id: string;
  tool_name: string;
  tool_params?: Record<string, unknown>;
  hypothesis_id?: string;
  correlation_ids?: Record<string, string>;
}

/**
 * Action update options
 */
export interface UpdateActionOptions {
  status: ActionStatus;
  request_hash?: string;
  response_hash?: string;
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Ledger query options
 */
export interface LedgerQueryOptions {
  run_id?: string;
  tool_name?: string;
  status?: ActionStatus | ActionStatus[];
  hypothesis_id?: string;
  from_time?: string;
  to_time?: string;
  limit?: number;
  offset?: number;
}

/**
 * Ledger query result
 */
export interface LedgerQueryResult {
  entries: ActionLedgerEntry[];
  total_count: number;
  has_more: boolean;
}

/**
 * Manifest query result
 */
export interface ManifestQueryResult {
  manifest: RunManifest | null;
  found: boolean;
}

/**
 * Error types
 */
export class AuditError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuditError';
  }
}

export class ManifestNotFoundError extends Error {
  constructor(
    public runId: string
  ) {
    super(`Manifest not found for run: ${runId}`);
    this.name = 'ManifestNotFoundError';
  }
}

export class ActionNotFoundError extends Error {
  constructor(
    public actionId: string
  ) {
    super(`Action not found: ${actionId}`);
    this.name = 'ActionNotFoundError';
  }
}

/**
 * Schema version constants
 */
export const MANIFEST_SCHEMA_VERSION = '1.0.0';
export const LEDGER_SCHEMA_VERSION = '1.0.0';
