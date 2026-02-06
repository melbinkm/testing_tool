import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Asset,
  Endpoint,
  Identity,
  Hypothesis,
  Observation,
  Finding,
  WorldModelStats,
} from './database.js';

// Create shared tool handlers map
const toolHandlers: Map<string, Function> = new Map();

// Mock database instance
const mockDb = {
  addAsset: vi.fn(),
  getAssets: vi.fn(),
  getAssetById: vi.fn(),
  addEndpoint: vi.fn(),
  getEndpoints: vi.fn(),
  addIdentity: vi.fn(),
  getIdentities: vi.fn(),
  addHypothesis: vi.fn(),
  updateHypothesis: vi.fn(),
  getHypothesisById: vi.fn(),
  getHypotheses: vi.fn(),
  addObservation: vi.fn(),
  getObservations: vi.fn(),
  addFinding: vi.fn(),
  updateFinding: vi.fn(),
  getFindingById: vi.fn(),
  getFindings: vi.fn(),
  getStats: vi.fn(),
  close: vi.fn(),
};

// Mock MCP SDK before any imports
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: vi.fn().mockImplementation(() => ({
      registerTool: vi.fn((name: string, _config: object, handler: Function) => {
        toolHandlers.set(name, handler);
      }),
      connect: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

// Mock database module
vi.mock('./database.js', () => {
  return {
    WorldModelDatabase: vi.fn().mockImplementation(() => mockDb),
  };
});

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('World Model MCP Server', () => {
  beforeEach(async () => {
    // Clear mock call counts but don't clear toolHandlers
    // (toolHandlers is populated on first import and we don't want to clear it)
    vi.clearAllMocks();

    // Reset mock implementations for database functions
    mockDb.addAsset.mockReset();
    mockDb.getAssets.mockReset();
    mockDb.getAssetById.mockReset();
    mockDb.addEndpoint.mockReset();
    mockDb.getEndpoints.mockReset();
    mockDb.addIdentity.mockReset();
    mockDb.getIdentities.mockReset();
    mockDb.addHypothesis.mockReset();
    mockDb.updateHypothesis.mockReset();
    mockDb.getHypothesisById.mockReset();
    mockDb.getHypotheses.mockReset();
    mockDb.addObservation.mockReset();
    mockDb.getObservations.mockReset();
    mockDb.addFinding.mockReset();
    mockDb.updateFinding.mockReset();
    mockDb.getFindingById.mockReset();
    mockDb.getFindings.mockReset();
    mockDb.getStats.mockReset();
    mockDb.close.mockReset();

    // Import server to register tools (only registers on first import)
    if (toolHandlers.size === 0) {
      await import('./server.js');
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register all 9 tools', () => {
      const expectedTools = [
        'wm_add_asset',
        'wm_add_endpoint',
        'wm_add_identity',
        'wm_add_hypothesis',
        'wm_update_hypothesis',
        'wm_add_finding',
        'wm_update_finding',
        'wm_add_observation',
        'wm_query',
      ];

      for (const tool of expectedTools) {
        expect(toolHandlers.has(tool)).toBe(true);
      }
    });
  });

  describe('wm_add_asset', () => {
    it('should add an asset successfully', async () => {
      const mockAsset: Asset = {
        asset_id: 'uuid-123',
        kind: 'domain',
        name: 'example.com',
        tags: ['production'],
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addAsset.mockReturnValue(mockAsset);

      const handler = toolHandlers.get('wm_add_asset');
      const result = await handler!({
        kind: 'domain',
        name: 'example.com',
        tags: ['production'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.asset).toEqual(mockAsset);
      expect(mockDb.addAsset).toHaveBeenCalledWith({
        kind: 'domain',
        name: 'example.com',
        tags: ['production'],
      });
    });

    it('should handle errors', async () => {
      mockDb.addAsset.mockImplementation(() => {
        throw new Error('Database error');
      });

      const handler = toolHandlers.get('wm_add_asset');
      const result = await handler!({
        kind: 'domain',
        name: 'example.com',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Database error');
    });

    it('should add asset with ip kind', async () => {
      const mockAsset: Asset = {
        asset_id: 'uuid-124',
        kind: 'ip',
        name: '192.168.1.1',
        tags: [],
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addAsset.mockReturnValue(mockAsset);

      const handler = toolHandlers.get('wm_add_asset');
      const result = await handler!({
        kind: 'ip',
        name: '192.168.1.1',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.asset.kind).toBe('ip');
    });

    it('should add asset with service kind', async () => {
      const mockAsset: Asset = {
        asset_id: 'uuid-125',
        kind: 'service',
        name: 'mysql:3306',
        tags: ['database'],
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addAsset.mockReturnValue(mockAsset);

      const handler = toolHandlers.get('wm_add_asset');
      const result = await handler!({
        kind: 'service',
        name: 'mysql:3306',
        tags: ['database'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.asset.kind).toBe('service');
    });
  });

  describe('wm_add_endpoint', () => {
    it('should add an endpoint successfully', async () => {
      const mockEndpoint: Endpoint = {
        endpoint_id: 'uuid-456',
        asset_id: 'asset-123',
        method: 'GET',
        path: '/api/users',
        openapi_ref: '#/paths/users',
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addEndpoint.mockReturnValue(mockEndpoint);

      const handler = toolHandlers.get('wm_add_endpoint');
      const result = await handler!({
        method: 'GET',
        path: '/api/users',
        asset_id: 'asset-123',
        openapi_ref: '#/paths/users',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.endpoint).toEqual(mockEndpoint);
    });

    it('should handle errors', async () => {
      mockDb.addEndpoint.mockImplementation(() => {
        throw new Error('Foreign key constraint');
      });

      const handler = toolHandlers.get('wm_add_endpoint');
      const result = await handler!({
        method: 'GET',
        path: '/api/users',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should add endpoint without optional fields', async () => {
      const mockEndpoint: Endpoint = {
        endpoint_id: 'uuid-457',
        asset_id: null,
        method: 'POST',
        path: '/api/login',
        openapi_ref: null,
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addEndpoint.mockReturnValue(mockEndpoint);

      const handler = toolHandlers.get('wm_add_endpoint');
      const result = await handler!({
        method: 'POST',
        path: '/api/login',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.endpoint.asset_id).toBeNull();
    });
  });

  describe('wm_add_identity', () => {
    it('should add an identity successfully', async () => {
      const mockIdentity: Identity = {
        identity_id: 'uuid-789',
        label: 'admin_user',
        roles: ['admin'],
        tenant_id: 'tenant-1',
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addIdentity.mockReturnValue(mockIdentity);

      const handler = toolHandlers.get('wm_add_identity');
      const result = await handler!({
        label: 'admin_user',
        roles: ['admin'],
        tenant_id: 'tenant-1',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.identity).toEqual(mockIdentity);
    });

    it('should handle errors', async () => {
      mockDb.addIdentity.mockImplementation(() => {
        throw new Error('Database error');
      });

      const handler = toolHandlers.get('wm_add_identity');
      const result = await handler!({ label: 'test' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should add identity with default values', async () => {
      const mockIdentity: Identity = {
        identity_id: 'uuid-790',
        label: 'guest',
        roles: [],
        tenant_id: null,
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addIdentity.mockReturnValue(mockIdentity);

      const handler = toolHandlers.get('wm_add_identity');
      const result = await handler!({ label: 'guest' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.identity.roles).toEqual([]);
    });
  });

  describe('wm_add_hypothesis', () => {
    it('should add a hypothesis with default values', async () => {
      const mockHypothesis: Hypothesis = {
        hypothesis_id: 'H-123456',
        description: 'IDOR vulnerability',
        status: 'new',
        confidence: 0.5,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addHypothesis.mockReturnValue(mockHypothesis);

      const handler = toolHandlers.get('wm_add_hypothesis');
      const result = await handler!({
        description: 'IDOR vulnerability',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.hypothesis).toEqual(mockHypothesis);
    });

    it('should add a hypothesis with custom values', async () => {
      const mockHypothesis: Hypothesis = {
        hypothesis_id: 'H-123457',
        description: 'SQL injection',
        status: 'testing',
        confidence: 0.8,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addHypothesis.mockReturnValue(mockHypothesis);

      const handler = toolHandlers.get('wm_add_hypothesis');
      const result = await handler!({
        description: 'SQL injection',
        status: 'testing',
        confidence: 0.8,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.hypothesis.status).toBe('testing');
      expect(parsed.hypothesis.confidence).toBe(0.8);
    });

    it('should handle errors', async () => {
      mockDb.addHypothesis.mockImplementation(() => {
        throw new Error('Database error');
      });

      const handler = toolHandlers.get('wm_add_hypothesis');
      const result = await handler!({ description: 'test' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });
  });

  describe('wm_update_hypothesis', () => {
    it('should update hypothesis successfully', async () => {
      const mockHypothesis: Hypothesis = {
        hypothesis_id: 'H-123456',
        description: 'IDOR vulnerability',
        status: 'validated',
        confidence: 0.9,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z',
      };
      mockDb.updateHypothesis.mockReturnValue(mockHypothesis);

      const handler = toolHandlers.get('wm_update_hypothesis');
      const result = await handler!({
        hypothesis_id: 'H-123456',
        status: 'validated',
        confidence: 0.9,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.hypothesis.status).toBe('validated');
    });

    it('should return error for non-existent hypothesis', async () => {
      mockDb.updateHypothesis.mockReturnValue(null);

      const handler = toolHandlers.get('wm_update_hypothesis');
      const result = await handler!({
        hypothesis_id: 'non-existent',
        status: 'testing',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });

    it('should handle errors', async () => {
      mockDb.updateHypothesis.mockImplementation(() => {
        throw new Error('Database error');
      });

      const handler = toolHandlers.get('wm_update_hypothesis');
      const result = await handler!({
        hypothesis_id: 'H-123',
        status: 'testing',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should update only status', async () => {
      const mockHypothesis: Hypothesis = {
        hypothesis_id: 'H-123456',
        description: 'Test',
        status: 'rejected',
        confidence: 0.5,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z',
      };
      mockDb.updateHypothesis.mockReturnValue(mockHypothesis);

      const handler = toolHandlers.get('wm_update_hypothesis');
      const result = await handler!({
        hypothesis_id: 'H-123456',
        status: 'rejected',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.hypothesis.status).toBe('rejected');
    });

    it('should update only confidence', async () => {
      const mockHypothesis: Hypothesis = {
        hypothesis_id: 'H-123456',
        description: 'Test',
        status: 'new',
        confidence: 0.95,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z',
      };
      mockDb.updateHypothesis.mockReturnValue(mockHypothesis);

      const handler = toolHandlers.get('wm_update_hypothesis');
      const result = await handler!({
        hypothesis_id: 'H-123456',
        confidence: 0.95,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.hypothesis.confidence).toBe(0.95);
    });
  });

  describe('wm_add_finding', () => {
    it('should add a finding successfully', async () => {
      const mockFinding: Finding = {
        finding_id: 'F-123456',
        title: 'Critical IDOR',
        severity: 'critical',
        status: 'draft',
        hypothesis_id: 'H-123',
        evidence_refs: ['burp-1'],
        confidence: 0.9,
        remediation: 'Fix authorization',
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addFinding.mockReturnValue(mockFinding);

      const handler = toolHandlers.get('wm_add_finding');
      const result = await handler!({
        title: 'Critical IDOR',
        severity: 'critical',
        hypothesis_id: 'H-123',
        evidence_refs: ['burp-1'],
        confidence: 0.9,
        remediation: 'Fix authorization',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.finding).toEqual(mockFinding);
    });

    it('should handle errors', async () => {
      mockDb.addFinding.mockImplementation(() => {
        throw new Error('Database error');
      });

      const handler = toolHandlers.get('wm_add_finding');
      const result = await handler!({
        title: 'Test',
        severity: 'low',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should add finding with minimal fields', async () => {
      const mockFinding: Finding = {
        finding_id: 'F-123457',
        title: 'Test Finding',
        severity: 'low',
        status: 'draft',
        hypothesis_id: null,
        evidence_refs: [],
        confidence: 0.5,
        remediation: null,
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addFinding.mockReturnValue(mockFinding);

      const handler = toolHandlers.get('wm_add_finding');
      const result = await handler!({
        title: 'Test Finding',
        severity: 'low',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.finding.status).toBe('draft');
    });
  });

  describe('wm_update_finding', () => {
    it('should update finding successfully', async () => {
      const mockFinding: Finding = {
        finding_id: 'F-123456',
        title: 'Critical IDOR',
        severity: 'critical',
        status: 'validated',
        hypothesis_id: 'H-123',
        evidence_refs: ['burp-1', 'burp-2'],
        confidence: 0.95,
        remediation: 'Fix authorization',
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.updateFinding.mockReturnValue(mockFinding);

      const handler = toolHandlers.get('wm_update_finding');
      const result = await handler!({
        finding_id: 'F-123456',
        status: 'validated',
        confidence: 0.95,
        evidence_refs: ['burp-1', 'burp-2'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.finding.status).toBe('validated');
    });

    it('should return error for non-existent finding', async () => {
      mockDb.updateFinding.mockReturnValue(null);

      const handler = toolHandlers.get('wm_update_finding');
      const result = await handler!({
        finding_id: 'non-existent',
        status: 'validated',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });

    it('should handle errors', async () => {
      mockDb.updateFinding.mockImplementation(() => {
        throw new Error('Database error');
      });

      const handler = toolHandlers.get('wm_update_finding');
      const result = await handler!({
        finding_id: 'F-123',
        status: 'validated',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should update only status', async () => {
      const mockFinding: Finding = {
        finding_id: 'F-123456',
        title: 'Test',
        severity: 'high',
        status: 'rejected',
        hypothesis_id: null,
        evidence_refs: [],
        confidence: 0.5,
        remediation: null,
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.updateFinding.mockReturnValue(mockFinding);

      const handler = toolHandlers.get('wm_update_finding');
      const result = await handler!({
        finding_id: 'F-123456',
        status: 'rejected',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.finding.status).toBe('rejected');
    });
  });

  describe('wm_add_observation', () => {
    it('should add an observation successfully', async () => {
      const mockObservation: Observation = {
        observation_id: 'uuid-obs-1',
        action_id: 'action-123',
        type: 'response_anomaly',
        confidence: 0.8,
        data: { status: 200 },
        evidence_refs: ['burp-1'],
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addObservation.mockReturnValue(mockObservation);

      const handler = toolHandlers.get('wm_add_observation');
      const result = await handler!({
        action_id: 'action-123',
        type: 'response_anomaly',
        confidence: 0.8,
        data: { status: 200 },
        evidence_refs: ['burp-1'],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.observation).toEqual(mockObservation);
    });

    it('should handle errors', async () => {
      mockDb.addObservation.mockImplementation(() => {
        throw new Error('Database error');
      });

      const handler = toolHandlers.get('wm_add_observation');
      const result = await handler!({
        action_id: 'action-123',
        type: 'test',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });

    it('should add observation with minimal fields', async () => {
      const mockObservation: Observation = {
        observation_id: 'uuid-obs-2',
        action_id: 'action-456',
        type: 'info',
        confidence: 0.5,
        data: {},
        evidence_refs: [],
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addObservation.mockReturnValue(mockObservation);

      const handler = toolHandlers.get('wm_add_observation');
      const result = await handler!({
        action_id: 'action-456',
        type: 'info',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.observation.data).toEqual({});
    });
  });

  describe('wm_query', () => {
    it('should query assets', async () => {
      const mockAssets: Asset[] = [
        {
          asset_id: 'uuid-1',
          kind: 'domain',
          name: 'example.com',
          tags: [],
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockDb.getAssets.mockReturnValue(mockAssets);

      const handler = toolHandlers.get('wm_query');
      const result = await handler!({ entity_type: 'assets' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.assets).toEqual(mockAssets);
    });

    it('should query assets with filter', async () => {
      mockDb.getAssets.mockReturnValue([]);

      const handler = toolHandlers.get('wm_query');
      await handler!({ entity_type: 'assets', filter: { kind: 'domain' } });

      expect(mockDb.getAssets).toHaveBeenCalledWith({ kind: 'domain' });
    });

    it('should query endpoints', async () => {
      const mockEndpoints: Endpoint[] = [
        {
          endpoint_id: 'uuid-1',
          asset_id: null,
          method: 'GET',
          path: '/api',
          openapi_ref: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockDb.getEndpoints.mockReturnValue(mockEndpoints);

      const handler = toolHandlers.get('wm_query');
      const result = await handler!({ entity_type: 'endpoints' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.endpoints).toEqual(mockEndpoints);
    });

    it('should query endpoints with filter', async () => {
      mockDb.getEndpoints.mockReturnValue([]);

      const handler = toolHandlers.get('wm_query');
      await handler!({ entity_type: 'endpoints', filter: { method: 'POST' } });

      expect(mockDb.getEndpoints).toHaveBeenCalledWith({ method: 'POST' });
    });

    it('should query identities', async () => {
      const mockIdentities: Identity[] = [
        {
          identity_id: 'uuid-1',
          label: 'admin',
          roles: ['admin'],
          tenant_id: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockDb.getIdentities.mockReturnValue(mockIdentities);

      const handler = toolHandlers.get('wm_query');
      const result = await handler!({ entity_type: 'identities' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.identities).toEqual(mockIdentities);
    });

    it('should query hypotheses', async () => {
      const mockHypotheses: Hypothesis[] = [
        {
          hypothesis_id: 'H-123',
          description: 'Test',
          status: 'new',
          confidence: 0.5,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockDb.getHypotheses.mockReturnValue(mockHypotheses);

      const handler = toolHandlers.get('wm_query');
      const result = await handler!({ entity_type: 'hypotheses' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.hypotheses).toEqual(mockHypotheses);
    });

    it('should query hypotheses with status filter', async () => {
      mockDb.getHypotheses.mockReturnValue([]);

      const handler = toolHandlers.get('wm_query');
      await handler!({ entity_type: 'hypotheses', filter: { status: 'validated' } });

      expect(mockDb.getHypotheses).toHaveBeenCalledWith({ status: 'validated' });
    });

    it('should query findings', async () => {
      const mockFindings: Finding[] = [
        {
          finding_id: 'F-123',
          title: 'Test',
          severity: 'high',
          status: 'draft',
          hypothesis_id: null,
          evidence_refs: [],
          confidence: 0.5,
          remediation: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockDb.getFindings.mockReturnValue(mockFindings);

      const handler = toolHandlers.get('wm_query');
      const result = await handler!({ entity_type: 'findings' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.findings).toEqual(mockFindings);
    });

    it('should query findings with filters', async () => {
      mockDb.getFindings.mockReturnValue([]);

      const handler = toolHandlers.get('wm_query');
      await handler!({
        entity_type: 'findings',
        filter: { status: 'validated', severity: 'critical' },
      });

      expect(mockDb.getFindings).toHaveBeenCalledWith({
        status: 'validated',
        severity: 'critical',
      });
    });

    it('should query observations', async () => {
      const mockObservations: Observation[] = [
        {
          observation_id: 'uuid-1',
          action_id: 'action-1',
          type: 'test',
          confidence: 0.5,
          data: {},
          evidence_refs: [],
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      mockDb.getObservations.mockReturnValue(mockObservations);

      const handler = toolHandlers.get('wm_query');
      const result = await handler!({ entity_type: 'observations' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.observations).toEqual(mockObservations);
    });

    it('should query stats', async () => {
      const mockStats: WorldModelStats = {
        total_assets: 5,
        total_endpoints: 10,
        total_identities: 3,
        total_hypotheses: 8,
        hypotheses_by_status: { new: 2, testing: 3, validated: 2, rejected: 1 },
        total_findings: 4,
        findings_by_severity: { low: 1, medium: 1, high: 1, critical: 1 },
        findings_by_status: { draft: 2, validated: 1, rejected: 1 },
        total_observations: 15,
      };
      mockDb.getStats.mockReturnValue(mockStats);

      const handler = toolHandlers.get('wm_query');
      const result = await handler!({ entity_type: 'stats' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.stats).toEqual(mockStats);
    });

    it('should handle errors', async () => {
      mockDb.getAssets.mockImplementation(() => {
        throw new Error('Database error');
      });

      const handler = toolHandlers.get('wm_query');
      const result = await handler!({ entity_type: 'assets' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Database error');
    });
  });

  describe('Response Format', () => {
    it('should return content array with text type', async () => {
      const mockAsset: Asset = {
        asset_id: 'uuid-123',
        kind: 'domain',
        name: 'example.com',
        tags: [],
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addAsset.mockReturnValue(mockAsset);

      const handler = toolHandlers.get('wm_add_asset');
      const result = await handler!({
        kind: 'domain',
        name: 'example.com',
      });

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in text content', async () => {
      const mockAsset: Asset = {
        asset_id: 'uuid-123',
        kind: 'domain',
        name: 'example.com',
        tags: [],
        created_at: '2024-01-01T00:00:00Z',
      };
      mockDb.addAsset.mockReturnValue(mockAsset);

      const handler = toolHandlers.get('wm_add_asset');
      const result = await handler!({
        kind: 'domain',
        name: 'example.com',
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });
});
