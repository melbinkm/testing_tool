/**
 * Browser MCP Custom Errors
 */

export class BrowserMCPError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BrowserMCPError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SessionNotFoundError extends BrowserMCPError {
  public readonly sessionId: string;

  constructor(sessionId: string) {
    super('SESSION_NOT_FOUND', `Browser session not found: ${sessionId}`);
    this.sessionId = sessionId;
  }
}

export class NoActiveSessionError extends BrowserMCPError {
  constructor() {
    super('NO_ACTIVE_SESSION', 'No active browser session. Call browser_session_create first.');
  }
}

export class SessionLimitError extends BrowserMCPError {
  public readonly maxSessions: number;
  public readonly currentSessions: number;

  constructor(maxSessions: number, currentSessions: number) {
    super(
      'SESSION_LIMIT_EXCEEDED',
      `Maximum sessions (${maxSessions}) reached. Close an existing session first.`
    );
    this.maxSessions = maxSessions;
    this.currentSessions = currentSessions;
  }
}

export class NavigationError extends BrowserMCPError {
  public readonly url: string;
  public readonly originalError?: Error;

  constructor(url: string, message: string, originalError?: Error) {
    super('NAVIGATION_FAILED', `Failed to navigate to ${url}: ${message}`);
    this.url = url;
    this.originalError = originalError;
  }
}

export class ScopeValidationError extends BrowserMCPError {
  public readonly target: string;
  public readonly reason: string;

  constructor(target: string, reason: string) {
    super('SCOPE_VALIDATION_FAILED', `URL out of scope: ${target}. Reason: ${reason}`);
    this.target = target;
    this.reason = reason;
  }
}

export class ActionError extends BrowserMCPError {
  public readonly action: string;
  public readonly originalError?: Error;

  constructor(action: string, message: string, originalError?: Error) {
    super('ACTION_FAILED', `Failed to perform action "${action}": ${message}`);
    this.action = action;
    this.originalError = originalError;
  }
}

export class ExtractionError extends BrowserMCPError {
  public readonly instruction: string;
  public readonly originalError?: Error;

  constructor(instruction: string, message: string, originalError?: Error) {
    super('EXTRACTION_FAILED', `Failed to extract data: ${message}`);
    this.instruction = instruction;
    this.originalError = originalError;
  }
}

export class XSSTestError extends BrowserMCPError {
  public readonly fieldName: string;
  public readonly originalError?: Error;

  constructor(fieldName: string, message: string, originalError?: Error) {
    super('XSS_TEST_FAILED', `XSS test failed for field "${fieldName}": ${message}`);
    this.fieldName = fieldName;
    this.originalError = originalError;
  }
}

export class ScreenshotError extends BrowserMCPError {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super('SCREENSHOT_FAILED', `Failed to capture screenshot: ${message}`);
    this.originalError = originalError;
  }
}

export class FormNotFoundError extends BrowserMCPError {
  public readonly selector: string;

  constructor(selector: string) {
    super('FORM_NOT_FOUND', `Form not found with selector: ${selector}`);
    this.selector = selector;
  }
}

export class FieldNotFoundError extends BrowserMCPError {
  public readonly fieldName: string;
  public readonly formSelector?: string;

  constructor(fieldName: string, formSelector?: string) {
    const location = formSelector ? ` in form "${formSelector}"` : '';
    super('FIELD_NOT_FOUND', `Field "${fieldName}" not found${location}`);
    this.fieldName = fieldName;
    this.formSelector = formSelector;
  }
}

export class BrowserMCPInitError extends BrowserMCPError {
  constructor(message: string) {
    super('INIT_ERROR', message);
  }
}

export class TimeoutError extends BrowserMCPError {
  public readonly timeoutMs: number;
  public readonly operation: string;

  constructor(operation: string, timeoutMs: number) {
    super('TIMEOUT', `Operation "${operation}" timed out after ${timeoutMs}ms`);
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class ProxyConnectionError extends BrowserMCPError {
  public readonly proxyUrl: string;
  public readonly originalError?: Error;

  constructor(proxyUrl: string, originalError?: Error) {
    super('PROXY_CONNECTION_FAILED', `Failed to connect to proxy: ${proxyUrl}`);
    this.proxyUrl = proxyUrl;
    this.originalError = originalError;
  }
}
