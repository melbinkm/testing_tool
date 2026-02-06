/**
 * OpenAPI Specification Parser
 *
 * Parses OpenAPI 3.x specifications (YAML or JSON) and extracts
 * endpoint information for security testing.
 */

import * as yaml from 'js-yaml';
import {
  OpenAPIDocument,
  ParsedEndpoint,
  ParsedParameter,
  ParsedRequestBody,
  ParsedResponse,
  ParsedSpec,
  PathItem,
  Operation,
  Schema,
  EndpointFilter,
} from './types.js';
import { randomUUID } from 'crypto';

export class OpenAPIParser {
  private specs: Map<string, ParsedSpec> = new Map();

  /**
   * Parse an OpenAPI specification from string content
   */
  parse(content: string, specId?: string): ParsedSpec {
    const id = specId || randomUUID();

    // Try YAML first, then JSON
    let doc: OpenAPIDocument;
    try {
      doc = yaml.load(content) as OpenAPIDocument;
    } catch {
      try {
        doc = JSON.parse(content) as OpenAPIDocument;
      } catch (e) {
        throw new Error('Failed to parse OpenAPI spec: invalid YAML or JSON');
      }
    }

    // Validate basic structure
    if (!doc.openapi || !doc.openapi.startsWith('3.')) {
      throw new Error('Only OpenAPI 3.x specifications are supported');
    }

    if (!doc.info || !doc.info.title || !doc.info.version) {
      throw new Error('OpenAPI spec must have info.title and info.version');
    }

    if (!doc.paths || Object.keys(doc.paths).length === 0) {
      throw new Error('OpenAPI spec must have at least one path');
    }

    // Parse the specification
    const endpoints = this.parseEndpoints(doc);
    const servers = (doc.servers || []).map(s => s.url);

    const parsed: ParsedSpec = {
      specId: id,
      title: doc.info.title,
      version: doc.info.version,
      description: doc.info.description,
      servers,
      endpoints,
      schemas: doc.components?.schemas || {},
      securitySchemes: doc.components?.securitySchemes || {},
      tags: doc.tags || [],
      parsedAt: new Date().toISOString(),
    };

    // Store the parsed spec
    this.specs.set(id, parsed);

    return parsed;
  }

  /**
   * Get a parsed specification by ID
   */
  getSpec(specId: string): ParsedSpec | undefined {
    return this.specs.get(specId);
  }

  /**
   * List all loaded specifications
   */
  listSpecs(): { specId: string; title: string; version: string; endpointCount: number }[] {
    return Array.from(this.specs.values()).map(spec => ({
      specId: spec.specId,
      title: spec.title,
      version: spec.version,
      endpointCount: spec.endpoints.length,
    }));
  }

  /**
   * Get endpoints from a specification with optional filtering
   */
  getEndpoints(specId: string, filter?: EndpointFilter): ParsedEndpoint[] {
    const spec = this.specs.get(specId);
    if (!spec) {
      return [];
    }

    let endpoints = spec.endpoints;

    if (filter) {
      endpoints = endpoints.filter(ep => {
        if (filter.method && ep.method.toLowerCase() !== filter.method.toLowerCase()) {
          return false;
        }
        if (filter.tag && !ep.tags.includes(filter.tag)) {
          return false;
        }
        if (filter.pathPattern && !ep.path.includes(filter.pathPattern)) {
          return false;
        }
        if (filter.hasParameter && !ep.parameters.some(p => p.name === filter.hasParameter)) {
          return false;
        }
        if (filter.deprecated !== undefined && ep.deprecated !== filter.deprecated) {
          return false;
        }
        return true;
      });
    }

    return endpoints;
  }

  /**
   * Get a specific endpoint by path and method
   */
  getEndpoint(specId: string, path: string, method: string): ParsedEndpoint | undefined {
    const spec = this.specs.get(specId);
    if (!spec) {
      return undefined;
    }

    return spec.endpoints.find(
      ep => ep.path === path && ep.method.toLowerCase() === method.toLowerCase()
    );
  }

