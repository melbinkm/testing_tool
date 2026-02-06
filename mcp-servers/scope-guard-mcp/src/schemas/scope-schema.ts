/**
 * JSON Schema for validating engagement scope files
 * This schema matches the structure of scope/engagement.yaml
 */

import type { JSONSchemaType } from 'ajv';
import type { EngagementScope } from '../types.js';

// We use a looser schema type since JSONSchemaType is very strict
// and has issues with optional properties
export const scopeSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['schema_version', 'engagement', 'allowlist', 'constraints', 'approval_policy'],
  properties: {
    schema_version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+$'
    },
    engagement: {
      type: 'object',
      required: ['id', 'name', 'client', 'start_date', 'end_date', 'timezone'],
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        client: { type: 'string', minLength: 1 },
        start_date: { type: 'string', format: 'date' },
        end_date: { type: 'string', format: 'date' },
        timezone: { type: 'string' }
      },
      additionalProperties: false
    },
    allowlist: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string', minLength: 1 }
        },
        ip_ranges: {
          type: 'array',
          items: { type: 'string', minLength: 1 }
        },
        ports: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 65535 }
        },
        services: {
          type: 'array',
          items: { type: 'string', minLength: 1 }
        }
      },
      additionalProperties: false
    },
    denylist: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string', minLength: 1 }
        },
        ip_ranges: {
          type: 'array',
          items: { type: 'string', minLength: 1 }
        },
        ports: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 65535 }
        },
        keywords: {
          type: 'array',
          items: { type: 'string', minLength: 1 }
        }
      },
      additionalProperties: false
    },
    credentials: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'scope'],
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: ['basic', 'bearer', 'api_key', 'oauth2', 'custom'] },
          username_env: { type: 'string' },
          password_env: { type: 'string' },
          token_env: { type: 'string' },
          api_key_env: { type: 'string' },
          scope: {
            type: 'array',
            items: { type: 'string', minLength: 1 }
          }
        },
        additionalProperties: false
      }
    },
    constraints: {
      type: 'object',
      required: ['rate_limits', 'budget', 'timeouts'],
      properties: {
        rate_limits: {
          type: 'object',
          required: ['requests_per_second', 'max_concurrent', 'burst_limit'],
          properties: {
            requests_per_second: { type: 'number', minimum: 0.1 },
            max_concurrent: { type: 'integer', minimum: 1 },
            burst_limit: { type: 'integer', minimum: 1 }
          },
          additionalProperties: false
        },
        budget: {
          type: 'object',
          required: ['max_total_requests', 'max_requests_per_target', 'max_scan_duration_hours'],
          properties: {
            max_total_requests: { type: 'integer', minimum: 1 },
            max_requests_per_target: { type: 'integer', minimum: 1 },
            max_scan_duration_hours: { type: 'number', minimum: 0.1 }
          },
          additionalProperties: false
        },
        timeouts: {
          type: 'object',
          required: ['connect_timeout_ms', 'read_timeout_ms', 'total_timeout_ms'],
          properties: {
            connect_timeout_ms: { type: 'integer', minimum: 100 },
            read_timeout_ms: { type: 'integer', minimum: 100 },
            total_timeout_ms: { type: 'integer', minimum: 100 }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
    actions: {
      type: 'object',
      properties: {
        forbidden: {
          type: 'array',
          items: { type: 'string', minLength: 1 }
        },
        requires_approval: {
          type: 'array',
          items: { type: 'string', minLength: 1 }
        }
      },
      additionalProperties: false
    },
    approval_policy: {
      type: 'object',
      required: ['mode', 'timeout_seconds', 'default_action', 'escalation'],
      properties: {
        mode: { type: 'string', enum: ['INTERACTIVE', 'AUTO_APPROVE', 'DENY_ALL'] },
        timeout_seconds: { type: 'integer', minimum: 1 },
        default_action: { type: 'string', enum: ['DENY', 'ALLOW'] },
        escalation: {
          type: 'object',
          required: ['on_timeout', 'on_error', 'notify'],
          properties: {
            on_timeout: { type: 'string', enum: ['DENY', 'ALLOW'] },
            on_error: { type: 'string', enum: ['DENY', 'ALLOW'] },
            notify: { type: 'boolean' }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
    evidence_policy: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        storage_path: { type: 'string' },
        retention_days: { type: 'integer', minimum: 1 },
        auto_capture: {
          type: 'array',
          items: { type: 'string' }
        },
        redact_patterns: {
          type: 'array',
          items: { type: 'string' }
        },
        formats: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      additionalProperties: false
    },
    logging: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
        audit_trail: { type: 'boolean' },
        correlation_ids: { type: 'boolean' },
        output: {
          type: 'object',
          properties: {
            console: { type: 'boolean' },
            file: { type: 'string' }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
} as const;

export type ScopeSchemaType = typeof scopeSchema;
