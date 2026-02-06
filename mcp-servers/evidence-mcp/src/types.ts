/**
 * Evidence & Reporting MCP Server Type Definitions
 */

/**
 * Evidence bundle containing artifacts for a finding
 */
export interface EvidenceBundle {
  bundle_id: string;
  finding_id: string;
  created_at: string;
  artifacts: Artifact[];
  metadata: Record<string, unknown>;
}

/**
 * Artifact types for evidence collection
 */
export type ArtifactType = 'request' | 'response' | 'screenshot' | 'log' | 'config' | 'other';

/**
 * Individual artifact in an evidence bundle
 */
export interface Artifact {
  artifact_id: string;
  type: ArtifactType;
  name: string;
  content: string;
  content_type: string;
  timestamp: string;
  redacted: boolean;
}

/**
 * Input for adding an artifact (without auto-generated fields)
 */
export interface ArtifactInput {
  type: ArtifactType;
  name: string;
  content: string;
  content_type: string;
}

/**
 * Redaction pattern configuration
 */
export interface RedactionPattern {
  name: string;
  pattern: string;  // Regex pattern string
  replacement?: string;
}

/**
 * Configuration for the redactor
 */
export interface RedactionConfig {
  patterns: RedactionPattern[];
  mask_char?: string;
  preserve_length?: boolean;
}

/**
 * Options for exporting evidence bundles
 */
export interface ExportOptions {
  format: 'zip' | 'json';
  include_redacted: boolean;
  output_path?: string;
}

/**
 * Configuration for report generation
 */
export interface ReportConfig {
  template: 'markdown' | 'html';
  title?: string;
  include_artifacts?: boolean;
  custom_template?: string;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  success: boolean;
  format: 'zip' | 'json';
  output_path?: string;
  data?: string;
  size_bytes?: number;
  artifact_count: number;
  redacted_count: number;
}

/**
 * Result of report generation
 */
export interface ReportResult {
  success: boolean;
  template: string;
  content: string;
  finding_id: string;
  bundle_id: string;
  artifact_count: number;
}

/**
 * Redaction result for an artifact
 */
export interface RedactionResult {
  original_length: number;
  redacted_length: number;
  patterns_applied: string[];
  redaction_count: number;
}
