import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  WorldModelDatabase,
  type AssetKind,
  type HypothesisStatus,
  type FindingSeverity,
  type FindingStatus,
} from './database.js';

// Environment configuration
const DB_PATH = process.env.DB_PATH ?? './data/world-model.db';

// Create database instance
let db: WorldModelDatabase = new WorldModelDatabase(DB_PATH);

// Create MCP Server
const server = new McpServer({
  name: 'world-model-mcp',
  version: '1.0.0',
});

// Helper for state management in tests
export function setDatabase(newDb: WorldModelDatabase): void {
  db = newDb;
}

export function getDatabase(): WorldModelDatabase {
  return db;
}

// Tool: wm_add_asset
server.registerTool(
  'wm_add_asset',
  {
    description: 'Register a discovered asset (domain, IP, or service)',
    inputSchema: z.object({
      kind: z
        .enum(['domain', 'ip', 'service'])
        .describe('Type of asset'),
      name: z
        .string()
        .describe('Asset name or identifier'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Optional tags for categorization'),
    }).shape,
  },
  async (args: { kind: AssetKind; name: string; tags?: string[] }) => {
    try {
      const asset = db.addAsset({
        kind: args.kind,
        name: args.name,
        tags: args.tags,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, asset }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Tool: wm_add_endpoint
server.registerTool(
  'wm_add_endpoint',
  {
    description: 'Register a discovered API endpoint',
    inputSchema: z.object({
      method: z
        .string()
        .describe('HTTP method (GET, POST, PUT, DELETE, etc.)'),
      path: z
        .string()
        .describe('Endpoint path (e.g., /api/users)'),
      asset_id: z
        .string()
        .optional()
        .describe('Optional asset ID to associate with'),
      openapi_ref: z
        .string()
        .optional()
        .describe('Optional OpenAPI operation reference'),
    }).shape,
  },
  async (args: { method: string; path: string; asset_id?: string; openapi_ref?: string }) => {
    try {
      const endpoint = db.addEndpoint({
        method: args.method,
        path: args.path,
        asset_id: args.asset_id,
        openapi_ref: args.openapi_ref,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, endpoint }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Tool: wm_add_identity
server.registerTool(
  'wm_add_identity',
  {
    description: 'Register a test identity for authorization testing',
    inputSchema: z.object({
      label: z
        .string()
        .describe('Identity label (e.g., "admin_user", "guest")'),
      roles: z
        .array(z.string())
        .optional()
        .describe('Roles assigned to this identity'),
      tenant_id: z
        .string()
        .optional()
        .describe('Tenant ID for multi-tenant testing'),
    }).shape,
  },
  async (args: { label: string; roles?: string[]; tenant_id?: string }) => {
    try {
      const identity = db.addIdentity({
        label: args.label,
        roles: args.roles,
        tenant_id: args.tenant_id,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, identity }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Tool: wm_add_hypothesis
server.registerTool(
  'wm_add_hypothesis',
  {
    description: 'Create a security hypothesis to test',
    inputSchema: z.object({
      description: z
        .string()
        .describe('Description of the security hypothesis'),
      status: z
        .enum(['new', 'testing', 'validated', 'rejected'])
        .optional()
        .describe('Initial status (defaults to "new")'),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Initial confidence level 0-1 (defaults to 0.5)'),
    }).shape,
  },
  async (args: { description: string; status?: HypothesisStatus; confidence?: number }) => {
    try {
      const hypothesis = db.addHypothesis({
        description: args.description,
        status: args.status,
        confidence: args.confidence,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, hypothesis }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Tool: wm_update_hypothesis
server.registerTool(
  'wm_update_hypothesis',
  {
    description: 'Update the status or confidence of a hypothesis',
    inputSchema: z.object({
      hypothesis_id: z
        .string()
        .describe('The hypothesis ID to update'),
      status: z
        .enum(['new', 'testing', 'validated', 'rejected'])
        .optional()
        .describe('New status'),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('New confidence level 0-1'),
    }).shape,
  },
  async (args: { hypothesis_id: string; status?: HypothesisStatus; confidence?: number }) => {
    try {
      const hypothesis = db.updateHypothesis(args.hypothesis_id, {
        status: args.status,
        confidence: args.confidence,
      });

      if (!hypothesis) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Hypothesis not found: ${args.hypothesis_id}`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, hypothesis }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Tool: wm_add_finding
server.registerTool(
  'wm_add_finding',
  {
    description: 'Record a security finding',
    inputSchema: z.object({
      title: z
        .string()
        .describe('Finding title'),
      severity: z
        .enum(['low', 'medium', 'high', 'critical'])
        .describe('Severity level'),
      status: z
        .enum(['draft', 'validated', 'rejected'])
        .optional()
        .describe('Finding status (defaults to "draft")'),
      hypothesis_id: z
        .string()
        .optional()
        .describe('Related hypothesis ID'),
      evidence_refs: z
        .array(z.string())
        .optional()
        .describe('References to evidence (e.g., Burp history IDs)'),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Confidence level 0-1 (defaults to 0.5)'),
      remediation: z
        .string()
        .optional()
        .describe('Recommended remediation'),
    }).shape,
  },
  async (args: {
    title: string;
    severity: FindingSeverity;
    status?: FindingStatus;
    hypothesis_id?: string;
    evidence_refs?: string[];
    confidence?: number;
    remediation?: string;
  }) => {
    try {
      const finding = db.addFinding({
        title: args.title,
        severity: args.severity,
        status: args.status,
        hypothesis_id: args.hypothesis_id,
        evidence_refs: args.evidence_refs,
        confidence: args.confidence,
        remediation: args.remediation,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, finding }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Tool: wm_update_finding
server.registerTool(
  'wm_update_finding',
  {
    description: 'Update a security finding',
    inputSchema: z.object({
      finding_id: z
        .string()
        .describe('The finding ID to update'),
      status: z
        .enum(['draft', 'validated', 'rejected'])
        .optional()
        .describe('New status'),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('New confidence level 0-1'),
      evidence_refs: z
        .array(z.string())
        .optional()
        .describe('Updated evidence references'),
    }).shape,
  },
  async (args: {
    finding_id: string;
    status?: FindingStatus;
    confidence?: number;
    evidence_refs?: string[];
  }) => {
    try {
      const finding = db.updateFinding(args.finding_id, {
        status: args.status,
        confidence: args.confidence,
        evidence_refs: args.evidence_refs,
      });

      if (!finding) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Finding not found: ${args.finding_id}`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, finding }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Tool: wm_add_observation
server.registerTool(
  'wm_add_observation',
  {
    description: 'Record an observation from testing',
    inputSchema: z.object({
      action_id: z
        .string()
        .describe('ID of the action that generated this observation'),
      type: z
        .string()
        .describe('Type of observation (e.g., "response_anomaly", "auth_bypass")'),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Confidence level 0-1 (defaults to 0.5)'),
      data: z
        .record(z.unknown())
        .optional()
        .describe('Arbitrary observation data'),
      evidence_refs: z
        .array(z.string())
        .optional()
        .describe('References to evidence'),
    }).shape,
  },
  async (args: {
    action_id: string;
    type: string;
    confidence?: number;
    data?: Record<string, unknown>;
    evidence_refs?: string[];
  }) => {
    try {
      const observation = db.addObservation({
        action_id: args.action_id,
        type: args.type,
        confidence: args.confidence,
        data: args.data,
        evidence_refs: args.evidence_refs,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, observation }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Tool: wm_query
server.registerTool(
  'wm_query',
  {
    description: 'Query the world model for entities or statistics',
    inputSchema: z.object({
      entity_type: z
        .enum(['assets', 'endpoints', 'identities', 'hypotheses', 'findings', 'observations', 'stats'])
        .describe('Type of entity to query'),
      filter: z
        .record(z.unknown())
        .optional()
        .describe('Optional filter criteria'),
    }).shape,
  },
  async (args: {
    entity_type: 'assets' | 'endpoints' | 'identities' | 'hypotheses' | 'findings' | 'observations' | 'stats';
    filter?: Record<string, unknown>;
  }) => {
    try {
      let result: unknown;

      switch (args.entity_type) {
        case 'assets':
          result = db.getAssets(args.filter as { kind?: AssetKind });
          break;
        case 'endpoints':
          result = db.getEndpoints(args.filter as { asset_id?: string; method?: string });
          break;
        case 'identities':
          result = db.getIdentities();
          break;
        case 'hypotheses':
          result = db.getHypotheses(args.filter as { status?: HypothesisStatus });
          break;
        case 'findings':
          result = db.getFindings(args.filter as { status?: FindingStatus; severity?: FindingSeverity });
          break;
        case 'observations':
          result = db.getObservations();
          break;
        case 'stats':
          result = db.getStats();
          break;
        default:
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: `Invalid entity_type: ${args.entity_type}`,
                }),
              },
            ],
          };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, [args.entity_type]: result }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Start the server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[world-model-mcp] MCP server started');
  console.error(`[world-model-mcp] Database path: ${DB_PATH}`);
}

main().catch((error: unknown) => {
  console.error('[world-model-mcp] Fatal error:', error);
  process.exit(1);
});

// Export for testing
export { server, db };
