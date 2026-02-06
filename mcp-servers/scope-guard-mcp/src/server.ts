/**
 * Scope Guard MCP Server
 * Enforces penetration testing scope boundaries via MCP tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';
import { EngagementScope, ValidationResult, BudgetStatus } from './types.js';
import { TargetValidator } from './validators.js';
import { BudgetTracker } from './budget-tracker.js';

/**
 * Scope Guard MCP Server class
 */
export class ScopeGuardServer {
  private server: Server;
  private scope: EngagementScope;
  private validator: TargetValidator;
  private budgetTracker: BudgetTracker;

  constructor(scope: EngagementScope) {
    this.scope = scope;
    this.validator = new TargetValidator(scope);
    this.budgetTracker = new BudgetTracker(scope.constraints);

    this.server = new Server(
      {
        name: 'scope-guard',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools()
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            } as TextContent
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: errorMessage }, null, 2)
            } as TextContent
          ],
          isError: true
        };
      }
    });
  }

  /**
   * Get list of available tools
   */
  private getTools(): Tool[] {
    return [
      {
        name: 'scope_validate_target',
        description: 'Validate if a target (URL, domain, or IP) is within the engagement scope. Returns validation result with reason.',
        inputSchema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: 'Target to validate (URL, domain, or IP address)'
            }
          },
          required: ['target']
        }
      },
      {
        name: 'scope_get_allowlist',
        description: 'Get the current allowlist of permitted targets including domains, IP ranges, ports, and services.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'scope_get_constraints',
        description: 'Get the engagement constraints including rate limits, budget, timeouts, and policies.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'scope_check_budget',
        description: 'Check current budget status including total requests, remaining requests, and rate limit status.',
        inputSchema: {
          type: 'object',
          properties: {
            identity_id: {
              type: 'string',
              description: 'Optional identity ID for per-identity budget status'
            }
          },
          required: []
        }
      },
      {
        name: 'scope_record_request',
        description: 'Record a request for budget tracking. Returns success or error if budget exceeded.',
        inputSchema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: 'Target of the request for per-target tracking'
            },
            identity_id: {
              type: 'string',
              description: 'Optional identity ID for the request'
            }
          },
          required: []
        }
      },
      {
        name: 'scope_get_identities',
        description: 'Get available credentials/identities for authenticated testing.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];
  }

  /**
   * Handle a tool call
   */
  private async handleToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case 'scope_validate_target':
        return this.handleValidateTarget(args);

      case 'scope_get_allowlist':
        return this.handleGetAllowlist();

      case 'scope_get_constraints':
        return this.handleGetConstraints();

      case 'scope_check_budget':
        return this.handleCheckBudget(args);

      case 'scope_record_request':
        return this.handleRecordRequest(args);

      case 'scope_get_identities':
        return this.handleGetIdentities();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Handle scope_validate_target tool
   */
  private handleValidateTarget(args: Record<string, unknown>): ValidationResult {
    const target = args.target;
    if (typeof target !== 'string' || !target) {
      throw new Error('target parameter is required and must be a string');
    }

    return this.validator.validateTarget(target);
  }

  /**
   * Handle scope_get_allowlist tool
   */
  private handleGetAllowlist(): {
    engagement_id: string;
    allowlist: EngagementScope['allowlist'];
    denylist?: EngagementScope['denylist'];
  } {
    return {
      engagement_id: this.scope.engagement.id,
      allowlist: this.scope.allowlist,
      denylist: this.scope.denylist
    };
  }

  /**
   * Handle scope_get_constraints tool
   */
  private handleGetConstraints(): {
    engagement_id: string;
    constraints: EngagementScope['constraints'];
    actions?: EngagementScope['actions'];
    approval_policy: EngagementScope['approval_policy'];
  } {
    return {
      engagement_id: this.scope.engagement.id,
      constraints: this.scope.constraints,
      actions: this.scope.actions,
      approval_policy: this.scope.approval_policy
    };
  }

  /**
   * Handle scope_check_budget tool
   */
  private handleCheckBudget(args: Record<string, unknown>): BudgetStatus & {
    engagement_id: string;
    duration_exceeded: boolean;
    elapsed_hours: number;
    max_hours: number;
  } {
    const identityId = typeof args.identity_id === 'string' ? args.identity_id : undefined;
    const status = this.budgetTracker.getStatus(identityId);

    return {
      engagement_id: this.scope.engagement.id,
      ...status,
      duration_exceeded: this.budgetTracker.isDurationExceeded(),
      elapsed_hours: Math.round(this.budgetTracker.getElapsedHours() * 100) / 100,
      max_hours: this.scope.constraints.budget.max_scan_duration_hours
    };
  }

  /**
   * Handle scope_record_request tool
   */
  private handleRecordRequest(args: Record<string, unknown>): {
    success: boolean;
    total_requests: number;
    remaining_requests: number;
  } {
    const target = typeof args.target === 'string' ? args.target : undefined;
    const identityId = typeof args.identity_id === 'string' ? args.identity_id : undefined;

    // Validate target if provided
    if (target) {
      const validation = this.validator.validateTarget(target);
      if (!validation.valid) {
        throw new Error(`Target out of scope: ${validation.reason}`);
      }
    }

    this.budgetTracker.recordRequest(target, identityId);
    const status = this.budgetTracker.getStatus();

    return {
      success: true,
      total_requests: status.total_requests,
      remaining_requests: status.remaining_requests
    };
  }

  /**
   * Handle scope_get_identities tool
   */
  private handleGetIdentities(): {
    engagement_id: string;
    credentials: Array<{
      id: string;
      type: string;
      scope: string[];
      has_credentials: boolean;
    }>;
  } {
    const credentials = (this.scope.credentials || []).map(cred => ({
      id: cred.id,
      type: cred.type,
      scope: cred.scope,
      // Check if credential env vars are set (without exposing values)
      has_credentials: this.checkCredentialEnvVars(cred)
    }));

    return {
      engagement_id: this.scope.engagement.id,
      credentials
    };
  }

  /**
   * Check if credential environment variables are set
   */
  private checkCredentialEnvVars(cred: NonNullable<EngagementScope['credentials']>[number]): boolean {
    if (cred.type === 'basic') {
      return !!(
        (cred.username_env && process.env[cred.username_env]) &&
        (cred.password_env && process.env[cred.password_env])
      );
    }
    if (cred.type === 'bearer') {
      return !!(cred.token_env && process.env[cred.token_env]);
    }
    if (cred.type === 'api_key') {
      return !!(cred.api_key_env && process.env[cred.api_key_env]);
    }
    return false;
  }

  /**
   * Connect to transport and start serving
   */
  async connect(transport: StdioServerTransport): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * Get the validator instance (for testing)
   */
  getValidator(): TargetValidator {
    return this.validator;
  }

  /**
   * Get the budget tracker instance (for testing)
   */
  getBudgetTracker(): BudgetTracker {
    return this.budgetTracker;
  }

  /**
   * Get the scope (for testing)
   */
  getScope(): EngagementScope {
    return this.scope;
  }
}
