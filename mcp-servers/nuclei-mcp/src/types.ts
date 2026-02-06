/**
 * Types for the Nuclei MCP Server
 */

/**
 * Configuration for the Nuclei runner
 */
export interface NucleiConfig {
  nucleiPath: string;
  templatesDir: string;
  rateLimit: number;
  timeout: number;
  mockMode: boolean;
}

/**
 * Severity levels for findings
 */
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * A single finding from a Nuclei scan
 */
export interface NucleiFinding {
  template_id: string;
  template_name?: string;
  severity: Severity;
  matched_at: string;
  matched_url?: string;
  matcher_name?: string;
  extracted_data?: Record<string, string>;
  curl_command?: string;
  timestamp: string;
}

/**
 * Result of a Nuclei scan
 */
export interface ScanResult {
  success: boolean;
  target: string;
  template?: string;
  templates?: string[];
  findings: NucleiFinding[];
  scan_time_ms: number;
  error?: string;
  mock_mode: boolean;
}

/**
 * Template metadata from Nuclei
 */
export interface TemplateInfo {
  id: string;
  name: string;
  severity: Severity;
  author: string;
  tags: string[];
  description?: string;
  reference?: string[];
  file_path: string;
}

/**
 * Options for listing templates
 */
export interface TemplateListOptions {
  severity?: Severity | Severity[];
  tags?: string[];
  author?: string;
  search?: string;
  limit?: number;
}

/**
 * Result of template listing
 */
export interface TemplateListResult {
  success: boolean;
  templates: TemplateInfo[];
  total_count: number;
  filtered_count: number;
  error?: string;
}

/**
 * Input for single URL scan
 */
export interface ScanSingleInput {
  target: string;
  template_id: string;
  timeout?: number;
}

/**
 * Input for template-based scan
 */
export interface ScanTemplateInput {
  targets: string[];
  template_ids?: string[];
  tags?: string[];
  severity?: Severity[];
  timeout?: number;
}

/**
 * Nuclei output format (JSON)
 */
export interface NucleiOutput {
  'template-id': string;
  'template-path'?: string;
  info: {
    name: string;
    author: string | string[];
    tags?: string | string[];
    description?: string;
    severity: string;
    reference?: string | string[];
  };
  'matcher-name'?: string;
  'matched-at': string;
  'extracted-results'?: string[];
  host: string;
  timestamp: string;
  'curl-command'?: string;
}

/**
 * Custom error types
 */
export class NucleiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'NucleiError';
  }
}

export class ScopeError extends Error {
  constructor(
    message: string,
    public target: string
  ) {
    super(message);
    this.name = 'ScopeError';
  }
}

export class TemplateError extends Error {
  constructor(
    message: string,
    public templateId: string
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}
