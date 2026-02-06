/**
 * Nuclei MCP Server
 *
 * Provides MCP tools for Nuclei vulnerability scanning with mock mode support.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NucleiRunner } from './nuclei-runner.js';
import { TemplateManager } from './template-manager.js';
import {
  NucleiConfig,
  ScanResult,
  TemplateListResult,
  Severity,
} from './types.js';

// Configuration from environment
const NUCLEI_PATH = process.env.NUCLEI_PATH || 'nuclei';
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || './nuclei-templates';
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '10', 10);
const MOCK_MODE = process.env.MOCK_MODE === 'true';

// Create instances
const nucleiRunner = new NucleiRunner({
  nucleiPath: NUCLEI_PATH,
  templatesDir: TEMPLATES_DIR,
  rateLimit: RATE_LIMIT,
  mockMode: MOCK_MODE,
});

const templateManager = new TemplateManager(TEMPLATES_DIR);

console.error(`[nuclei-mcp] Initialized with NUCLEI_PATH=${NUCLEI_PATH}, TEMPLATES_DIR=${TEMPLATES_DIR}, RATE_LIMIT=${RATE_LIMIT}, MOCK_MODE=${MOCK_MODE}`);

// Create MCP Server
const server = new Server(
  {
    name: 'nuclei-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper functions for testing
export function getNucleiRunner(): NucleiRunner {
  return nucleiRunner;
}

export function getTemplateManager(): TemplateManager {
  return templateManager;
}

export function getConfig(): {
  nucleiPath: string;
  templatesDir: string;
  rateLimit: number;
  mockMode: boolean;
} {
  return {
    nucleiPath: NUCLEI_PATH,
    templatesDir: TEMPLATES_DIR,
    rateLimit: RATE_LIMIT,
    mockMode: MOCK_MODE,
  };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'nuclei_scan_single',
      description: 'Scan a single URL with a specific Nuclei template. HIGH RISK - requires scope validation before use.',
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'The target URL to scan (must be in scope)',
          },
          template_id: {
            type: 'string',
            description: 'The Nuclei template ID to use for scanning',
          },
          timeout: {
            type: 'number',
            description: 'Scan timeout in milliseconds (default: 30000)',
          },
        },
        required: ['target', 'template_id'],
      },
    },
    {
      name: 'nuclei_scan_template',
      description: 'Run Nuclei templates against a list of targets. HIGH RISK - requires scope validation before use.',
      inputSchema: {
        type: 'object',
        properties: {
          targets: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of target URLs to scan (all must be in scope)',
          },
          template_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of template IDs to run (optional)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter templates by tags (optional)',
          },
          severity: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['info', 'low', 'medium', 'high', 'critical'],
            },
            description: 'Filter templates by severity levels (optional)',
          },
          timeout: {
            type: 'number',
            description: 'Scan timeout in milliseconds per target (default: 30000)',
          },
        },
        required: ['targets'],
      },
    },
    {
      name: 'nuclei_list_templates',
      description: 'List available Nuclei templates with optional filtering. LOW RISK - read-only operation.',
      inputSchema: {
        type: 'object',
        properties: {
          severity: {
            oneOf: [
              {
                type: 'string',
                enum: ['info', 'low', 'medium', 'high', 'critical'],
              },
              {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['info', 'low', 'medium', 'high', 'critical'],
                },
              },
            ],
            description: 'Filter by severity level(s)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags (e.g., "cve", "rce", "xss")',
          },
          author: {
            type: 'string',
            description: 'Filter by author name',
          },
          search: {
            type: 'string',
            description: 'Search term to filter templates by ID, name, or description',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of templates to return',
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
      case 'nuclei_scan_single':
        return await handleScanSingle(args ?? {});

      case 'nuclei_scan_template':
        return await handleScanTemplate(args ?? {});

      case 'nuclei_list_templates':
        return await handleListTemplates(args ?? {});

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

async function handleScanSingle(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  // Validate required parameters
  if (!args.target || typeof args.target !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'target is required and must be a string',
          }),
        },
      ],
      isError: true,
    };
  }

  if (!args.template_id || typeof args.template_id !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'template_id is required and must be a string',
          }),
        },
      ],
      isError: true,
    };
  }

  const target = args.target as string;
  const templateId = args.template_id as string;

  // Validate URL format
  try {
    new URL(target);
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'Invalid target URL format',
          }),
        },
      ],
      isError: true,
    };
  }

  // Check if template exists
  const templateExists = await templateManager.templateExists(templateId);
  if (!templateExists) {
    // Log warning but allow scan (template might be custom path)
    console.error(`[nuclei-mcp] Warning: Template '${templateId}' not found in template manager`);
  }

  // Run the scan
  const result = await nucleiRunner.scanSingle(target, templateId);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: result.success,
            result,
            warning: result.mock_mode ? 'Running in mock mode - results are simulated' : undefined,
          },
          null,
          2
        ),
      },
    ],
    isError: !result.success,
  };
}

async function handleScanTemplate(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  // Validate required parameters
  if (!args.targets || !Array.isArray(args.targets) || args.targets.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'targets is required and must be a non-empty array',
          }),
        },
      ],
      isError: true,
    };
  }

  const targets = args.targets as string[];
  const templateIds = args.template_ids as string[] | undefined;
  const tags = args.tags as string[] | undefined;
  const severity = args.severity as Severity[] | undefined;

  // Validate all targets are URLs
  for (const target of targets) {
    try {
      new URL(target);
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Invalid target URL format: ${target}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  // Run the scan
  const results = await nucleiRunner.scanWithTemplates(targets, {
    templateIds,
    tags,
    severity,
  });

  const allSuccess = results.every(r => r.success);
  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
  const mockMode = results.some(r => r.mock_mode);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: allSuccess,
            results,
            summary: {
              total_targets: targets.length,
              successful_scans: results.filter(r => r.success).length,
              failed_scans: results.filter(r => !r.success).length,
              total_findings: totalFindings,
            },
            warning: mockMode ? 'Running in mock mode - results are simulated' : undefined,
          },
          null,
          2
        ),
      },
    ],
    isError: !allSuccess,
  };
}

async function handleListTemplates(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const severity = args.severity as Severity | Severity[] | undefined;
  const tags = args.tags as string[] | undefined;
  const author = args.author as string | undefined;
  const search = args.search as string | undefined;
  const limit = args.limit as number | undefined;

  const result = await templateManager.listTemplates({
    severity,
    tags,
    author,
    search,
    limit,
  });

  const mockMode = await templateManager.isMockMode();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: result.success,
            templates: result.templates,
            total_count: result.total_count,
            filtered_count: result.filtered_count,
            returned_count: result.templates.length,
            warning: mockMode ? 'Running in mock mode - templates are simulated' : undefined,
            error: result.error,
          },
          null,
          2
        ),
      },
    ],
    isError: !result.success,
  };
}

// Start the server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const mockMode = await nucleiRunner.isMockMode();
  console.error(`[nuclei-mcp] MCP server started (mock_mode=${mockMode})`);
}

main().catch((error: unknown) => {
  console.error('[nuclei-mcp] Fatal error:', error);
  process.exit(1);
});

// Export for testing
export {
  server,
  nucleiRunner,
  templateManager,
  handleScanSingle,
  handleScanTemplate,
  handleListTemplates,
  NUCLEI_PATH,
  TEMPLATES_DIR,
  RATE_LIMIT,
  MOCK_MODE,
};
