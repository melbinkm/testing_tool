/**
 * OpenAPI MCP Server Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parser,
  handleParse,
  handleListSpecs,
  handleListEndpoints,
  handleGetEndpoint,
  handleGetSchemas,
  handleRemove,
} from './server.js';

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

const sampleSpec = `
openapi: "3.0.3"
info:
  title: Test API
  version: "1.0.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      tags:
        - users
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: OK
    post:
      operationId: createUser
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
      responses:
        "201":
          description: Created
  /users/{id}:
    get:
      operationId: getUser
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: User found
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
`;

describe('OpenAPI MCP Server', () => {
  beforeEach(() => {
    parser.clear();
  });

  describe('handleParse', () => {
    it('should parse valid OpenAPI spec', () => {
      const result = handleParse({ content: sampleSpec });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.spec.title).toBe('Test API');
      expect(parsed.spec.version).toBe('1.0.0');
      expect(parsed.spec.endpoint_count).toBe(3);
    });

    it('should use custom spec_id', () => {
      const result = handleParse({ content: sampleSpec, spec_id: 'my-spec' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.spec.spec_id).toBe('my-spec');
    });

    it('should return error for missing content', () => {
      const result = handleParse({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('content is required');
      expect(result.isError).toBe(true);
    });

    it('should return error for invalid spec', () => {
      const result = handleParse({ content: 'invalid: { yaml' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should include server URLs', () => {
      const result = handleParse({ content: sampleSpec });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.spec.servers).toContain('https://api.example.com');
    });

    it('should include schema count', () => {
      const result = handleParse({ content: sampleSpec });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.spec.schema_count).toBe(1);
    });
  });

  describe('handleListSpecs', () => {
    it('should return empty list when no specs loaded', () => {
      const result = handleListSpecs();
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.specs).toEqual([]);
      expect(parsed.count).toBe(0);
    });

    it('should list loaded specs', () => {
      handleParse({ content: sampleSpec, spec_id: 'spec-1' });
      handleParse({ content: sampleSpec, spec_id: 'spec-2' });

      const result = handleListSpecs();
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
      expect(parsed.specs.map((s: { specId: string }) => s.specId)).toContain('spec-1');
      expect(parsed.specs.map((s: { specId: string }) => s.specId)).toContain('spec-2');
    });
  });

  describe('handleListEndpoints', () => {
    beforeEach(() => {
      handleParse({ content: sampleSpec, spec_id: 'test' });
    });

    it('should list all endpoints', () => {
      const result = handleListEndpoints({ spec_id: 'test' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(3);
    });

    it('should filter by method', () => {
      const result = handleListEndpoints({ spec_id: 'test', method: 'GET' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
      expect(parsed.endpoints.every((e: { method: string }) => e.method === 'GET')).toBe(true);
    });

    it('should filter by path pattern', () => {
      const result = handleListEndpoints({ spec_id: 'test', path_pattern: '{id}' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
    });

    it('should return error for missing spec_id', () => {
      const result = handleListEndpoints({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('spec_id is required');
    });

    it('should return error for non-existent spec', () => {
      const result = handleListEndpoints({ spec_id: 'nonexistent' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });

    it('should include endpoint summary info', () => {
      const result = handleListEndpoints({ spec_id: 'test' });
      const parsed = JSON.parse(result.content[0].text);

      const postEndpoint = parsed.endpoints.find(
        (e: { path: string; method: string }) => e.path === '/users' && e.method === 'POST'
      );
      expect(postEndpoint.hasRequestBody).toBe(true);
      expect(postEndpoint.operationId).toBe('createUser');
    });
  });

  describe('handleGetEndpoint', () => {
    beforeEach(() => {
      handleParse({ content: sampleSpec, spec_id: 'test' });
    });

    it('should get endpoint details', () => {
      const result = handleGetEndpoint({ spec_id: 'test', path: '/users', method: 'GET' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.endpoint.operationId).toBe('listUsers');
      expect(parsed.endpoint.parameters).toHaveLength(1);
    });

    it('should return error for missing spec_id', () => {
      const result = handleGetEndpoint({ path: '/users', method: 'GET' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('spec_id');
    });

    it('should return error for missing path', () => {
      const result = handleGetEndpoint({ spec_id: 'test', method: 'GET' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('path');
    });

    it('should return error for missing method', () => {
      const result = handleGetEndpoint({ spec_id: 'test', path: '/users' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('method');
    });

    it('should return error for non-existent endpoint', () => {
      const result = handleGetEndpoint({ spec_id: 'test', path: '/nonexistent', method: 'GET' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });
  });

  describe('handleGetSchemas', () => {
    beforeEach(() => {
      handleParse({ content: sampleSpec, spec_id: 'test' });
    });

    it('should get all schemas', () => {
      const result = handleGetSchemas({ spec_id: 'test' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.schemas.User).toBeDefined();
    });

    it('should get specific schema', () => {
      const result = handleGetSchemas({ spec_id: 'test', schema_name: 'User' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.schema_name).toBe('User');
      expect(parsed.schema.type).toBe('object');
    });

    it('should return error for missing spec_id', () => {
      const result = handleGetSchemas({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('spec_id');
    });

    it('should return error for non-existent spec', () => {
      const result = handleGetSchemas({ spec_id: 'nonexistent' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });

    it('should return error for non-existent schema', () => {
      const result = handleGetSchemas({ spec_id: 'test', schema_name: 'NonExistent' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Schema not found');
    });
  });

  describe('handleRemove', () => {
    beforeEach(() => {
      handleParse({ content: sampleSpec, spec_id: 'test' });
    });

    it('should remove loaded spec', () => {
      const result = handleRemove({ spec_id: 'test' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.removed).toBe(true);

      // Verify it's removed
      const listResult = handleListSpecs();
      const listParsed = JSON.parse(listResult.content[0].text);
      expect(listParsed.count).toBe(0);
    });

    it('should return removed=false for non-existent spec', () => {
      const result = handleRemove({ spec_id: 'nonexistent' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.removed).toBe(false);
    });

    it('should return error for missing spec_id', () => {
      const result = handleRemove({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('spec_id');
    });
  });

  describe('response format', () => {
    it('should return content array with text type', () => {
      const result = handleListSpecs();

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });

    it('should return valid JSON', () => {
      const result = handleListSpecs();

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should set isError for error responses', () => {
      const result = handleParse({ content: 'invalid' });

      expect(result.isError).toBe(true);
    });
  });
});
