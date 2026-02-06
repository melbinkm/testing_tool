import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import { IdentityStore, TestIdentity } from './identity-store.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('IdentityStore', () => {
  let store: IdentityStore;

  const sampleIdentities: TestIdentity[] = [
    {
      identity_id: 'admin',
      label: 'Admin User',
      roles: ['admin', 'user'],
      tenant_id: 'tenant-001',
      auth_type: 'bearer',
      auth_header: 'Bearer admin-token-123',
    },
    {
      identity_id: 'regular-user',
      label: 'Regular User',
      roles: ['user'],
      tenant_id: 'tenant-001',
      auth_type: 'bearer',
      auth_header: 'Bearer user-token-456',
    },
    {
      identity_id: 'api-client',
      label: 'API Client',
      roles: ['api'],
      auth_type: 'api_key',
      auth_header: 'sk-api-key-789',
    },
    {
      identity_id: 'basic-auth-user',
      label: 'Basic Auth User',
      roles: ['user'],
      auth_type: 'basic',
      auth_header: 'Basic dXNlcjpwYXNz',
    },
    {
      identity_id: 'session-user',
      label: 'Session User',
      roles: ['user'],
      auth_type: 'cookie',
      auth_header: '',
      cookies: {
        session_id: 'abc123',
        csrf_token: 'xyz789',
      },
    },
  ];

  const sampleYaml = `
identities:
  - identity_id: admin
    label: Admin User
    roles:
      - admin
      - user
    tenant_id: tenant-001
    auth_type: bearer
    auth_header: "Bearer admin-token-123"
  - identity_id: regular-user
    label: Regular User
    roles:
      - user
    tenant_id: tenant-001
    auth_type: bearer
    auth_header: "Bearer user-token-456"
`;

  beforeEach(() => {
    store = new IdentityStore();
    vi.clearAllMocks();
  });

  describe('loadFromJson', () => {
    it('should load identities from JSON array', () => {
      store.loadFromJson(sampleIdentities);
      expect(store.count()).toBe(5);
    });

    it('should clear existing identities when loading new ones', () => {
      store.loadFromJson(sampleIdentities);
      expect(store.count()).toBe(5);

      store.loadFromJson([sampleIdentities[0]]);
      expect(store.count()).toBe(1);
    });

    it('should throw error for missing identity_id', () => {
      const invalid = [{ label: 'Test', roles: [], auth_type: 'bearer', auth_header: 'x' }] as TestIdentity[];
      expect(() => store.loadFromJson(invalid)).toThrow('missing required field: identity_id');
    });

    it('should throw error for missing label', () => {
      const invalid = [{ identity_id: 'test', roles: [], auth_type: 'bearer', auth_header: 'x' }] as unknown as TestIdentity[];
      expect(() => store.loadFromJson(invalid)).toThrow('missing required field: label');
    });

    it('should throw error for missing roles', () => {
      const invalid = [{ identity_id: 'test', label: 'Test', auth_type: 'bearer', auth_header: 'x' }] as unknown as TestIdentity[];
      expect(() => store.loadFromJson(invalid)).toThrow('missing required field: roles');
    });

    it('should throw error for invalid auth_type', () => {
      const invalid = [{ identity_id: 'test', label: 'Test', roles: [], auth_type: 'invalid', auth_header: 'x' }] as unknown as TestIdentity[];
      expect(() => store.loadFromJson(invalid)).toThrow('invalid auth_type');
    });

    it('should throw error for cookie auth_type without cookies', () => {
      const invalid = [{
        identity_id: 'test',
        label: 'Test',
        roles: [],
        auth_type: 'cookie',
        auth_header: '',
      }] as TestIdentity[];
      expect(() => store.loadFromJson(invalid)).toThrow('must have cookies object');
    });
  });

  describe('loadFromYaml', () => {
    it('should parse and load identities from YAML string', () => {
      store.loadFromYaml(sampleYaml);
      expect(store.count()).toBe(2);
    });

    it('should throw error for empty YAML', () => {
      expect(() => store.loadFromYaml('')).toThrow('Invalid identity file format');
    });

    it('should throw error for YAML without identities array', () => {
      expect(() => store.loadFromYaml('foo: bar')).toThrow('Invalid identity file format');
    });

    it('should throw error for malformed YAML', () => {
      const badYaml = `
identities:
  - identity_id: admin
    label: Admin
    roles: [admin]
    auth_type: bearer
  `;
      expect(() => store.loadFromYaml(badYaml)).toThrow('missing required field: auth_header');
    });
  });

  describe('loadFromFile', () => {
    it('should load identities from file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(sampleYaml);

      store.loadFromFile('/path/to/identities.yaml');
      expect(store.count()).toBe(2);
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/identities.yaml', 'utf-8');
    });

    it('should throw error if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => store.loadFromFile('/nonexistent.yaml')).toThrow('Identity file not found');
    });
  });

  describe('get', () => {
    beforeEach(() => {
      store.loadFromJson(sampleIdentities);
    });

    it('should return identity by ID', () => {
      const identity = store.get('admin');
      expect(identity).toBeDefined();
      expect(identity?.label).toBe('Admin User');
    });

    it('should return undefined for non-existent ID', () => {
      const identity = store.get('nonexistent');
      expect(identity).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should return empty array when no identities loaded', () => {
      expect(store.list()).toEqual([]);
    });

    it('should return all loaded identities', () => {
      store.loadFromJson(sampleIdentities);
      const list = store.list();
      expect(list).toHaveLength(5);
      expect(list.map(i => i.identity_id)).toContain('admin');
      expect(list.map(i => i.identity_id)).toContain('regular-user');
    });
  });

  describe('getAuthHeaders', () => {
    beforeEach(() => {
      store.loadFromJson(sampleIdentities);
    });

    it('should return Authorization header for bearer auth', () => {
      const headers = store.getAuthHeaders('admin');
      expect(headers).toEqual({
        Authorization: 'Bearer admin-token-123',
      });
    });

    it('should return Authorization header for basic auth', () => {
      const headers = store.getAuthHeaders('basic-auth-user');
      expect(headers).toEqual({
        Authorization: 'Basic dXNlcjpwYXNz',
      });
    });

    it('should return X-API-Key header for api_key auth', () => {
      const headers = store.getAuthHeaders('api-client');
      expect(headers).toEqual({
        'X-API-Key': 'sk-api-key-789',
      });
    });

    it('should return Cookie header for cookie auth', () => {
      const headers = store.getAuthHeaders('session-user');
      expect(headers.Cookie).toBeDefined();
      expect(headers.Cookie).toContain('session_id=abc123');
      expect(headers.Cookie).toContain('csrf_token=xyz789');
    });

    it('should throw error for non-existent identity', () => {
      expect(() => store.getAuthHeaders('nonexistent')).toThrow('Identity not found');
    });
  });

  describe('count', () => {
    it('should return 0 when no identities loaded', () => {
      expect(store.count()).toBe(0);
    });

    it('should return correct count after loading', () => {
      store.loadFromJson(sampleIdentities);
      expect(store.count()).toBe(5);
    });
  });

  describe('clear', () => {
    it('should clear all identities', () => {
      store.loadFromJson(sampleIdentities);
      expect(store.count()).toBe(5);

      store.clear();
      expect(store.count()).toBe(0);
      expect(store.list()).toEqual([]);
    });
  });
});
