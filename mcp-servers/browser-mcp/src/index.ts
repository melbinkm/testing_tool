/**
 * Browser MCP Entry Point
 * Initializes and starts the Browser MCP server
 */

import { BrowserMCPServer } from './server.js';
import { BrowserMCPInitError } from './errors.js';
import type { BrowserMCPConfig } from './types.js';

/**
 * Get environment variable as string
 */
function getEnvString(name: string, defaultValue?: string): string | undefined {
  const value = process.env[name];
  if (value !== undefined) return value;
  return defaultValue;
}

/**
 * Get environment variable as required string
 */
function getRequiredEnvString(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new BrowserMCPInitError(`${name} environment variable is required`);
  }
  return value;
}

/**
 * Get environment variable as number
 */
function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new BrowserMCPInitError(`Invalid ${name}: must be a number`);
  }
  return parsed;
}

/**
 * Get environment variable as boolean
 */
function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const failClosed = getEnvBoolean('FAIL_CLOSED', true);

  try {
    // Build configuration from environment
    const config: BrowserMCPConfig = {
      // Required
      engagementId: getRequiredEnvString('ENGAGEMENT_ID'),

      // Browser settings
      headless: getEnvBoolean('HEADLESS', false),
      proxyUrl: getEnvString('BURP_PROXY_URL', 'http://127.0.0.1:8080'),

      // Paths
      evidenceDir: getEnvString('EVIDENCE_DIR', './evidence') || './evidence',

      // Timeouts and limits
      defaultTimeout: getEnvNumber('DEFAULT_TIMEOUT', 30000),
      maxSessions: getEnvNumber('MAX_SESSIONS', 5),

      // Scope validation
      enableScopeValidation: getEnvBoolean('ENABLE_SCOPE_VALIDATION', false),
      scopeGuardUrl: getEnvString('SCOPE_GUARD_URL'),

      // AI providers for Stagehand
      geminiApiKey: getEnvString('GEMINI_API_KEY'),
      openaiApiKey: getEnvString('OPENAI_API_KEY'),
    };

    console.error('[browser-mcp] Starting with config:', {
      engagementId: config.engagementId,
      headless: config.headless,
      proxyUrl: config.proxyUrl,
      evidenceDir: config.evidenceDir,
      maxSessions: config.maxSessions,
      enableScopeValidation: config.enableScopeValidation,
      hasGeminiKey: !!config.geminiApiKey,
      hasOpenAIKey: !!config.openaiApiKey,
    });

    // Create and start server
    const server = new BrowserMCPServer(config);

    // Handle shutdown signals
    process.on('SIGINT', async () => {
      console.error('[browser-mcp] Received SIGINT, shutting down...');
      await server.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('[browser-mcp] Received SIGTERM, shutting down...');
      await server.shutdown();
      process.exit(0);
    });

    // Connect to transport
    await server.connect();
  } catch (error) {
    console.error('[browser-mcp] Fatal error:', error);

    if (failClosed) {
      process.exit(1);
    }
  }
}

// Start the server
main().catch(error => {
  console.error('[browser-mcp] Unhandled error:', error);
  process.exit(1);
});
