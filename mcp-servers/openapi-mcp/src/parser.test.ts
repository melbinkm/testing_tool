/**
 * OpenAPI Parser Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAPIParser } from './parser.js';

// Sample OpenAPI 3.0 specification
const sampleSpec = `
openapi: "3.0.3"
info:
  title: Test API
  description: A test API for unit testing
  version: "1.0.0"
servers:
  - url: https://api.example.com/v1
    description: Production server
  - url: https://staging.example.com/v1
    description: Staging server
tags:
  - name: users
    description: User management
  - name: items
    description: Item management
paths:
  /users:
    get:
      operationId: listUsers
      summary: List all users
      description: Returns a paginated list of users
      tags:
        - users
      parameters:
        - name: limit
          in: query
          description: Number of items to return
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 100
        - name: offset
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/User"
    post:
      operationId: createUser
      summary: Create a new user
      tags:
        - users
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateUserRequest"
      responses:
        "201":
          description: User created
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    get:
      operationId: getUser
      summary: Get user by ID
      tags:
        - users
      responses:
        "200":
          description: User found
        "404":
          description: User not found
    delete:
      operationId: deleteUser
      summary: Delete a user
      tags:
        - users
      deprecated: true
      responses:
        "204":
          description: User deleted
  /items:
    get:
      operationId: listItems
      summary: List items
      tags:
        - items
      parameters:
        - name: Authorization
          in: header
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Items list
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKey:
      type: apiKey
      name: X-API-Key
      in: header
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
          format: email
      required:
        - id
        - name
    CreateUserRequest:
      type: object
      properties:
        name:
          type: string
        email:
          type: string
      required:
        - name
        - email
`;

const sampleSpecJson = JSON.stringify({
  openapi: '3.0.0',
  info: {
    title: 'JSON API',
    version: '2.0.0',
  },
  paths: {
    '/health': {
      get: {
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'OK',
          },
        },
      },
    },
  },
});

describe('OpenAPIParser', () => {
  let parser: OpenAPIParser;

  beforeEach(() => {
    parser = new OpenAPIParser();
  });

  describe('parse', () => {
    it('should parse a valid YAML OpenAPI spec', () => {
      const result = parser.parse(sampleSpec);

      expect(result.title).toBe('Test API');
      expect(result.version).toBe('1.0.0');
      expect(result.description).toBe('A test API for unit testing');
      expect(result.specId).toBeDefined();
    });

    it('should parse a valid JSON OpenAPI spec', () => {
      const result = parser.parse(sampleSpecJson);

      expect(result.title).toBe('JSON API');
      expect(result.version).toBe('2.0.0');
    });

    it('should extract servers', () => {
      const result = parser.parse(sampleSpec);

      expect(result.servers).toHaveLength(2);
      expect(result.servers).toContain('https://api.example.com/v1');
      expect(result.servers).toContain('https://staging.example.com/v1');
    });

    it('should extract tags', () => {
      const result = parser.parse(sampleSpec);

      expect(result.tags).toHaveLength(2);
      expect(result.tags.map(t => t.name)).toContain('users');
      expect(result.tags.map(t => t.name)).toContain('items');
    });

    it('should parse endpoints', () => {
      const result = parser.parse(sampleSpec);

      expect(result.endpoints.length).toBeGreaterThan(0);
    });

    it('should use provided spec_id', () => {
      const result = parser.parse(sampleSpec, 'my-custom-id');

      expect(result.specId).toBe('my-custom-id');
    });

    it('should throw for invalid YAML/JSON', () => {
      expect(() => parser.parse('not: valid: yaml: {')).toThrow();
    });

    it('should throw for OpenAPI 2.x', () => {
      const swagger2 = `
swagger: "2.0"
info:
  title: Test
  version: "1.0"
paths:
  /test:
    get:
      responses:
        200:
          description: OK
`;
      expect(() => parser.parse(swagger2)).toThrow('Only OpenAPI 3.x');
    });

    it('should throw for missing info', () => {
      const noInfo = `
openapi: "3.0.0"
paths:
  /test:
    get:
      responses:
        200:
          description: OK
`;
      expect(() => parser.parse(noInfo)).toThrow('info.title');
    });

    it('should throw for empty paths', () => {
      const noPaths = `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths: {}
`;
      expect(() => parser.parse(noPaths)).toThrow('at least one path');
    });

    it('should store parsed spec for later retrieval', () => {
      const result = parser.parse(sampleSpec, 'test-spec');
      const retrieved = parser.getSpec('test-spec');

      expect(retrieved).toBeDefined();
      expect(retrieved?.specId).toBe('test-spec');
      expect(retrieved?.title).toBe(result.title);
    });

    it('should include parsed timestamp', () => {
      const result = parser.parse(sampleSpec);

      expect(result.parsedAt).toBeDefined();
      expect(new Date(result.parsedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('getEndpoints', () => {
    beforeEach(() => {
      parser.parse(sampleSpec, 'test');
    });

    it('should return all endpoints', () => {
      const endpoints = parser.getEndpoints('test');

      expect(endpoints.length).toBe(5); // GET /users, POST /users, GET /users/{id}, DELETE /users/{id}, GET /items
    });

    it('should filter by method', () => {
      const getEndpoints = parser.getEndpoints('test', { method: 'GET' });

      expect(getEndpoints.length).toBe(3);
      expect(getEndpoints.every(e => e.method === 'GET')).toBe(true);
    });

    it('should filter by tag', () => {
      const userEndpoints = parser.getEndpoints('test', { tag: 'users' });

      expect(userEndpoints.length).toBe(4);
      expect(userEndpoints.every(e => e.tags.includes('users'))).toBe(true);
    });

    it('should filter by path pattern', () => {
      const idEndpoints = parser.getEndpoints('test', { pathPattern: '{id}' });

      expect(idEndpoints.length).toBe(2);
      expect(idEndpoints.every(e => e.path.includes('{id}'))).toBe(true);
    });

    it('should filter by parameter name', () => {
      const withLimit = parser.getEndpoints('test', { hasParameter: 'limit' });

      expect(withLimit.length).toBe(1);
      expect(withLimit[0].path).toBe('/users');
      expect(withLimit[0].method).toBe('GET');
    });

    it('should filter by deprecated status', () => {
      const deprecated = parser.getEndpoints('test', { deprecated: true });

      expect(deprecated.length).toBe(1);
      expect(deprecated[0].operationId).toBe('deleteUser');
    });

    it('should combine multiple filters', () => {
      const filtered = parser.getEndpoints('test', { method: 'GET', tag: 'users' });

      expect(filtered.length).toBe(2);
    });

    it('should return empty array for non-existent spec', () => {
      const endpoints = parser.getEndpoints('non-existent');

      expect(endpoints).toEqual([]);
    });
  });

  describe('getEndpoint', () => {
    beforeEach(() => {
      parser.parse(sampleSpec, 'test');
    });

    it('should get specific endpoint', () => {
      const endpoint = parser.getEndpoint('test', '/users', 'GET');

      expect(endpoint).toBeDefined();
      expect(endpoint?.operationId).toBe('listUsers');
      expect(endpoint?.summary).toBe('List all users');
    });

    it('should be case-insensitive for method', () => {
      const endpoint = parser.getEndpoint('test', '/users', 'get');

      expect(endpoint).toBeDefined();
      expect(endpoint?.operationId).toBe('listUsers');
    });

    it('should return undefined for non-existent endpoint', () => {
      const endpoint = parser.getEndpoint('test', '/nonexistent', 'GET');

      expect(endpoint).toBeUndefined();
    });

    it('should return undefined for non-existent spec', () => {
      const endpoint = parser.getEndpoint('nonexistent', '/users', 'GET');

      expect(endpoint).toBeUndefined();
    });
  });

  describe('endpoint parsing details', () => {
    beforeEach(() => {
      parser.parse(sampleSpec, 'test');
    });

    it('should parse parameters correctly', () => {
      const endpoint = parser.getEndpoint('test', '/users', 'GET');

      expect(endpoint?.parameters).toHaveLength(2);

      const limitParam = endpoint?.parameters.find(p => p.name === 'limit');
      expect(limitParam?.in).toBe('query');
      expect(limitParam?.required).toBe(false);
      expect(limitParam?.type).toBe('integer');
    });

    it('should parse path parameters', () => {
      const endpoint = parser.getEndpoint('test', '/users/{id}', 'GET');

      const idParam = endpoint?.parameters.find(p => p.name === 'id');
      expect(idParam?.in).toBe('path');
      expect(idParam?.required).toBe(true);
    });

    it('should parse header parameters', () => {
      const endpoint = parser.getEndpoint('test', '/items', 'GET');

      const authParam = endpoint?.parameters.find(p => p.name === 'Authorization');
      expect(authParam?.in).toBe('header');
      expect(authParam?.required).toBe(true);
    });

    it('should parse request body', () => {
      const endpoint = parser.getEndpoint('test', '/users', 'POST');

      expect(endpoint?.requestBody).toBeDefined();
      expect(endpoint?.requestBody?.required).toBe(true);
      expect(endpoint?.requestBody?.contentTypes).toContain('application/json');
    });

    it('should parse responses', () => {
      const endpoint = parser.getEndpoint('test', '/users/{id}', 'GET');

      expect(endpoint?.responses).toHaveLength(2);
      expect(endpoint?.responses.map(r => r.statusCode)).toContain('200');
      expect(endpoint?.responses.map(r => r.statusCode)).toContain('404');
    });

    it('should parse security requirements', () => {
      const endpoint = parser.getEndpoint('test', '/users', 'POST');

      expect(endpoint?.security).toContain('bearerAuth');
    });

    it('should parse deprecated flag', () => {
      const endpoint = parser.getEndpoint('test', '/users/{id}', 'DELETE');

      expect(endpoint?.deprecated).toBe(true);
    });
  });

  describe('getSchemas', () => {
    beforeEach(() => {
      parser.parse(sampleSpec, 'test');
    });

    it('should return all schemas', () => {
      const schemas = parser.getSchemas('test');

      expect(Object.keys(schemas)).toContain('User');
      expect(Object.keys(schemas)).toContain('CreateUserRequest');
    });

    it('should return empty object for spec without schemas', () => {
      parser.parse(sampleSpecJson, 'json');
      const schemas = parser.getSchemas('json');

      expect(schemas).toEqual({});
    });

    it('should return empty object for non-existent spec', () => {
      const schemas = parser.getSchemas('nonexistent');

      expect(schemas).toEqual({});
    });
  });

  describe('getSchema', () => {
    beforeEach(() => {
      parser.parse(sampleSpec, 'test');
    });

    it('should return specific schema', () => {
      const schema = parser.getSchema('test', 'User');

      expect(schema).toBeDefined();
      expect(schema?.type).toBe('object');
      expect(schema?.properties?.id).toBeDefined();
    });

    it('should return undefined for non-existent schema', () => {
      const schema = parser.getSchema('test', 'NonExistent');

      expect(schema).toBeUndefined();
    });
  });

  describe('listSpecs', () => {
    it('should list all loaded specs', () => {
      parser.parse(sampleSpec, 'spec1');
      parser.parse(sampleSpecJson, 'spec2');

      const specs = parser.listSpecs();

      expect(specs).toHaveLength(2);
      expect(specs.map(s => s.specId)).toContain('spec1');
      expect(specs.map(s => s.specId)).toContain('spec2');
    });

    it('should include endpoint count', () => {
      parser.parse(sampleSpec, 'test');

      const specs = parser.listSpecs();

      expect(specs[0].endpointCount).toBe(5);
    });

    it('should return empty array when no specs loaded', () => {
      const specs = parser.listSpecs();

      expect(specs).toEqual([]);
    });
  });

  describe('removeSpec', () => {
    it('should remove a loaded spec', () => {
      parser.parse(sampleSpec, 'test');
      expect(parser.getSpec('test')).toBeDefined();

      const removed = parser.removeSpec('test');

      expect(removed).toBe(true);
      expect(parser.getSpec('test')).toBeUndefined();
    });

    it('should return false for non-existent spec', () => {
      const removed = parser.removeSpec('nonexistent');

      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all specs', () => {
      parser.parse(sampleSpec, 'spec1');
      parser.parse(sampleSpecJson, 'spec2');
      expect(parser.listSpecs()).toHaveLength(2);

      parser.clear();

      expect(parser.listSpecs()).toHaveLength(0);
    });
  });
});
