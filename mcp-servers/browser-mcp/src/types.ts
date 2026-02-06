/**
 * Browser MCP Types
 * Type definitions for browser automation and XSS testing
 */

// ============================================================================
// Correlation & Tracking
// ============================================================================

export interface CorrelationIds {
  engagement_id: string;
  action_id: string;
  request_id: string;
  session_id?: string;
}

// ============================================================================
// Browser Session
// ============================================================================

export interface BrowserSessionConfig {
  headless: boolean;
  proxyUrl?: string;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  timeout?: number;
  ignoreHTTPSErrors?: boolean;
}

export interface BrowserSession {
  session_id: string;
  created_at: string;
  config: BrowserSessionConfig;
  current_url?: string;
  status: 'active' | 'closed' | 'error';
}

export interface SessionCreateResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  session?: BrowserSession;
  error?: { code: string; message: string };
}

export interface SessionCloseResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  session_id: string;
  duration_ms?: number;
  error?: { code: string; message: string };
}

// ============================================================================
// Navigation
// ============================================================================

export interface NavigateParams {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface NavigateResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  url: string;
  final_url?: string;
  status_code?: number;
  title?: string;
  timing?: {
    navigation_start: number;
    dom_content_loaded: number;
    load_complete: number;
    duration_ms: number;
  };
  error?: { code: string; message: string };
}

// ============================================================================
// Actions (Stagehand Natural Language)
// ============================================================================

export interface ActParams {
  action: string;
  timeout?: number;
}

export interface ActResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  action: string;
  elements_interacted?: string[];
  screenshot_path?: string;
  error?: { code: string; message: string };
}

// ============================================================================
// Extraction
// ============================================================================

export interface ExtractParams {
  instruction: string;
  schema?: Record<string, unknown>;
}

export interface ExtractResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  data: unknown;
  error?: { code: string; message: string };
}

// ============================================================================
// Form Discovery
// ============================================================================

export interface FormField {
  name: string;
  type: string;
  id?: string;
  placeholder?: string;
  required: boolean;
  value?: string;
  options?: string[]; // For select elements
}

export interface DiscoveredForm {
  form_id: string;
  action: string;
  method: 'GET' | 'POST';
  fields: FormField[];
  submit_button?: {
    text?: string;
    selector: string;
  };
  selector: string;
}

export interface FormDiscoveryResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  forms: DiscoveredForm[];
  total_count: number;
  error?: { code: string; message: string };
}

// ============================================================================
// XSS Testing
// ============================================================================

export type XSSDetectionMethod = 'dialog' | 'dom_reflection' | 'console' | 'attribute';

export interface XSSPayload {
  payload: string;
  type: 'script' | 'img' | 'svg' | 'event' | 'javascript_uri';
  context: 'html' | 'attribute' | 'javascript' | 'url';
}

export interface XSSTestParams {
  form_selector?: string;
  field_name: string;
  payloads?: string[];
  custom_marker?: string;
  submit?: boolean;
}

export interface XSSVulnerability {
  field_name: string;
  payload: string;
  detection_method: XSSDetectionMethod;
  reflected_in?: string;
  screenshot_path?: string;
}

export interface XSSTestResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  vulnerable: boolean;
  vulnerabilities: XSSVulnerability[];
  payloads_tested: number;
  error?: { code: string; message: string };
}

// ============================================================================
// Screenshots
// ============================================================================

export interface ScreenshotParams {
  full_page?: boolean;
  selector?: string;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface ScreenshotResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  path: string;
  size_bytes: number;
  dimensions?: {
    width: number;
    height: number;
  };
  error?: { code: string; message: string };
}

// ============================================================================
// Page State
// ============================================================================

export interface PageState {
  url: string;
  title: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
  }>;
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}

export interface PageStateResult {
  success: boolean;
  correlation_ids: CorrelationIds;
  state: PageState;
  error?: { code: string; message: string };
}

// ============================================================================
// Configuration
// ============================================================================

export interface BrowserMCPConfig {
  engagementId: string;
  headless: boolean;
  proxyUrl?: string;
  evidenceDir: string;
  defaultTimeout: number;
  maxSessions: number;
  enableScopeValidation: boolean;
  scopeGuardUrl?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
}

// ============================================================================
// Scope Validation
// ============================================================================

export interface ScopeValidationResult {
  valid: boolean;
  target: string;
  reason?: string;
}

// ============================================================================
// Evidence Integration
// ============================================================================

export interface EvidenceArtifact {
  artifact_id: string;
  type: 'screenshot' | 'request' | 'response' | 'log' | 'dom';
  name: string;
  content: string;
  content_type: string;
  timestamp: string;
}
