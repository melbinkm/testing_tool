/**
 * Validator MCP Server
 *
 * Provides MCP tools for finding validation with reproduction,
 * negative controls, and cross-identity verification.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ReproRunner } from './repro-runner.js';
import { ControlRunner } from './control-runner.js';
import { ConfidenceScorer } from './confidence-scorer.js';
import {
  Finding,
  NegativeControlConfig,
  IdentityConfig,
  ValidationInputs,
} from './types.js';

// Configuration from environment
const REPRO_COUNT = parseInt(process.env.REPRO_COUNT || '3', 10);
const REQUIRE_NEGATIVE_CONTROL = process.env.REQUIRE_NEGATIVE_CONTROL !== 'false';

// Create instances
const reproRunner = new ReproRunner(REPRO_COUNT);
const controlRunner = new ControlRunner();
const confidenceScorer = new ConfidenceScorer();

console.error(`[validator] Initialized with REPRO_COUNT=${REPRO_COUNT}, REQUIRE_NEGATIVE_CONTROL=${REQUIRE_NEGATIVE_CONTROL}`);

// Create MCP Server
const server = new Server(
  {
    name: 'validator-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper functions for testing
export function getReproRunner(): ReproRunner {
  return reproRunner;
}

export function getControlRunner(): ControlRunner {
  return controlRunner;
}

export function getConfidenceScorer(): ConfidenceScorer {
  return confidenceScorer;
}

export function getConfig(): { reproCount: number; requireNegativeControl: boolean } {
  return {
    reproCount: REPRO_COUNT,
    requireNegativeControl: REQUIRE_NEGATIVE_CONTROL,
  };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'validate_repro',
      description: 'Reproduce a finding N times to confirm it is consistent and reproducible',
      inputSchema: {
        type: 'object',
        properties: {
          finding: {
            type: 'object',
            description: 'The finding to reproduce',
            properties: {
              finding_id: { type: 'string', description: 'Unique identifier for the finding' },
              title: { type: 'string', description: 'Finding title' },
              request: {
                type: 'object',
                description: 'HTTP request configuration',
                properties: {
                  method: { type: 'string', description: 'HTTP method' },
                  url: { type: 'string', description: 'Request URL' },
                  headers: { type: 'object', description: 'Request headers (optional)' },
                  body: { type: 'string', description: 'Request body (optional)' },
                },
                required: ['method', 'url'],
              },
              expected: {
                type: 'object',
                description: 'Expected response characteristics (optional)',
                properties: {
                  status_code: { type: 'number', description: 'Expected status code' },
                  body_contains: { type: 'array', items: { type: 'string' }, description: 'Patterns body should contain' },
                  body_not_contains: { type: 'array', items: { type: 'string' }, description: 'Patterns body should not contain' },
                  body_regex: { type: 'string', description: 'Regex pattern to match' },
                },
              },
            },
            required: ['finding_id', 'title', 'request'],
          },
          count: {
            type: 'number',
            description: `Number of reproduction attempts (default: ${REPRO_COUNT})`,
          },
        },
        required: ['finding'],
      },
    },
    {
      name: 'validate_negative_control',
      description: 'Run a negative control test to verify the vulnerability does not exist in control scenarios',
      inputSchema: {
        type: 'object',
        properties: {
          finding: {
            type: 'object',
            description: 'The finding to test',
            properties: {
              finding_id: { type: 'string' },
              title: { type: 'string' },
              request: {
                type: 'object',
                properties: {
                  method: { type: 'string' },
                  url: { type: 'string' },
                  headers: { type: 'object' },
                  body: { type: 'string' },
                },
                required: ['method', 'url'],
              },
            },
            required: ['finding_id', 'title', 'request'],
          },
          control_config: {
            type: 'object',
            description: 'Negative control configuration',
            properties: {
              control_type: {
                type: 'string',
                enum: ['unauthenticated', 'invalid_token', 'different_user', 'modified_request'],
                description: 'Type of negative control to run',
              },
              modified_headers: { type: 'object', description: 'Headers to use instead (optional)' },
              modified_body: { type: 'string', description: 'Body to use instead (optional)' },
              remove_auth: { type: 'boolean', description: 'Whether to remove auth headers' },
              expected_status: { type: 'number', description: 'Expected status code (optional)' },
            },
            required: ['control_type'],
          },
        },
        required: ['finding', 'control_config'],
      },
    },
    {
      name: 'validate_cross_identity',
      description: 'Test a finding with multiple identities to verify authorization is enforced',
      inputSchema: {
        type: 'object',
        properties: {
          finding: {
            type: 'object',
            description: 'The finding to test',
            properties: {
              finding_id: { type: 'string' },
              title: { type: 'string' },
              request: {
                type: 'object',
                properties: {
                  method: { type: 'string' },
                  url: { type: 'string' },
                  headers: { type: 'object' },
                  body: { type: 'string' },
                },
                required: ['method', 'url'],
              },
            },
            required: ['finding_id', 'title', 'request'],
          },
          identities: {
            type: 'array',
            description: 'Array of identities to test',
            items: {
              type: 'object',
              properties: {
                identity_id: { type: 'string', description: 'Identity identifier' },
                auth_header: { type: 'string', description: 'Authentication header value' },
                auth_type: {
                  type: 'string',
                  enum: ['bearer', 'basic', 'api_key', 'cookie'],
                  description: 'Type of authentication',
                },
                cookies: { type: 'object', description: 'Cookies for cookie auth type' },
                should_have_access: { type: 'boolean', description: 'Whether this identity should have access' },
              },
              required: ['identity_id', 'should_have_access'],
            },
          },
        },
        required: ['finding', 'identities'],
      },
    },
    {
      name: 'validate_promote',
      description: 'Calculate confidence score and determine if finding should be promoted to confirmed',
      inputSchema: {
        type: 'object',
        properties: {
          finding_id: {
            type: 'string',
            description: 'The finding ID to evaluate',
          },
          repro_result: {
            type: 'object',
            description: 'Result from validate_repro (optional)',
          },
          negative_control_result: {
            type: 'object',
            description: 'Result from validate_negative_control (optional)',
          },
          cross_identity_result: {
            type: 'object',
            description: 'Result from validate_cross_identity (optional)',
          },
        },
        required: ['finding_id'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'validate_repro':
        return await handleValidateRepro(args ?? {});

      case 'validate_negative_control':
        return await handleValidateNegativeControl(args ?? {});

      case 'validate_cross_identity':
        return await handleValidateCrossIdentity(args ?? {});

      case 'validate_promote':
        return handleValidatePromote(args ?? {});

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

async function handleValidateRepro(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  if (!args.finding) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'finding is required',
          }),
        },
      ],
      isError: true,
    };
  }

  const finding = args.finding as Finding;
  const count = args.count as number | undefined;

  // Validate finding structure
  if (!finding.finding_id || !finding.title || !finding.request) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'finding must have finding_id, title, and request',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!finding.request.method || !finding.request.url) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'finding.request must have method and url',
          }),
        },
      ],
      isError: true,
    };
  }

  const result = await reproRunner.runRepro(finding, count);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            result,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleValidateNegativeControl(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  if (!args.finding || !args.control_config) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'finding and control_config are required',
          }),
        },
      ],
      isError: true,
    };
  }

  const finding = args.finding as Finding;
  const controlConfig = args.control_config as NegativeControlConfig;

  // Validate finding structure
  if (!finding.finding_id || !finding.request?.method || !finding.request?.url) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'finding must have finding_id and request with method and url',
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate control config
  const validControlTypes = ['unauthenticated', 'invalid_token', 'different_user', 'modified_request'];
  if (!validControlTypes.includes(controlConfig.control_type)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Invalid control_type. Must be one of: ${validControlTypes.join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const result = await controlRunner.runNegativeControl(finding, controlConfig);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            result,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleValidateCrossIdentity(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  if (!args.finding || !args.identities) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'finding and identities are required',
          }),
        },
      ],
      isError: true,
    };
  }

  const finding = args.finding as Finding;
  const identities = args.identities as IdentityConfig[];

  // Validate finding structure
  if (!finding.finding_id || !finding.request?.method || !finding.request?.url) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'finding must have finding_id and request with method and url',
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate identities
  if (!Array.isArray(identities) || identities.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'identities must be a non-empty array',
          }),
        },
      ],
      isError: true,
    };
  }

  for (const identity of identities) {
    if (!identity.identity_id || identity.should_have_access === undefined) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Each identity must have identity_id and should_have_access',
            }),
          },
        ],
        isError: true,
      };
    }
  }

  const result = await controlRunner.runCrossIdentity(finding, identities);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            result,
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleValidatePromote(args: Record<string, unknown>): {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
} {
  if (!args.finding_id) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'finding_id is required',
          }),
        },
      ],
      isError: true,
    };
  }

  const inputs: ValidationInputs = {
    finding_id: args.finding_id as string,
    repro_result: args.repro_result as ValidationInputs['repro_result'],
    negative_control_result: args.negative_control_result as ValidationInputs['negative_control_result'],
    cross_identity_result: args.cross_identity_result as ValidationInputs['cross_identity_result'],
  };

  // Check if at least one validation result is provided
  if (!inputs.repro_result && !inputs.negative_control_result && !inputs.cross_identity_result) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'At least one validation result (repro_result, negative_control_result, or cross_identity_result) is required',
          }),
        },
      ],
      isError: true,
    };
  }

  // Check if negative control is required but not provided
  if (REQUIRE_NEGATIVE_CONTROL && !inputs.negative_control_result) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'negative_control_result is required (REQUIRE_NEGATIVE_CONTROL is enabled)',
            hint: 'Run validate_negative_control first, or set REQUIRE_NEGATIVE_CONTROL=false',
          }),
        },
      ],
      isError: true,
    };
  }

  const confidence = confidenceScorer.calculateConfidence(inputs);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            confidence,
            promoted: confidence.recommendation === 'promote',
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
  console.error('[validator] MCP server started');
}

main().catch((error: unknown) => {
  console.error('[validator] Fatal error:', error);
  process.exit(1);
});

// Export for testing
export {
  server,
  reproRunner,
  controlRunner,
  confidenceScorer,
  handleValidateRepro,
  handleValidateNegativeControl,
  handleValidateCrossIdentity,
  handleValidatePromote,
  REPRO_COUNT,
  REQUIRE_NEGATIVE_CONTROL,
};
