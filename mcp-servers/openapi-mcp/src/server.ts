/**
 * OpenAPI MCP Server
 *
 * Provides MCP tools for parsing and querying OpenAPI 3.x specifications
 * to support penetration testing discovery.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenAPIParser } from './parser.js';
import { EndpointFilter } from './types.js';

// Create parser instance
const parser = new OpenAPIParser();

// Create MCP Server
const server = new Server(
  {
    name: 'openapi-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'openapi_parse',
      description: 'Parse an OpenAPI 3.x specification from YAML or JSON content. Returns parsed spec info and assigns a spec_id for subsequent queries.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The OpenAPI specification content (YAML or JSON)',
          },
          spec_id: {
            type: 'string',
            description: 'Optional custom spec ID. If not provided, a UUID will be generated.',
          },
        },
        required: ['content'],
      },
    },
    {
      name: 'openapi_list_specs',
      description: 'List all loaded OpenAPI specifications',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'openapi_list_endpoints',
      description: 'List endpoints from a loaded OpenAPI specification with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          spec_id: {
            type: 'string',
            description: 'The specification ID to query',
          },
          method: {
            type: 'string',
            description: 'Filter by HTTP method (GET, POST, PUT, DELETE, etc.)',
          },
          tag: {
            type: 'string',
            description: 'Filter by tag name',
          },
          path_pattern: {
            type: 'string',
            description: 'Filter by path pattern (substring match)',
          },
          has_parameter: {
            type: 'string',
            description: 'Filter to endpoints with a specific parameter name',
          },
          deprecated: {
            type: 'boolean',
            description: 'Filter by deprecation status',
          },
        },
        required: ['spec_id'],
      },
    },
    {
      name: 'openapi_get_endpoint',
      description: 'Get detailed information about a specific endpoint',
      inputSchema: {
        type: 'object',
        properties: {
          spec_id: {
            type: 'string',
            description: 'The specification ID',
          },
          path: {
            type: 'string',
            description: 'The endpoint path (e.g., /api/users/{id})',
          },
          method: {
            type: 'string',
            description: 'The HTTP method (GET, POST, etc.)',
          },
        },
        required: ['spec_id', 'path', 'method'],
      },
    },
    {
      name: 'openapi_get_schemas',
      description: 'Get component schemas from a specification',
      inputSchema: {
        type: 'object',
        properties: {
          spec_id: {
            type: 'string',
            description: 'The specification ID',
          },
          schema_name: {
            type: 'string',
            description: 'Optional schema name to get a specific schema',
          },
        },
        required: ['spec_id'],
      },
    },
    {
      name: 'openapi_remove',
      description: 'Remove a loaded OpenAPI specification',
      inputSchema: {
        type: 'object',
        properties: {
          spec_id: {
            type: 'string',
            description: 'The specification ID to remove',
          },
        },
        required: ['spec_id'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'openapi_parse':
        return handleParse(args ?? {});

      case 'openapi_list_specs':
        return handleListSpecs();

      case 'openapi_list_endpoints':
        return handleListEndpoints(args ?? {});

      case 'openapi_get_endpoint':
        return handleGetEndpoint(args ?? {});

      case 'openapi_get_schemas':
        return handleGetSchemas(args ?? {});

      case 'openapi_remove':
        return handleRemove(args ?? {});

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

function handleParse(args: Record<string, unknown>): {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
} {
  if (!args.content || typeof args.content !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'content is required and must be a string',
          }),
        },
      ],
      isError: true,
    };
  }

  const specId = typeof args.spec_id === 'string' ? args.spec_id : undefined;

  try {
    const parsed = parser.parse(args.content, specId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              spec: {
                spec_id: parsed.specId,
                title: parsed.title,
                version: parsed.version,
                description: parsed.description,
                servers: parsed.servers,
                endpoint_count: parsed.endpoints.length,
                schema_count: Object.keys(parsed.schemas).length,
                tags: parsed.tags.map(t => t.name),
                parsed_at: parsed.parsedAt,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Parse error',
          }),
        },
      ],
      isError: true,
    };
  }
}

function handleListSpecs(): {
  content: Array<{ type: string; text: string }>;
} {
  const specs = parser.listSpecs();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            specs,
            count: specs.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleListEndpoints(args: Record<string, unknown>): {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
} {
  if (!args.spec_id || typeof args.spec_id !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'spec_id is required',
          }),
        },
      ],
      isError: true,
    };
  }

  const spec = parser.getSpec(args.spec_id);
  if (!spec) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Specification not found: ${args.spec_id}`,
          }),
        },
      ],
      isError: true,
    };
  }

  const filter: EndpointFilter = {};
  if (typeof args.method === 'string') filter.method = args.method;
  if (typeof args.tag === 'string') filter.tag = args.tag;
  if (typeof args.path_pattern === 'string') filter.pathPattern = args.path_pattern;
  if (typeof args.has_parameter === 'string') filter.hasParameter = args.has_parameter;
  if (typeof args.deprecated === 'boolean') filter.deprecated = args.deprecated;

  const endpoints = parser.getEndpoints(args.spec_id, filter);

  // Return summary for list view
  const summary = endpoints.map(ep => ({
    path: ep.path,
    method: ep.method,
    operationId: ep.operationId,
    summary: ep.summary,
    tags: ep.tags,
    deprecated: ep.deprecated,
    parameterCount: ep.parameters.length,
    hasRequestBody: !!ep.requestBody,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            spec_id: args.spec_id,
            endpoints: summary,
            count: summary.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleGetEndpoint(args: Record<string, unknown>): {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
} {
  if (!args.spec_id || typeof args.spec_id !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'spec_id is required',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!args.path || typeof args.path !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'path is required',
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
            error: 'method is required',
          }),
        },
      ],
      isError: true,
    };
  }

  const endpoint = parser.getEndpoint(args.spec_id, args.path, args.method);

  if (!endpoint) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Endpoint not found: ${args.method.toUpperCase()} ${args.path}`,
          }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            endpoint,
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleGetSchemas(args: Record<string, unknown>): {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
} {
  if (!args.spec_id || typeof args.spec_id !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'spec_id is required',
          }),
        },
      ],
      isError: true,
    };
  }

  const spec = parser.getSpec(args.spec_id);
  if (!spec) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Specification not found: ${args.spec_id}`,
          }),
        },
      ],
      isError: true,
    };
  }

  if (typeof args.schema_name === 'string') {
    const schema = parser.getSchema(args.spec_id, args.schema_name);
    if (!schema) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Schema not found: ${args.schema_name}`,
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              schema_name: args.schema_name,
              schema,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const schemas = parser.getSchemas(args.spec_id);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            spec_id: args.spec_id,
            schemas,
            count: Object.keys(schemas).length,
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleRemove(args: Record<string, unknown>): {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
} {
  if (!args.spec_id || typeof args.spec_id !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'spec_id is required',
          }),
        },
      ],
      isError: true,
    };
  }

  const removed = parser.removeSpec(args.spec_id);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          removed,
          spec_id: args.spec_id,
        }),
      },
    ],
  };
}

// Start the server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[openapi-mcp] MCP server started');
}

main().catch((error: unknown) => {
  console.error('[openapi-mcp] Fatal error:', error);
  process.exit(1);
});

// Export for testing
export {
  server,
  parser,
  handleParse,
  handleListSpecs,
  handleListEndpoints,
  handleGetEndpoint,
  handleGetSchemas,
  handleRemove,
};
