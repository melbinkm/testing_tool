import * as fs from 'fs';
import * as yaml from 'js-yaml';

/**
 * Represents a test identity with authentication credentials
 */
export interface TestIdentity {
  identity_id: string;
  label: string;
  roles: string[];
  tenant_id?: string;
  auth_header: string;
  auth_type: 'bearer' | 'basic' | 'api_key' | 'cookie';
  cookies?: Record<string, string>;
}

/**
 * YAML file structure for identities
 */
interface IdentitiesFile {
  identities: TestIdentity[];
}

/**
 * Manages test identities for differential authorization testing
 */
export class IdentityStore {
  private identities: Map<string, TestIdentity> = new Map();

  /**
   * Load identities from a YAML file
   * @param filePath Path to the YAML file
   */
  loadFromFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Identity file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    this.loadFromYaml(content);
  }

  /**
   * Load identities from a YAML string
   * @param yamlContent YAML content as string
   */
  loadFromYaml(yamlContent: string): void {
    const parsed = yaml.load(yamlContent) as IdentitiesFile | null;

    if (!parsed || !parsed.identities || !Array.isArray(parsed.identities)) {
      throw new Error('Invalid identity file format: missing identities array');
    }

    this.loadFromJson(parsed.identities);
  }

  /**
   * Load identities from a JSON array
   * @param data Array of TestIdentity objects
   */
  loadFromJson(data: TestIdentity[]): void {
    this.identities.clear();

    for (const identity of data) {
      this.validateIdentity(identity);
      this.identities.set(identity.identity_id, identity);
    }
  }

  /**
   * Validate an identity object
   */
  private validateIdentity(identity: TestIdentity): void {
    if (!identity.identity_id || typeof identity.identity_id !== 'string') {
      throw new Error('Identity missing required field: identity_id');
    }
    if (!identity.label || typeof identity.label !== 'string') {
      throw new Error(`Identity ${identity.identity_id} missing required field: label`);
    }
    if (!identity.roles || !Array.isArray(identity.roles)) {
      throw new Error(`Identity ${identity.identity_id} missing required field: roles`);
    }
    if (!identity.auth_type || !['bearer', 'basic', 'api_key', 'cookie'].includes(identity.auth_type)) {
      throw new Error(`Identity ${identity.identity_id} has invalid auth_type: ${identity.auth_type}`);
    }
    if (!identity.auth_header && identity.auth_type !== 'cookie') {
      throw new Error(`Identity ${identity.identity_id} missing required field: auth_header`);
    }
    if (identity.auth_type === 'cookie' && (!identity.cookies || typeof identity.cookies !== 'object')) {
      throw new Error(`Identity ${identity.identity_id} with auth_type 'cookie' must have cookies object`);
    }
  }

  /**
   * Get a single identity by ID
   * @param identityId The identity ID
   * @returns The identity or undefined if not found
   */
  get(identityId: string): TestIdentity | undefined {
    return this.identities.get(identityId);
  }

  /**
   * List all identities
   * @returns Array of all identities
   */
  list(): TestIdentity[] {
    return Array.from(this.identities.values());
  }

  /**
   * Get authentication headers for an identity
   * @param identityId The identity ID
   * @returns Headers object for the identity
   */
  getAuthHeaders(identityId: string): Record<string, string> {
    const identity = this.identities.get(identityId);
    if (!identity) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    const headers: Record<string, string> = {};

    switch (identity.auth_type) {
      case 'bearer':
      case 'basic':
        headers['Authorization'] = identity.auth_header;
        break;
      case 'api_key':
        headers['X-API-Key'] = identity.auth_header;
        break;
      case 'cookie':
        if (identity.cookies) {
          const cookieStr = Object.entries(identity.cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
          headers['Cookie'] = cookieStr;
        }
        break;
    }

    return headers;
  }

  /**
   * Get the count of loaded identities
   * @returns Number of identities
   */
  count(): number {
    return this.identities.size;
  }

  /**
   * Clear all identities
   */
  clear(): void {
    this.identities.clear();
  }
}
