import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorldModelDatabase } from './database.js';

describe('WorldModelDatabase', () => {
  let db: WorldModelDatabase;

  beforeEach(() => {
    // Use in-memory database for fast, isolated tests
    db = new WorldModelDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Schema Initialization', () => {
    it('should create all tables', () => {
      // If no error thrown, tables were created successfully
      expect(db).toBeDefined();
    });

    it('should allow querying empty tables', () => {
      expect(db.getAssets()).toEqual([]);
      expect(db.getEndpoints()).toEqual([]);
      expect(db.getIdentities()).toEqual([]);
      expect(db.getHypotheses()).toEqual([]);
      expect(db.getFindings()).toEqual([]);
      expect(db.getObservations()).toEqual([]);
    });

    it('should return correct empty stats', () => {
      const stats = db.getStats();
      expect(stats.total_assets).toBe(0);
      expect(stats.total_endpoints).toBe(0);
      expect(stats.total_identities).toBe(0);
      expect(stats.total_hypotheses).toBe(0);
      expect(stats.total_findings).toBe(0);
      expect(stats.total_observations).toBe(0);
    });
  });

  describe('Asset CRUD', () => {
    it('should add an asset with all fields', () => {
      const asset = db.addAsset({
        kind: 'domain',
        name: 'example.com',
        tags: ['production', 'web'],
      });

      expect(asset.asset_id).toBeDefined();
      expect(asset.kind).toBe('domain');
      expect(asset.name).toBe('example.com');
      expect(asset.tags).toEqual(['production', 'web']);
      expect(asset.created_at).toBeDefined();
    });

    it('should add an asset with default empty tags', () => {
      const asset = db.addAsset({
        kind: 'ip',
        name: '192.168.1.1',
      });

      expect(asset.tags).toEqual([]);
    });

    it('should get all assets', () => {
      db.addAsset({ kind: 'domain', name: 'example.com' });
      db.addAsset({ kind: 'ip', name: '192.168.1.1' });
      db.addAsset({ kind: 'service', name: 'mysql:3306' });

      const assets = db.getAssets();
      expect(assets).toHaveLength(3);
    });

    it('should filter assets by kind', () => {
      db.addAsset({ kind: 'domain', name: 'example.com' });
      db.addAsset({ kind: 'domain', name: 'test.com' });
      db.addAsset({ kind: 'ip', name: '192.168.1.1' });

      const domains = db.getAssets({ kind: 'domain' });
      expect(domains).toHaveLength(2);
      expect(domains.every(a => a.kind === 'domain')).toBe(true);
    });

    it('should get asset by ID', () => {
      const created = db.addAsset({
        kind: 'domain',
        name: 'example.com',
        tags: ['test'],
      });

      const retrieved = db.getAssetById(created.asset_id);
      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent asset ID', () => {
      const result = db.getAssetById('non-existent-id');
      expect(result).toBeNull();
    });

    it('should correctly serialize and deserialize tags JSON', () => {
      const asset = db.addAsset({
        kind: 'domain',
        name: 'example.com',
        tags: ['tag1', 'tag2', 'tag with spaces'],
      });

      const retrieved = db.getAssetById(asset.asset_id);
      expect(retrieved?.tags).toEqual(['tag1', 'tag2', 'tag with spaces']);
    });
  });

  describe('Endpoint CRUD', () => {
    it('should add an endpoint with all fields', () => {
      const asset = db.addAsset({ kind: 'domain', name: 'api.example.com' });
      const endpoint = db.addEndpoint({
        method: 'GET',
        path: '/api/users',
        asset_id: asset.asset_id,
        openapi_ref: '#/paths/~1api~1users/get',
      });

      expect(endpoint.endpoint_id).toBeDefined();
      expect(endpoint.method).toBe('GET');
      expect(endpoint.path).toBe('/api/users');
      expect(endpoint.asset_id).toBe(asset.asset_id);
      expect(endpoint.openapi_ref).toBe('#/paths/~1api~1users/get');
    });

    it('should add an endpoint without optional fields', () => {
      const endpoint = db.addEndpoint({
        method: 'POST',
        path: '/api/login',
      });

      expect(endpoint.asset_id).toBeNull();
      expect(endpoint.openapi_ref).toBeNull();
    });

    it('should get all endpoints', () => {
      db.addEndpoint({ method: 'GET', path: '/api/users' });
      db.addEndpoint({ method: 'POST', path: '/api/users' });
      db.addEndpoint({ method: 'DELETE', path: '/api/users/{id}' });

      const endpoints = db.getEndpoints();
      expect(endpoints).toHaveLength(3);
    });

    it('should filter endpoints by asset_id', () => {
      const asset1 = db.addAsset({ kind: 'domain', name: 'api1.example.com' });
      const asset2 = db.addAsset({ kind: 'domain', name: 'api2.example.com' });

      db.addEndpoint({ method: 'GET', path: '/api/v1', asset_id: asset1.asset_id });
      db.addEndpoint({ method: 'POST', path: '/api/v1', asset_id: asset1.asset_id });
      db.addEndpoint({ method: 'GET', path: '/api/v2', asset_id: asset2.asset_id });

      const asset1Endpoints = db.getEndpoints({ asset_id: asset1.asset_id });
      expect(asset1Endpoints).toHaveLength(2);
    });

    it('should filter endpoints by method', () => {
      db.addEndpoint({ method: 'GET', path: '/api/users' });
      db.addEndpoint({ method: 'GET', path: '/api/posts' });
      db.addEndpoint({ method: 'POST', path: '/api/users' });

      const getEndpoints = db.getEndpoints({ method: 'GET' });
      expect(getEndpoints).toHaveLength(2);
    });

    it('should filter endpoints by multiple criteria', () => {
      const asset = db.addAsset({ kind: 'domain', name: 'api.example.com' });

      db.addEndpoint({ method: 'GET', path: '/api/users', asset_id: asset.asset_id });
      db.addEndpoint({ method: 'POST', path: '/api/users', asset_id: asset.asset_id });
      db.addEndpoint({ method: 'GET', path: '/api/other' });

      const filtered = db.getEndpoints({ asset_id: asset.asset_id, method: 'GET' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].path).toBe('/api/users');
    });
  });

  describe('Identity CRUD', () => {
    it('should add an identity with all fields', () => {
      const identity = db.addIdentity({
        label: 'admin_user',
        roles: ['admin', 'user'],
        tenant_id: 'tenant-123',
      });

      expect(identity.identity_id).toBeDefined();
      expect(identity.label).toBe('admin_user');
      expect(identity.roles).toEqual(['admin', 'user']);
      expect(identity.tenant_id).toBe('tenant-123');
    });

    it('should add an identity with default empty roles', () => {
      const identity = db.addIdentity({
        label: 'anonymous',
      });

      expect(identity.roles).toEqual([]);
      expect(identity.tenant_id).toBeNull();
    });

    it('should list all identities', () => {
      db.addIdentity({ label: 'admin' });
      db.addIdentity({ label: 'user' });
      db.addIdentity({ label: 'guest' });

      const identities = db.getIdentities();
      expect(identities).toHaveLength(3);
    });

    it('should correctly serialize and deserialize roles JSON', () => {
      const identity = db.addIdentity({
        label: 'multi_role',
        roles: ['role1', 'role2', 'role with spaces'],
      });

      const identities = db.getIdentities();
      const retrieved = identities.find(i => i.identity_id === identity.identity_id);
      expect(retrieved?.roles).toEqual(['role1', 'role2', 'role with spaces']);
    });
  });

  describe('Hypothesis Lifecycle', () => {
    it('should add a hypothesis with default values', () => {
      const hypothesis = db.addHypothesis({
        description: 'API may be vulnerable to IDOR',
      });

      expect(hypothesis.hypothesis_id).toMatch(/^H-\d+-[a-z0-9]+$/);
      expect(hypothesis.description).toBe('API may be vulnerable to IDOR');
      expect(hypothesis.status).toBe('new');
      expect(hypothesis.confidence).toBe(0.5);
      expect(hypothesis.created_at).toBeDefined();
      expect(hypothesis.updated_at).toBeDefined();
    });

    it('should add a hypothesis with custom values', () => {
      const hypothesis = db.addHypothesis({
        description: 'SQL injection in search',
        status: 'testing',
        confidence: 0.8,
      });

      expect(hypothesis.status).toBe('testing');
      expect(hypothesis.confidence).toBe(0.8);
    });

    it('should update hypothesis status', () => {
      const hypothesis = db.addHypothesis({
        description: 'Test hypothesis',
      });

      const updated = db.updateHypothesis(hypothesis.hypothesis_id, {
        status: 'validated',
      });

      expect(updated?.status).toBe('validated');
      expect(updated?.confidence).toBe(0.5); // unchanged
    });

    it('should update hypothesis confidence', () => {
      const hypothesis = db.addHypothesis({
        description: 'Test hypothesis',
      });

      const updated = db.updateHypothesis(hypothesis.hypothesis_id, {
        confidence: 0.95,
      });

      expect(updated?.confidence).toBe(0.95);
      expect(updated?.status).toBe('new'); // unchanged
    });

    it('should update both status and confidence', () => {
      const hypothesis = db.addHypothesis({
        description: 'Test hypothesis',
      });

      const updated = db.updateHypothesis(hypothesis.hypothesis_id, {
        status: 'rejected',
        confidence: 0.1,
      });

      expect(updated?.status).toBe('rejected');
      expect(updated?.confidence).toBe(0.1);
    });

    it('should update the updated_at timestamp', async () => {
      const hypothesis = db.addHypothesis({
        description: 'Test hypothesis',
      });

      const originalUpdatedAt = hypothesis.updated_at;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = db.updateHypothesis(hypothesis.hypothesis_id, {
        status: 'testing',
      });

      expect(updated?.updated_at).not.toBe(originalUpdatedAt);
    });

    it('should return null when updating non-existent hypothesis', () => {
      const result = db.updateHypothesis('non-existent', { status: 'testing' });
      expect(result).toBeNull();
    });

    it('should get hypothesis by ID', () => {
      const created = db.addHypothesis({
        description: 'Test hypothesis',
      });

      const retrieved = db.getHypothesisById(created.hypothesis_id);
      expect(retrieved?.description).toBe('Test hypothesis');
    });

    it('should return null for non-existent hypothesis ID', () => {
      const result = db.getHypothesisById('non-existent');
      expect(result).toBeNull();
    });

    it('should filter hypotheses by status', () => {
      db.addHypothesis({ description: 'H1', status: 'new' });
      db.addHypothesis({ description: 'H2', status: 'new' });
      db.addHypothesis({ description: 'H3', status: 'testing' });
      db.addHypothesis({ description: 'H4', status: 'validated' });

      const newHypotheses = db.getHypotheses({ status: 'new' });
      expect(newHypotheses).toHaveLength(2);

      const testingHypotheses = db.getHypotheses({ status: 'testing' });
      expect(testingHypotheses).toHaveLength(1);
    });

    it('should get all hypotheses without filter', () => {
      db.addHypothesis({ description: 'H1' });
      db.addHypothesis({ description: 'H2' });
      db.addHypothesis({ description: 'H3' });

      const all = db.getHypotheses();
      expect(all).toHaveLength(3);
    });
  });

  describe('Finding Lifecycle', () => {
    it('should add a finding with required fields', () => {
      const finding = db.addFinding({
        title: 'IDOR in user profile',
        severity: 'high',
      });

      expect(finding.finding_id).toMatch(/^F-\d+-[a-z0-9]+$/);
      expect(finding.title).toBe('IDOR in user profile');
      expect(finding.severity).toBe('high');
      expect(finding.status).toBe('draft');
      expect(finding.confidence).toBe(0.5);
      expect(finding.evidence_refs).toEqual([]);
    });

    it('should add a finding with all fields', () => {
      const hypothesis = db.addHypothesis({ description: 'IDOR hypothesis' });

      const finding = db.addFinding({
        title: 'IDOR vulnerability confirmed',
        severity: 'critical',
        status: 'validated',
        hypothesis_id: hypothesis.hypothesis_id,
        evidence_refs: ['burp-123', 'burp-124'],
        confidence: 0.95,
        remediation: 'Implement proper authorization checks',
      });

      expect(finding.hypothesis_id).toBe(hypothesis.hypothesis_id);
      expect(finding.evidence_refs).toEqual(['burp-123', 'burp-124']);
      expect(finding.confidence).toBe(0.95);
      expect(finding.remediation).toBe('Implement proper authorization checks');
    });

    it('should update finding status', () => {
      const finding = db.addFinding({
        title: 'Test finding',
        severity: 'medium',
      });

      const updated = db.updateFinding(finding.finding_id, {
        status: 'validated',
      });

      expect(updated?.status).toBe('validated');
    });

    it('should update finding confidence', () => {
      const finding = db.addFinding({
        title: 'Test finding',
        severity: 'medium',
      });

      const updated = db.updateFinding(finding.finding_id, {
        confidence: 0.9,
      });

      expect(updated?.confidence).toBe(0.9);
    });

    it('should update finding evidence_refs', () => {
      const finding = db.addFinding({
        title: 'Test finding',
        severity: 'medium',
      });

      const updated = db.updateFinding(finding.finding_id, {
        evidence_refs: ['new-ref-1', 'new-ref-2'],
      });

      expect(updated?.evidence_refs).toEqual(['new-ref-1', 'new-ref-2']);
    });

    it('should return null when updating non-existent finding', () => {
      const result = db.updateFinding('non-existent', { status: 'validated' });
      expect(result).toBeNull();
    });

    it('should get finding by ID', () => {
      const created = db.addFinding({
        title: 'Test finding',
        severity: 'high',
      });

      const retrieved = db.getFindingById(created.finding_id);
      expect(retrieved?.title).toBe('Test finding');
    });

    it('should return null for non-existent finding ID', () => {
      const result = db.getFindingById('non-existent');
      expect(result).toBeNull();
    });

    it('should filter findings by status', () => {
      db.addFinding({ title: 'F1', severity: 'low', status: 'draft' });
      db.addFinding({ title: 'F2', severity: 'medium', status: 'draft' });
      db.addFinding({ title: 'F3', severity: 'high', status: 'validated' });

      const draftFindings = db.getFindings({ status: 'draft' });
      expect(draftFindings).toHaveLength(2);
    });

    it('should filter findings by severity', () => {
      db.addFinding({ title: 'F1', severity: 'low' });
      db.addFinding({ title: 'F2', severity: 'high' });
      db.addFinding({ title: 'F3', severity: 'high' });
      db.addFinding({ title: 'F4', severity: 'critical' });

      const highFindings = db.getFindings({ severity: 'high' });
      expect(highFindings).toHaveLength(2);
    });

    it('should filter findings by multiple criteria', () => {
      db.addFinding({ title: 'F1', severity: 'high', status: 'draft' });
      db.addFinding({ title: 'F2', severity: 'high', status: 'validated' });
      db.addFinding({ title: 'F3', severity: 'low', status: 'draft' });

      const filtered = db.getFindings({ severity: 'high', status: 'draft' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('F1');
    });
  });

  describe('Observation Recording', () => {
    it('should add an observation with required fields', () => {
      const observation = db.addObservation({
        action_id: 'action-123',
        type: 'response_anomaly',
      });

      expect(observation.observation_id).toBeDefined();
      expect(observation.action_id).toBe('action-123');
      expect(observation.type).toBe('response_anomaly');
      expect(observation.confidence).toBe(0.5);
      expect(observation.data).toEqual({});
      expect(observation.evidence_refs).toEqual([]);
    });

    it('should add an observation with all fields', () => {
      const observation = db.addObservation({
        action_id: 'action-456',
        type: 'auth_bypass',
        confidence: 0.9,
        data: { response_code: 200, expected: 403 },
        evidence_refs: ['burp-789'],
      });

      expect(observation.confidence).toBe(0.9);
      expect(observation.data).toEqual({ response_code: 200, expected: 403 });
      expect(observation.evidence_refs).toEqual(['burp-789']);
    });

    it('should list all observations', () => {
      db.addObservation({ action_id: 'a1', type: 't1' });
      db.addObservation({ action_id: 'a2', type: 't2' });
      db.addObservation({ action_id: 'a3', type: 't3' });

      const observations = db.getObservations();
      expect(observations).toHaveLength(3);
    });

    it('should correctly serialize and deserialize data JSON', () => {
      const observation = db.addObservation({
        action_id: 'action-complex',
        type: 'complex_data',
        data: {
          nested: { value: 123 },
          array: [1, 2, 3],
          string: 'test',
          boolean: true,
        },
      });

      const observations = db.getObservations();
      const retrieved = observations.find(o => o.observation_id === observation.observation_id);

      expect(retrieved?.data).toEqual({
        nested: { value: 123 },
        array: [1, 2, 3],
        string: 'test',
        boolean: true,
      });
    });
  });

  describe('Statistics', () => {
    it('should count assets correctly', () => {
      db.addAsset({ kind: 'domain', name: 'd1' });
      db.addAsset({ kind: 'ip', name: 'i1' });

      const stats = db.getStats();
      expect(stats.total_assets).toBe(2);
    });

    it('should count endpoints correctly', () => {
      db.addEndpoint({ method: 'GET', path: '/a' });
      db.addEndpoint({ method: 'POST', path: '/b' });
      db.addEndpoint({ method: 'PUT', path: '/c' });

      const stats = db.getStats();
      expect(stats.total_endpoints).toBe(3);
    });

    it('should count identities correctly', () => {
      db.addIdentity({ label: 'user1' });

      const stats = db.getStats();
      expect(stats.total_identities).toBe(1);
    });

    it('should count hypotheses by status', () => {
      db.addHypothesis({ description: 'H1', status: 'new' });
      db.addHypothesis({ description: 'H2', status: 'new' });
      db.addHypothesis({ description: 'H3', status: 'testing' });
      db.addHypothesis({ description: 'H4', status: 'validated' });
      db.addHypothesis({ description: 'H5', status: 'rejected' });

      const stats = db.getStats();
      expect(stats.total_hypotheses).toBe(5);
      expect(stats.hypotheses_by_status.new).toBe(2);
      expect(stats.hypotheses_by_status.testing).toBe(1);
      expect(stats.hypotheses_by_status.validated).toBe(1);
      expect(stats.hypotheses_by_status.rejected).toBe(1);
    });

    it('should count findings by severity', () => {
      db.addFinding({ title: 'F1', severity: 'low' });
      db.addFinding({ title: 'F2', severity: 'medium' });
      db.addFinding({ title: 'F3', severity: 'medium' });
      db.addFinding({ title: 'F4', severity: 'high' });
      db.addFinding({ title: 'F5', severity: 'high' });
      db.addFinding({ title: 'F6', severity: 'high' });
      db.addFinding({ title: 'F7', severity: 'critical' });

      const stats = db.getStats();
      expect(stats.total_findings).toBe(7);
      expect(stats.findings_by_severity.low).toBe(1);
      expect(stats.findings_by_severity.medium).toBe(2);
      expect(stats.findings_by_severity.high).toBe(3);
      expect(stats.findings_by_severity.critical).toBe(1);
    });

    it('should count findings by status', () => {
      db.addFinding({ title: 'F1', severity: 'low', status: 'draft' });
      db.addFinding({ title: 'F2', severity: 'medium', status: 'draft' });
      db.addFinding({ title: 'F3', severity: 'high', status: 'validated' });
      db.addFinding({ title: 'F4', severity: 'critical', status: 'rejected' });

      const stats = db.getStats();
      expect(stats.findings_by_status.draft).toBe(2);
      expect(stats.findings_by_status.validated).toBe(1);
      expect(stats.findings_by_status.rejected).toBe(1);
    });

    it('should count observations correctly', () => {
      db.addObservation({ action_id: 'a1', type: 't1' });
      db.addObservation({ action_id: 'a2', type: 't2' });

      const stats = db.getStats();
      expect(stats.total_observations).toBe(2);
    });

    it('should return zeros for missing status/severity values', () => {
      // Add only one hypothesis and finding
      db.addHypothesis({ description: 'H1', status: 'new' });
      db.addFinding({ title: 'F1', severity: 'low', status: 'draft' });

      const stats = db.getStats();

      // Check hypotheses - missing statuses should be 0
      expect(stats.hypotheses_by_status.new).toBe(1);
      expect(stats.hypotheses_by_status.testing).toBe(0);
      expect(stats.hypotheses_by_status.validated).toBe(0);
      expect(stats.hypotheses_by_status.rejected).toBe(0);

      // Check findings by severity - missing should be 0
      expect(stats.findings_by_severity.low).toBe(1);
      expect(stats.findings_by_severity.medium).toBe(0);
      expect(stats.findings_by_severity.high).toBe(0);
      expect(stats.findings_by_severity.critical).toBe(0);

      // Check findings by status - missing should be 0
      expect(stats.findings_by_status.draft).toBe(1);
      expect(stats.findings_by_status.validated).toBe(0);
      expect(stats.findings_by_status.rejected).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty filter objects', () => {
      db.addAsset({ kind: 'domain', name: 'example.com' });
      db.addEndpoint({ method: 'GET', path: '/api' });
      db.addHypothesis({ description: 'H1' });
      db.addFinding({ title: 'F1', severity: 'high' });

      expect(db.getAssets({})).toHaveLength(1);
      expect(db.getEndpoints({})).toHaveLength(1);
      expect(db.getHypotheses({})).toHaveLength(1);
      expect(db.getFindings({})).toHaveLength(1);
    });

    it('should handle special characters in names', () => {
      const asset = db.addAsset({
        kind: 'domain',
        name: "test'domain.com",
        tags: ["tag'with'quotes", 'tag"with"doublequotes'],
      });

      const retrieved = db.getAssetById(asset.asset_id);
      expect(retrieved?.name).toBe("test'domain.com");
      expect(retrieved?.tags).toContain("tag'with'quotes");
    });

    it('should handle empty arrays in JSON fields', () => {
      const asset = db.addAsset({
        kind: 'domain',
        name: 'example.com',
        tags: [],
      });

      const retrieved = db.getAssetById(asset.asset_id);
      expect(retrieved?.tags).toEqual([]);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const asset = db.addAsset({ kind: 'domain', name: `domain${i}.com` });
        ids.add(asset.asset_id);
      }

      expect(ids.size).toBe(100);
    });

    it('should handle filter returning no results', () => {
      db.addAsset({ kind: 'domain', name: 'example.com' });

      const result = db.getAssets({ kind: 'ip' });
      expect(result).toEqual([]);
    });
  });
});
