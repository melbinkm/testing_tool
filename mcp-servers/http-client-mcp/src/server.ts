/**
 * HTTP Client MCP Server
 *
 * Provides MCP tools for making rate-limited HTTP requests with
 * correlation headers for security testing evidence capture.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { HttpClient } from './http-client.js';
import { HttpClientConfig, HttpRequest, BatchRequestItem } from './types.js';
import { BudgetExhaustedError, InvalidRequestError } from './errors.js';

export class HttpClientServer {
  private readonly server: Server;
  private readonly httpClient: HttpClient;
  private readonly config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;
    this.httpClient = new HttpClient(config);

    this.server = new Server(
      {
        name: 'http-client-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'http_send',
          description: 'Send a single HTTP request with rate limiting and correlation headers. Use this for individual API calls.',
          inputSchema: {
            type: 'object',
            properties: {
              method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
                description: 'HTTP method'
              },
              url: {
                type: 'string',
                description: 'Request URL (must be absolute)'
              },
              headers: {
                type: 'object',
                additionalProperties: { type: 'string' },
                description: 'Request headers (optional)'
              },
              body: {
                type: 'string',
                description: 'Request body (optional, for POST/PUT/PATCH)'
              },
              timeout: {
                type: 'number',
                description: 'Request timeout in milliseconds (optional, defaults to server config)'
              },
              identity_id: {
                type: 'string',
                description: 'Identity ID for authorization context tracking (optional)'
              }
            },
            required: ['method', 'url']
          }
        },
        {
          name: 'http_send_batch',
          description: 'Send multiple HTTP requests with concurrency control. Requests are executed in parallel up to the concurrency limit.',
          inputSchema: {
            type: 'object',
            properties: {
              requests: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    method: {
                      type: 'string',
                      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
                    },
                    url: { type: 'string' },
                    headers: {
                      type: 'object',
                      additionalProperties: { type: 'string' }
                    },
                    body: { type: 'string' },
                    timeout: { type: 'number' },
                    identity_id: { type: 'string' }
                  },
                  required: ['method', 'url']
                },
                description: 'Array of HTTP requests to send'
              }
            },
            required: ['requests']
          }
        },
        {
          name: 'http_get_stats',
          description: 'Get HTTP client statistics including request counts, remaining budget, and limiter status.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'http_send':
            return await this.handleHttpSend(args ?? {});

          case 'http_send_batch':
            return await this.handleHttpSendBatch(args ?? {});

          case 'http_get_stats':
            return this.handleGetStats();

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'UNKNOWN_TOOL',
                    message: `Unknown tool: ${name}`
                  })
                }
              ],
              isError: true
            };
        }
      } catch (error) {
        return this.handleError(error);
      }
    });
  }

  private async handleHttpSend(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    // Validate required fields
    if (!args.method || !args.url) {
      throw new InvalidRequestError('method and url are required');
    }

    const method = args.method as HttpRequest['method'];
    const url = args.url as string;

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new InvalidRequestError(`Invalid URL: ${url}`);
    }

    const request: HttpRequest = {
      method,
      url,
      headers: args.headers as Record<string, string> | undefined,
      body: args.body as string | undefined,
      timeout: args.timeout as number | undefined
    };

    const identityId = args.identity_id as string | undefined;

    const result = await this.httpClient.send(request, identityId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ],
      isError: !result.success
    };
  }

  private async handleHttpSendBatch(args: Record<string, unknown>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    if (!args.requests || !Array.isArray(args.requests)) {
      throw new InvalidRequestError('requests array is required');
    }

    const requests = args.requests as Array<{
      method: HttpRequest['method'];
      url: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
      identity_id?: string;
    }>;

    // Validate all requests
    for (const req of requests) {
      if (!req.method || !req.url) {
        throw new InvalidRequestError('Each request must have method and url');
      }
      try {
        new URL(req.url);
      } catch {
        throw new InvalidRequestError(`Invalid URL in batch: ${req.url}`);
      }
    }

    const batchItems: BatchRequestItem[] = requests.map(req => ({
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        timeout: req.timeout
      },
      identity_id: req.identity_id
    }));

    const result = await this.httpClient.sendBatch(batchItems);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ],
      isError: result.failed > 0
    };
  }

  private handleGetStats(): {
    content: Array<{ type: string; text: string }>;
  } {
    const stats = this.httpClient.getStats();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2)
        }
      ]
    };
  }

  private handleError(error: unknown): {
    content: Array<{ type: string; text: string }>;
    isError: boolean;
  } {
    let errorResponse: { error: string; message: string; details?: Record<string, unknown> };

    if (error instanceof BudgetExhaustedError) {
      errorResponse = {
        error: error.code,
        message: error.message,
        details: {
          totalRequests: error.totalRequests,
          maxRequests: error.maxRequests
        }
      };
    } else if (error instanceof InvalidRequestError) {
      errorResponse = {
        error: error.code,
        message: error.message
      };
    } else if (error instanceof Error) {
      errorResponse = {
        error: 'INTERNAL_ERROR',
        message: error.message
      };
    } else {
      errorResponse = {
        error: 'UNKNOWN_ERROR',
        message: String(error)
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2)
        }
      ],
      isError: true
    };
  }

  /**
   * Connect to stdio transport
   */
  async connect(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /**
   * Get the HTTP client (for testing)
   */
  getHttpClient(): HttpClient {
    return this.httpClient;
  }

  /**
   * Get the configuration (for testing)
   */
  getConfig(): HttpClientConfig {
    return this.config;
  }
}