  /**
   * Get schemas from a specification
   */
  getSchemas(specId: string): Record<string, Schema> {
    const spec = this.specs.get(specId);
    return spec?.schemas || {};
  }

  /**
   * Get a specific schema by name
   */
  getSchema(specId: string, schemaName: string): Schema | undefined {
    const spec = this.specs.get(specId);
    return spec?.schemas?.[schemaName];
  }

  /**
   * Remove a loaded specification
   */
  removeSpec(specId: string): boolean {
    return this.specs.delete(specId);
  }

  /**
   * Clear all loaded specifications
   */
  clear(): void {
    this.specs.clear();
  }

  /**
   * Parse endpoints from an OpenAPI document
   */
  private parseEndpoints(doc: OpenAPIDocument): ParsedEndpoint[] {
    const endpoints: ParsedEndpoint[] = [];
    const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

    for (const [path, pathItem] of Object.entries(doc.paths)) {
      const pathParams = pathItem.parameters || [];

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) continue;

        const endpoint = this.parseOperation(path, method.toUpperCase(), operation, pathParams, doc);
        endpoints.push(endpoint);
      }
    }

    return endpoints;
  }

  /**
   * Parse a single operation into a ParsedEndpoint
   */
  private parseOperation(
    path: string,
    method: string,
    operation: Operation,
    pathParams: PathItem['parameters'],
    doc: OpenAPIDocument
  ): ParsedEndpoint {
    // Merge path-level and operation-level parameters
    const allParams = [...(pathParams || []), ...(operation.parameters || [])];

    // Parse parameters
    const parameters: ParsedParameter[] = allParams.map(param => ({
      name: param.name,
      in: param.in,
      required: param.required || param.in === 'path',
      type: this.getSchemaType(param.schema),
      description: param.description,
      example: param.example,
    }));

    // Parse request body
    let requestBody: ParsedRequestBody | undefined;
    if (operation.requestBody) {
      requestBody = {
        required: operation.requestBody.required || false,
        contentTypes: Object.keys(operation.requestBody.content || {}),
        description: operation.requestBody.description,
      };

      // Get schema from first content type
      const firstContentType = Object.values(operation.requestBody.content || {})[0];
      if (firstContentType?.schema) {
        requestBody.schema = firstContentType.schema;
      }
    }

    // Parse responses
    const responses: ParsedResponse[] = Object.entries(operation.responses || {}).map(
      ([statusCode, response]) => ({
        statusCode,
        description: response.description,
        contentTypes: Object.keys(response.content || {}),
      })
    );

    // Get security requirements
    const security: string[] = [];
    const securityReqs = operation.security || doc.security || [];
    for (const req of securityReqs) {
      security.push(...Object.keys(req));
    }

    return {
      path,
      method,
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags || [],
      parameters,
      requestBody,
      responses,
      security: [...new Set(security)], // deduplicate
      deprecated: operation.deprecated || false,
    };
  }

  /**
   * Get a human-readable type from a schema
   */
  private getSchemaType(schema?: Schema): string {
    if (!schema) return 'any';

    if (schema.$ref) {
      // Extract type name from $ref
      const parts = schema.$ref.split('/');
      return parts[parts.length - 1];
    }

    if (schema.type === 'array' && schema.items) {
      return `array<${this.getSchemaType(schema.items)}>`;
    }

    if (schema.oneOf) {
      return schema.oneOf.map(s => this.getSchemaType(s)).join(' | ');
    }

    if (schema.anyOf) {
      return schema.anyOf.map(s => this.getSchemaType(s)).join(' | ');
    }

    if (schema.allOf) {
      return schema.allOf.map(s => this.getSchemaType(s)).join(' & ');
    }

    return schema.type || 'any';
  }
}
