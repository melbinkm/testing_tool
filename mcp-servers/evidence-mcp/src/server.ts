/**
 * Evidence & Reporting MCP Server
 *
 * Provides tools for evidence bundling, redaction, and report generation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { EvidenceBundler, getBundler } from './bundler.js';
import { Redactor, getRedactor } from './redactor.js';
import { Exporter, getExporter } from './exporter.js';
import type { ArtifactInput, ExportOptions, ReportConfig } from './types.js';

// Environment configuration
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || './evidence';
const REDACT_SECRETS = process.env.REDACT_SECRETS !== 'false';

// Create server instance
const server = new Server(
  { name: 'evidence-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Tool definitions with JSON Schema
const TOOLS = [
  {
    name: 'evidence_bundle',
    description: 'Create a new evidence bundle for a security finding. Returns a bundle_id for adding artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        finding_id: {
          type: 'string',
          description: 'The ID of the finding this evidence relates to',
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata (title, severity, description, cvss_score, cwe_id, etc.)',
          additionalProperties: true,
        },
      },
      required: ['finding_id'],
    },
  },
  {
    name: 'evidence_add_artifact',
    description: 'Add an artifact (request, response, screenshot, log, config) to an evidence bundle',
    inputSchema: {
      type: 'object',
      properties: {
        bundle_id: {
          type: 'string',
          description: 'The evidence bundle ID to add the artifact to',
        },
        artifact: {
          type: 'object',
          description: 'The artifact to add',
          properties: {
            type: {
              type: 'string',
              enum: ['request', 'response', 'screenshot', 'log', 'config', 'other'],
              description: 'Type of artifact',
            },
            name: {
              type: 'string',
              description: 'Name/label for the artifact',
            },
            content: {
              type: 'string',
              description: 'Content of the artifact',
            },
            content_type: {
              type: 'string',
              description: 'MIME type of the content (default: text/plain)',
            },
          },
          required: ['type', 'name', 'content'],
        },
      },
      required: ['bundle_id', 'artifact'],
    },
  },
  {
    name: 'evidence_export',
    description: 'Export an evidence bundle as ZIP or JSON. Sensitive data is redacted by default.',
    inputSchema: {
      type: 'object',
      properties: {
        bundle_id: {
          type: 'string',
          description: 'The evidence bundle ID to export',
        },
        format: {
          type: 'string',
          enum: ['zip', 'json'],
          description: 'Export format',
        },
        include_redacted: {
          type: 'boolean',
          description: 'If true, skip redaction and include raw data (default: false)',
        },
        output_path: {
          type: 'string',
          description: 'Optional file path to save the export',
        },
      },
      required: ['bundle_id', 'format'],
    },
  },
  {
    name: 'evidence_generate_report',
    description: 'Generate a security finding report from an evidence bundle',
    inputSchema: {
      type: 'object',
      properties: {
        bundle_id: {
          type: 'string',
          description: 'The evidence bundle ID',
        },
        template: {
          type: 'string',
          enum: ['markdown', 'html'],
          description: 'Report template format',
        },
        title: {
          type: 'string',
          description: 'Optional report title',
        },
        include_artifacts: {
          type: 'boolean',
          description: 'Include artifact contents in report (default: true)',
        },
        custom_template: {
          type: 'string',
          description: 'Path to a custom Handlebars template file',
        },
      },
      required: ['bundle_id', 'template'],
    },
  },
];

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handler functions
async function handleEvidenceBundle(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const bundler = getBundler();

  // Validate finding_id
  if (!args.finding_id || typeof args.finding_id !== 'string') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: 'finding_id is required and must be a string',
        }),
      }],
      isError: true,
    };
  }

  try {
    const metadata = (args.metadata as Record<string, unknown>) ?? {};
    const bundle = bundler.createBundle(args.finding_id, metadata);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          bundle_id: bundle.bundle_id,
          finding_id: bundle.finding_id,
          created_at: bundle.created_at,
          message: `Evidence bundle created. Use bundle_id "${bundle.bundle_id}" to add artifacts.`,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error creating bundle',
        }),
      }],
      isError: true,
    };
  }
}

async function handleAddArtifact(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const bundler = getBundler();

  // Validate bundle_id
  if (!args.bundle_id || typeof args.bundle_id !== 'string') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: 'bundle_id is required and must be a string',
        }),
      }],
      isError: true,
    };
  }

  // Validate artifact
  if (!args.artifact || typeof args.artifact !== 'object') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: 'artifact is required and must be an object',
        }),
      }],
      isError: true,
    };
  }

  const artifactInput = args.artifact as ArtifactInput;

  try {
    const artifact = bundler.addArtifact(args.bundle_id, artifactInput);

    // Check for sensitive data if redaction is enabled
    let sensitiveDataWarning: string | undefined;
    if (REDACT_SECRETS) {
      const redactor = getRedactor();
      if (redactor.containsSensitiveData(artifact.content)) {
        sensitiveDataWarning = 'Artifact contains sensitive data that will be redacted on export';
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          artifact_id: artifact.artifact_id,
          bundle_id: args.bundle_id,
          type: artifact.type,
          name: artifact.name,
          timestamp: artifact.timestamp,
          sensitive_data_warning: sensitiveDataWarning,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error adding artifact',
        }),
      }],
      isError: true,
    };
  }
}

async function handleExport(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const bundler = getBundler();
  const redactor = getRedactor();
  const exporter = getExporter(redactor);

  // Validate bundle_id
  if (!args.bundle_id || typeof args.bundle_id !== 'string') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: 'bundle_id is required and must be a string',
        }),
      }],
      isError: true,
    };
  }

  // Validate format
  const format = args.format as string;
  if (!format || !['zip', 'json'].includes(format)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: 'format must be "zip" or "json"',
        }),
      }],
      isError: true,
    };
  }

  // Get bundle
  const bundle = bundler.getBundle(args.bundle_id);
  if (!bundle) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: `Bundle not found: ${args.bundle_id}`,
        }),
      }],
      isError: true,
    };
  }

  try {
    const options: ExportOptions = {
      format: format as 'zip' | 'json',
      include_redacted: args.include_redacted === true,
      output_path: args.output_path as string | undefined,
    };

    let result;
    if (format === 'zip') {
      result = await exporter.exportToZip(bundle, options);
    } else {
      result = await exporter.exportToJson(bundle, options);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          format: result.format,
          bundle_id: args.bundle_id,
          artifact_count: result.artifact_count,
          redacted_count: result.redacted_count,
          size_bytes: result.size_bytes,
          output_path: result.output_path,
          data: result.data,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error exporting bundle',
        }),
      }],
      isError: true,
    };
  }
}

async function handleGenerateReport(args: Record<string, unknown>): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const bundler = getBundler();
  const redactor = getRedactor();
  const exporter = getExporter(redactor);

  // Validate bundle_id
  if (!args.bundle_id || typeof args.bundle_id !== 'string') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: 'bundle_id is required and must be a string',
        }),
      }],
      isError: true,
    };
  }

  // Validate template
  const template = args.template as string;
  if (!template || !['markdown', 'html'].includes(template)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: 'template must be "markdown" or "html"',
        }),
      }],
      isError: true,
    };
  }

  // Get bundle
  const bundle = bundler.getBundle(args.bundle_id);
  if (!bundle) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: `Bundle not found: ${args.bundle_id}`,
        }),
      }],
      isError: true,
    };
  }

  try {
    const config: ReportConfig = {
      template: template as 'markdown' | 'html',
      title: args.title as string | undefined,
      include_artifacts: args.include_artifacts !== false,
      custom_template: args.custom_template as string | undefined,
    };

    const result = await exporter.generateReport(bundle, config);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          template: result.template,
          bundle_id: result.bundle_id,
          finding_id: result.finding_id,
          artifact_count: result.artifact_count,
          content: result.content,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error generating report',
        }),
      }],
      isError: true,
    };
  }
}

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'evidence_bundle':
      return handleEvidenceBundle(args ?? {});
    case 'evidence_add_artifact':
      return handleAddArtifact(args ?? {});
    case 'evidence_export':
      return handleExport(args ?? {});
    case 'evidence_generate_report':
      return handleGenerateReport(args ?? {});
    default:
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: `Unknown tool: ${name}`,
          }),
        }],
        isError: true,
      };
  }
});

// Server startup
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[evidence] MCP server started');
  console.error(`[evidence] Evidence directory: ${EVIDENCE_DIR}`);
  console.error(`[evidence] Redact secrets: ${REDACT_SECRETS}`);
}

main().catch((error) => {
  console.error('[evidence] Fatal error:', error);
  process.exit(1);
});

// Export for testing
export { server };
export { handleEvidenceBundle, handleAddArtifact, handleExport, handleGenerateReport };
export function getConfig() {
  return { EVIDENCE_DIR, REDACT_SECRETS };
}
