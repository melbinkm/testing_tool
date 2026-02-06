/**
 * HTTP Client MCP Server Entry Point
 *
 * Environment variables:
 * - ENGAGEMENT_ID (required) - Engagement identifier for correlation headers
 * - PROXY_URL - HTTP proxy URL (optional, for Burp Suite)
 * - MAX_RPS - Requests per second (default: 10)
 * - MAX_CONCURRENT - Maximum concurrent requests (default: 5)
 * - MAX_TOTAL_REQUESTS - Total request budget (default: 1000)
 * - DEFAULT_TIMEOUT - Request timeout in ms (default: 30000)
 * - FAIL_CLOSED - Exit on errors (default: true)
 */

import { HttpClientServer } from './server.js';
import { HttpClientConfig } from './types.js';
import { HttpClientInitError } from './errors.js';

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new HttpClientInitError(`Invalid ${name}: must be a number`);
  }
  return parsed;
}

function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

async function main(): Promise<void> {
  const failClosed = getEnvBoolean('FAIL_CLOSED', true);

  try {
    // ENGAGEMENT_ID is required
    const engagementId = process.env.ENGAGEMENT_ID;
    if (!engagementId) {
      throw new HttpClientInitError('ENGAGEMENT_ID environment variable is required');
    }

    const config: HttpClientConfig = {
      engagementId,
      proxyUrl: process.env.PROXY_URL,
      maxRps: getEnvNumber('MAX_RPS', 10),
      maxConcurrent: getEnvNumber('MAX_CONCURRENT', 5),
      maxTotalRequests: getEnvNumber('MAX_TOTAL_REQUESTS', 1000),
      defaultTimeout: getEnvNumber('DEFAULT_TIMEOUT', 30000)
    };

    // Log configuration to stderr (for debugging)
    console.error('[http-client-mcp] Starting with config:', {
      engagementId: config.engagementId,
      proxyUrl: config.proxyUrl ? '(configured)' : '(none)',
      maxRps: config.maxRps,
      maxConcurrent: config.maxConcurrent,
      maxTotalRequests: config.maxTotalRequests,
      defaultTimeout: config.defaultTimeout,
      failClosed
    });

    const server = new HttpClientServer(config);
    await server.connect();

    console.error('[http-client-mcp] Server connected and ready');
  } catch (error) {
    console.error('[http-client-mcp] Fatal error:', error);

    if (failClosed) {
      process.exit(1);
    }

    // If not fail-closed, log and continue (server won't be functional)
    console.error('[http-client-mcp] FAIL_CLOSED=false, continuing with error state');
  }
}

main().catch((error) => {
  console.error('[http-client-mcp] Unhandled error:', error);
  process.exit(1);
});
