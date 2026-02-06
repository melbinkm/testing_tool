#!/usr/bin/env node

/**
 * Scope Guard MCP Server Entry Point
 *
 * Environment variables:
 * - SCOPE_FILE: Path to engagement scope YAML/JSON file (default: ./scope/engagement.yaml)
 * - FAIL_CLOSED: If "true", exit on any initialization error (default: true)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadScopeFromEnv } from './scope-loader.js';
import { ScopeGuardServer } from './server.js';
import { ScopeValidationError } from './types.js';

const FAIL_CLOSED = process.env.FAIL_CLOSED !== 'false';

async function main(): Promise<void> {
  // Log to stderr (stdout is reserved for MCP protocol)
  const log = (message: string) => {
    process.stderr.write(`[scope-guard] ${message}\n`);
  };

  try {
    // Load scope configuration
    log('Loading scope configuration...');
    const scope = loadScopeFromEnv();
    log(`Loaded scope for engagement: ${scope.engagement.id}`);

    // Create server
    const server = new ScopeGuardServer(scope);

    // Create transport
    const transport = new StdioServerTransport();

    // Connect and start serving
    log('Starting MCP server...');
    await server.connect(transport);
    log('MCP server started successfully');

  } catch (error) {
    if (error instanceof ScopeValidationError) {
      process.stderr.write(`[scope-guard] ERROR: Scope validation failed:\n`);
      for (const err of error.errors) {
        process.stderr.write(`  - ${err}\n`);
      }
    } else {
      process.stderr.write(`[scope-guard] ERROR: ${(error as Error).message}\n`);
    }

    if (FAIL_CLOSED) {
      process.stderr.write('[scope-guard] FAIL_CLOSED=true, exiting with error\n');
      process.exit(1);
    }
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  process.stderr.write(`[scope-guard] Uncaught exception: ${error.message}\n`);
  if (FAIL_CLOSED) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[scope-guard] Unhandled rejection: ${reason}\n`);
  if (FAIL_CLOSED) {
    process.exit(1);
  }
});

// Start the server
main().catch((error) => {
  process.stderr.write(`[scope-guard] Fatal error: ${error.message}\n`);
  process.exit(1);
});
