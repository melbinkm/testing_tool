/**
 * OpenAPI MCP Server Type Definitions
 */

// OpenAPI 3.x document structure (simplified for our use)
export interface OpenAPIDocument {
  openapi: string;
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  paths: Record<string, PathItem>;
  components?: Components;
  security?: SecurityRequirement[];
  tags?: Tag[];
}

export interface OpenAPIInfo {
  title: string;
  description?: string;
  version: string;
  termsOfService?: string;
  contact?: Contact;
  license?: License;
}

export interface Contact {
  name?: string;
  url?: string;
  email?: string;
}

export interface License {
  name: string;
  url?: string;
}

export interface OpenAPIServer {
  url: string;
  description?: string;
  variables?: Record<string, ServerVariable>;
}

export interface ServerVariable {
  default: string;
  enum?: string[];
  description?: string;
}

export interface PathItem {
  $ref?: string;
  summary?: string;
  description?: string;
  get?: Operation;
  put?: Operation;
  post?: Operation;
  delete?: Operation;
  options?: Operation;
  head?: Operation;
  patch?: Operation;
  trace?: Operation;
  parameters?: Parameter[];
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: SecurityRequirement[];
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: Schema;
  example?: unknown;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, MediaType>;
}

export interface MediaType {
  schema?: Schema;
  example?: unknown;
  examples?: Record<string, Example>;
}

export interface Response {
  description: string;
  headers?: Record<string, Header>;
  content?: Record<string, MediaType>;
}

export interface Header {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: Schema;
}

export interface Schema {
  type?: string;
  format?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  $ref?: string;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  nullable?: boolean;
  example?: unknown;
}

export interface Example {
  summary?: string;
  description?: string;
  value?: unknown;
}

export interface Components {
  schemas?: Record<string, Schema>;
  responses?: Record<string, Response>;
  parameters?: Record<string, Parameter>;
  requestBodies?: Record<string, RequestBody>;
  headers?: Record<string, Header>;
  securitySchemes?: Record<string, SecurityScheme>;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: OAuthFlows;
  openIdConnectUrl?: string;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface SecurityRequirement {
  [name: string]: string[];
}

export interface Tag {
  name: string;
  description?: string;
}

// Parsed endpoint representation
export interface ParsedEndpoint {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: ParsedResponse[];
  security: string[];
  deprecated: boolean;
}

export interface ParsedParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required: boolean;
  type: string;
  description?: string;
  example?: unknown;
}

export interface ParsedRequestBody {
  required: boolean;
  contentTypes: string[];
  schema?: Schema;
  description?: string;
}

export interface ParsedResponse {
  statusCode: string;
  description: string;
  contentTypes: string[];
}

// Store representation
export interface ParsedSpec {
  specId: string;
  title: string;
  version: string;
  description?: string;
  servers: string[];
  endpoints: ParsedEndpoint[];
  schemas: Record<string, Schema>;
  securitySchemes: Record<string, SecurityScheme>;
  tags: Tag[];
  parsedAt: string;
}

// Query filters
export interface EndpointFilter {
  method?: string;
  tag?: string;
  pathPattern?: string;
  hasParameter?: string;
  deprecated?: boolean;
}
