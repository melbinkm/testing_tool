/**
 * Fuzzer MCP Server
 *
 * Provides MCP tools for schema-based API fuzzing with signal detection.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SchemaFuzzer } from './schema-fuzzer.js';
import { PayloadGenerator } from './payload-generator.js';
import {
  FuzzConfig,
  PayloadType,
  HttpMethod,
  ParameterDefinition,
  ParameterLocation,
  PayloadListResult,
} from './types.js';

// Configuration from environment
const MAX_PAYLOADS = parseInt(process.env.MAX_PAYLOADS || '100', 10);
const MAX_REQUESTS_PER_ENDPOINT = parseInt(process.env.MAX_REQUESTS_PER_ENDPOINT || '500', 10);
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '10', 10);

// Create instances
const schemaFuzzer = new SchemaFuzzer({
  maxPayloads: MAX_PAYLOADS,
  maxRequestsPerEndpoint: MAX_REQUESTS_PER_ENDPOINT,
  rateLimit: RATE_LIMIT,
});

const payloadGenerator = new PayloadGenerator(MAX_PAYLOADS);

console.error(`[fuzzer-mcp] Initialized with MAX_PAYLOADS=${MAX_PAYLOADS}, MAX_REQUESTS_PER_ENDPOINT=${MAX_REQUESTS_PER_ENDPOINT}, RATE_LIMIT=${RATE_LIMIT}`);

// Create MCP Server
const server = new Server(
  {
    name: 'fuzzer-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper functions for testing
export function getSchemaFuzzer(): SchemaFuzzer {
  return schemaFuzzer;
}

export function getPayloadGenerator(): PayloadGenerator {
  return payloadGenerator;
}

export function getConfig(): {
  maxPayloads: number;
  maxRequestsPerEndpoint: number;
  rateLimit: number;
} {
  return {
    maxPayloads: MAX_PAYLOADS,
    maxRequestsPerEndpoint: MAX_REQUESTS_PER_ENDPOINT,
    rateLimit: RATE_LIMIT,
  };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'fuzz_endpoint',
      description: 'Fuzz all parameters of an API endpoint with various payload types. HIGH RISK - requires scope validation before use.',
      inputSchema: {
        type: 'object',
        properties: {
          endpoint: {
            type: 'string',
            description: 'The API endpoint URL to fuzz (must be in scope)',
          },
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            description: 'HTTP method',
          },
          parameters: {
            type: 'array',
            description: 'Parameter definitions for the endpoint',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Parameter name' },
                location: {
                  type: 'string',
                  enum: ['query', 'path', 'header', 'body', 'cookie'],
                  description: 'Where the parameter is located',
                },
                type: { type: 'string', description: 'Parameter type (string, integer, boolean, etc.)' },
                format: { type: 'string', description: 'Format hint (email, date, uuid, etc.)' },
                required: { type: 'boolean', description: 'Whether parameter is required' },
                minimum: { type: 'number', description: 'Minimum value for numbers' },
                maximum: { type: 'number', description: 'Maximum value for numbers' },
                minLength: { type: 'number', description: 'Minimum length for strings' },
                maxLength: { type: 'number', description: 'Maximum length for strings' },
              },
              required: ['name', 'location', 'type'],
            },
          },
          payload_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['boundary', 'type_confusion', 'injection', 'format', 'overflow'],
            },
            description: 'Types of payloads to use (default: all)',
          },
          headers: {
            type: 'object',
            description: 'Additional headers to include in requests',
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in milliseconds',
          },
        },
        required: ['endpoint', 'method'],
      },
    },
    {
      name: 'fuzz_parameter',
      description: 'Fuzz a single parameter of an API endpoint with various payload types. HIGH RISK - requires scope validation before use.',
      inputSchema: {
        type: 'object',
        properties: {
          endpoint: {
            type: 'string',
            description: 'The API endpoint URL (must be in scope)',
          },
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            description: 'HTTP method',
          },
          parameter: {
            type: 'object',
            description: 'Parameter definition to fuzz',
            properties: {
              name: { type: 'string', description: 'Parameter name' },
              location: {
                type: 'string',
                enum: ['query', 'path', 'header', 'body', 'cookie'],
                description: 'Where the parameter is located',
              },
              type: { type: 'string', description: 'Parameter type' },
              format: { type: 'string', description: 'Format hint' },
              required: { type: 'boolean' },
              minimum: { type: 'number' },
              maximum: { type: 'number' },
              minLength: { type: 'number' },
              maxLength: { type: 'number' },
            },
            required: ['name', 'location', 'type'],
          },
          payload_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['boundary', 'type_confusion', 'injection', 'format', 'overflow'],
            },
            description: 'Types of payloads to use (default: all)',
          },
          max_payloads: {
            type: 'number',
            description: 'Maximum number of payloads to send',
          },
          headers: {
            type: 'object',
            description: 'Additional headers to include in requests',
          },
        },
        required: ['endpoint', 'method', 'parameter'],
      },
    },
    {
      name: 'fuzz_list_payloads',
      description: 'List available fuzz payload types and examples. LOW RISK - read-only operation.',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['boundary', 'type_confusion', 'injection', 'format', 'overflow'],
            description: 'Specific payload type to list (optional, lists all if not specified)',
          },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'fuzz_endpoint':
        return await handleFuzzEndpoint(args ?? {});

      case 'fuzz_parameter':
        return await handleFuzzParameter(args ?? {});

      case 'fuzz_list_payloads':
        return handleListPayloads(args ?? {});

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

async function handleFuzzEndpoint(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  // Validate required parameters
  if (!args.endpoint || typeof args.endpoint !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'endpoint is required and must be a string',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!args.method || typeof args.method !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'method is required and must be a string',
          }),
        },
      ],
      isError: true,
    };
  }

  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const method = args.method.toUpperCase();
  if (!validMethods.includes(method)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Invalid method. Must be one of: ${validMethods.join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate URL format
  try {
    new URL(args.endpoint as string);
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'Invalid endpoint URL format',
          }),
        },
      ],
      isError: true,
    };
  }

  // Parse parameters
  const parameters: ParameterDefinition[] = [];
  if (args.parameters && Array.isArray(args.parameters)) {
    for (const param of args.parameters) {
      if (validateParameter(param)) {
        parameters.push(param as ParameterDefinition);
      }
    }
  }

  // If no parameters provided, create a default one
  if (parameters.length === 0) {
    parameters.push({
      name: 'q',
      location: 'query',
      type: 'string',
      required: false,
    });
  }

  const payloadTypes = args.payload_types as PayloadType[] | undefined;
  const headers = args.headers as Record<string, string> | undefined;

  // Run the fuzz (in mock mode for safety)
  const result = await schemaFuzzer.fuzzEndpoint(
    args.endpoint as string,
    method as HttpMethod,
    parameters,
    { payloadTypes, headers, mockMode: true }
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            result,
            warning: 'Running in mock mode - results are simulated',
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleFuzzParameter(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  // Validate required parameters
  if (!args.endpoint || typeof args.endpoint !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'endpoint is required and must be a string',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!args.method || typeof args.method !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'method is required and must be a string',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!args.parameter || typeof args.parameter !== 'object') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'parameter is required and must be an object',
          }),
        },
      ],
      isError: true,
    };
  }

  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const method = (args.method as string).toUpperCase();
  if (!validMethods.includes(method)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Invalid method. Must be one of: ${validMethods.join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate URL format
  try {
    new URL(args.endpoint as string);
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'Invalid endpoint URL format',
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate parameter structure
  const param = args.parameter as Record<string, unknown>;
  if (!validateParameter(param)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'parameter must have name, location, and type properties',
          }),
        },
      ],
      isError: true,
    };
  }

  const validLocations = ['query', 'path', 'header', 'body', 'cookie'];
  if (!validLocations.includes(param.location as string)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Invalid parameter location. Must be one of: ${validLocations.join(', ')}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const payloadTypes = args.payload_types as PayloadType[] | undefined;
  const headers = args.headers as Record<string, string> | undefined;

  // Build validated parameter definition
  const paramDef: ParameterDefinition = {
    name: param.name as string,
    location: param.location as ParameterLocation,
    type: param.type as string,
    required: (param.required as boolean) || false,
    format: param.format as string | undefined,
    minimum: param.minimum as number | undefined,
    maximum: param.maximum as number | undefined,
    minLength: param.minLength as number | undefined,
    maxLength: param.maxLength as number | undefined,
  };

  // Run the fuzz (in mock mode for safety)
  const result = await schemaFuzzer.fuzzParameter(
    args.endpoint as string,
    method as HttpMethod,
    paramDef,
    { payloadTypes, headers, mockMode: true }
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            result,
            warning: 'Running in mock mode - results are simulated',
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleListPayloads(args: Record<string, unknown>): {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
} {
  const requestedType = args.type as PayloadType | undefined;
  const allTypes = payloadGenerator.getPayloadTypes();
  const descriptions = payloadGenerator.getPayloadTypeDescriptions();

  const results: PayloadListResult[] = [];

  const typesToList = requestedType ? [requestedType] : allTypes;

  for (const type of typesToList) {
    if (!allTypes.includes(type)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Invalid payload type: ${type}. Must be one of: ${allTypes.join(', ')}`,
            }),
          },
        ],
        isError: true,
      };
    }

    const payloads = payloadGenerator.getPayloadsByType(type);
    const examples = payloadGenerator.getPayloadExamples(type);

    let riskLevel: string;
    switch (type) {
      case 'injection':
        riskLevel = 'high';
        break;
      case 'overflow':
        riskLevel = 'medium';
        break;
      case 'format':
        riskLevel = 'medium';
        break;
      case 'boundary':
        riskLevel = 'low';
        break;
      case 'type_confusion':
        riskLevel = 'low';
        break;
      default:
        riskLevel = 'unknown';
    }

    results.push({
      type,
      description: descriptions[type],
      examples,
      risk_level: riskLevel,
    });
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            payload_types: results,
            total_types: allTypes.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

function validateParameter(param: Record<string, unknown>): boolean {
  return (
    typeof param.name === 'string' &&
    typeof param.location === 'string' &&
    typeof param.type === 'string'
  );
}

// Start the server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[fuzzer-mcp] MCP server started');
}

main().catch((error: unknown) => {
  console.error('[fuzzer-mcp] Fatal error:', error);
  process.exit(1);
});

// Export for testing
export {
  server,
  schemaFuzzer,
  payloadGenerator,
  handleFuzzEndpoint,
  handleFuzzParameter,
  handleListPayloads,
  MAX_PAYLOADS,
  MAX_REQUESTS_PER_ENDPOINT,
  RATE_LIMIT,
};
