/**
 * Scope Loader - Loads and validates engagement scope files
 */

import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { scopeSchema } from './schemas/scope-schema.js';
import { EngagementScope, ScopeValidationError } from './types.js';

/**
 * Load and validate an engagement scope file
 * @param filePath Path to the YAML or JSON scope file
 * @returns Validated and normalized EngagementScope
 * @throws ScopeValidationError if validation fails
 */
export function loadScope(filePath: string): EngagementScope {
  // Check file exists
  if (!existsSync(filePath)) {
    throw new ScopeValidationError(
      `Scope file not found: ${filePath}`,
      [`File does not exist: ${filePath}`]
    );
  }

  // Read file content
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new ScopeValidationError(
      `Failed to read scope file: ${filePath}`,
      [(error as Error).message]
    );
  }

  // Parse based on file extension
  let data: unknown;
  const ext = extname(filePath).toLowerCase();

  try {
    if (ext === '.yaml' || ext === '.yml') {
      data = yaml.load(content);
    } else if (ext === '.json') {
      data = JSON.parse(content);
    } else {
      // Try YAML first, then JSON
      try {
        data = yaml.load(content);
      } catch {
        data = JSON.parse(content);
      }
    }
  } catch (error) {
    throw new ScopeValidationError(
      `Failed to parse scope file: ${filePath}`,
      [(error as Error).message]
    );
  }

  // Validate against schema
  const scope = validateScope(data);

  // Normalize the scope
  return normalizeScope(scope);
}

/**
 * Validate scope data against JSON Schema
 * @param data Parsed scope data
 * @returns Validated EngagementScope
 * @throws ScopeValidationError if validation fails
 */
export function validateScope(data: unknown): EngagementScope {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validate = ajv.compile(scopeSchema);
  const valid = validate(data);

  if (!valid) {
    const errors = (validate.errors as ErrorObject[] | null | undefined)?.map((err: ErrorObject) => {
      const path = err.instancePath || '/';
      return `${path}: ${err.message}`;
    }) ?? ['Unknown validation error'];

    throw new ScopeValidationError(
      'Scope validation failed',
      errors
    );
  }

  return data as EngagementScope;
}

/**
 * Normalize scope data (lowercase domains, etc.)
 * @param scope Raw scope data
 * @returns Normalized scope
 */
export function normalizeScope(scope: EngagementScope): EngagementScope {
  const normalized = { ...scope };

  // Normalize allowlist domains to lowercase
  if (normalized.allowlist?.domains) {
    normalized.allowlist = {
      ...normalized.allowlist,
      domains: normalized.allowlist.domains.map(d => d.toLowerCase())
    };
  }

  // Normalize denylist domains to lowercase
  if (normalized.denylist?.domains) {
    normalized.denylist = {
      ...normalized.denylist,
      domains: normalized.denylist.domains.map(d => d.toLowerCase())
    };
  }

  // Normalize denylist keywords to lowercase for case-insensitive matching
  if (normalized.denylist?.keywords) {
    normalized.denylist = {
      ...normalized.denylist,
      keywords: normalized.denylist.keywords.map(k => k.toLowerCase())
    };
  }

  return normalized;
}

/**
 * Load scope from environment variable or default path
 * @param envVar Environment variable name (default: SCOPE_FILE)
 * @param defaultPath Default path if env var not set
 * @returns Validated EngagementScope
 */
export function loadScopeFromEnv(
  envVar: string = 'SCOPE_FILE',
  defaultPath: string = './scope/engagement.yaml'
): EngagementScope {
  const filePath = process.env[envVar] || defaultPath;
  return loadScope(filePath);
}
