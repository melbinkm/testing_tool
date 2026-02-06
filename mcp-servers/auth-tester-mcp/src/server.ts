/**
 * Auth Tester MCP Server
 *
 * Provides MCP tools for authorization differential testing to detect
 * BOLA/IDOR vulnerabilities by replaying requests with different identities.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { IdentityStore, TestIdentity } from './identity-store.js';
import {
  DifferentialTester,
  DiffTestRequest,
  DiffTestResult,
  DiffTestSummary,
} from './diff-tester.js';

// Configuration from environment
const IDENTITY_FILE = process.env.IDENTITY_FILE || './scope/identities.yaml';

// Create instances
let identityStore = new IdentityStore();
const diffTester = new DifferentialTester();

// Try to load identities from file
try {
  identityStore.loadFromFile(IDENTITY_FILE);
  console.error(`[auth-tester] Loaded ${identityStore.count()} identities from ${IDENTITY_FILE}`);
} catch (error) {
  console.error(
    `[auth-tester] Warning: Could not load identity file (${IDENTITY_FILE}): ${error instanceof Error ? error.message : 'Unknown error'}`
  );
}

// Create MCP Server
const server = new Server(
  {
    name: 'auth-tester-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper functions for testing
export function setIdentityStore(store: IdentityStore): void {
  identityStore = store;
}

export function getIdentityStore(): IdentityStore {
  return identityStore;
}

export function getDiffTester(): DifferentialTester {
  return diffTester;
}

/**
 * Execute a request with a specific identity
 */
async function executeRequestWithIdentity(
  request: DiffTestRequest,
  identity: TestIdentity
): Promise<DiffTestResult> {
  const startTime = performance.now();

  try {
    // Build headers with identity auth
    const authHeaders = identityStore.getAuthHeaders(identity.identity_id);
    const headers: Record<string, string> = {
      ...request.headers,
      ...authHeaders,
    };

    // Execute the request
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method.toUpperCase())) {
      fetchOptions.body = request.body;
    }

    const response = await fetch(request.url, fetchOptions);
    const responseBody = await response.text();
    const endTime = performance.now();

    return {
      identity_id: identity.identity_id,
      status_code: response.status,
      response_length: responseBody.length,
      response_hash: diffTester.hashResponse(responseBody),
      contains_target_data: responseBody.length > 0,
      timing_ms: Math.round(endTime - startTime),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      identity_id: identity.identity_id,
      status_code: 0,
      response_length: 0,
      response_hash: '',
      contains_target_data: false,
      timing_ms: Math.round(endTime - startTime),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'auth_get_identities',
      description: 'List all available test identities configured for authorization testing',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'auth_diff_test',
      description:
        'Test the same HTTP request with multiple identities to detect BOLA/IDOR vulnerabilities by comparing responses',
      inputSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            description: 'HTTP method (GET, POST, PUT, DELETE, etc.)',
          },
          url: {
            type: 'string',
            description: 'Full URL to test',
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Additional HTTP headers to include (optional)',
          },
          body: {
            type: 'string',
            description: 'Request body for POST/PUT/PATCH requests (optional)',
          },
          identity_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of identity IDs to test with',
          },
        },
        required: ['method', 'url', 'identity_ids'],
      },
    },
    {
      name: 'auth_replay_with_identity',
      description: 'Replay a single HTTP request with a specific identity for targeted testing',
      inputSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            description: 'HTTP method (GET, POST, PUT, DELETE, etc.)',
          },
          url: {
            type: 'string',
            description: 'Full URL to test',
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Additional HTTP headers to include (optional)',
          },
          body: {
            type: 'string',
            description: 'Request body for POST/PUT/PATCH requests (optional)',
          },
          identity_id: {
            type: 'string',
            description: 'Identity ID to use for the request',
          },
        },
        required: ['method', 'url', 'identity_id'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'auth_get_identities':
        return handleGetIdentities();

      case 'auth_diff_test':
        return await handleDiffTest(args ?? {});

      case 'auth_replay_with_identity':
        return await handleReplayWithIdentity(args ?? {});

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
      ],
      isError: true,
    };
  }
});

function handleGetIdentities(): {
  content: Array<{ type: string; text: string }>;
} {
  const identities = identityStore.list();
  const sanitized = identities.map((id) => ({
    identity_id: id.identity_id,
    label: id.label,
    roles: id.roles,
    tenant_id: id.tenant_id,
    auth_type: id.auth_type,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            count: sanitized.length,
            identities: sanitized,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleDiffTest(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  // Validate required fields
  if (!args.method || !args.url || !args.identity_ids) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'method, url, and identity_ids are required',
          }),
        },
      ],
      isError: true,
    };
  }

  const method = args.method as string;
  const url = args.url as string;
  const headers = args.headers as Record<string, string> | undefined;
  const body = args.body as string | undefined;
  const identityIds = args.identity_ids as string[];

  // Validate identity IDs exist
  const invalidIds: string[] = [];
  const validIdentities: TestIdentity[] = [];

  for (const id of identityIds) {
    const identity = identityStore.get(id);
    if (identity) {
      validIdentities.push(identity);
    } else {
      invalidIds.push(id);
    }
  }

  if (invalidIds.length > 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Unknown identity IDs: ${invalidIds.join(', ')}`,
            available_identities: identityStore.list().map((i) => i.identity_id),
          }),
        },
      ],
      isError: true,
    };
  }

  if (validIdentities.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'No valid identity IDs provided',
          }),
        },
      ],
      isError: true,
    };
  }

  // Build the request
  const request: DiffTestRequest = {
    method,
    url,
    headers,
    body,
  };

  // Execute requests for each identity
  const results: DiffTestResult[] = [];
  for (const identity of validIdentities) {
    const result = await executeRequestWithIdentity(request, identity);
    results.push(result);
  }

  // Analyze results
  const summary: DiffTestSummary = diffTester.analyzeResults(request, results);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            summary,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleReplayWithIdentity(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  // Validate required fields
  if (!args.method || !args.url || !args.identity_id) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'method, url, and identity_id are required',
          }),
        },
      ],
      isError: true,
    };
  }

  const method = args.method as string;
  const url = args.url as string;
  const headers = args.headers as Record<string, string> | undefined;
  const body = args.body as string | undefined;
  const identityId = args.identity_id as string;

  // Validate identity exists
  const identity = identityStore.get(identityId);
  if (!identity) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Identity not found: ${identityId}`,
            available_identities: identityStore.list().map((i) => i.identity_id),
          }),
        },
      ],
      isError: true,
    };
  }

  // Build the request
  const request: DiffTestRequest = {
    method,
    url,
    headers,
    body,
  };

  // Execute the request
  const result = await executeRequestWithIdentity(request, identity);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            request: {
              method: request.method,
              url: request.url,
            },
            identity: {
              identity_id: identity.identity_id,
              label: identity.label,
              roles: identity.roles,
            },
            result,
          },
          null,
          2
        ),
      },
    ],
  };
}

// Start the server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[auth-tester] MCP server started');
}

main().catch((error: unknown) => {
  console.error('[auth-tester] Fatal error:', error);
  process.exit(1);
});

// Export for testing
export {
  server,
  identityStore,
  diffTester,
  executeRequestWithIdentity,
  handleGetIdentities,
  handleDiffTest,
  handleReplayWithIdentity,
  IDENTITY_FILE,
};
