import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// Type definitions
export type AssetKind = 'domain' | 'ip' | 'service';
export type HypothesisStatus = 'new' | 'testing' | 'validated' | 'rejected';
export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FindingStatus = 'draft' | 'validated' | 'rejected';

export interface Asset {
  asset_id: string;
  kind: AssetKind;
  name: string;
  tags: string[];
  created_at: string;
}

export interface AssetInput {
  kind: AssetKind;
  name: string;
  tags?: string[];
}

export interface AssetFilter {
  kind?: AssetKind;
}

export interface Endpoint {
  endpoint_id: string;
  asset_id: string | null;
  method: string;
  path: string;
  openapi_ref: string | null;
  created_at: string;
}

export interface EndpointInput {
  asset_id?: string;
  method: string;
  path: string;
  openapi_ref?: string;
}

export interface EndpointFilter {
  asset_id?: string;
  method?: string;
}

export interface Identity {
  identity_id: string;
  label: string;
  roles: string[];
  tenant_id: string | null;
  created_at: string;
}

export interface IdentityInput {
  label: string;
  roles?: string[];
  tenant_id?: string;
}

export interface Hypothesis {
  hypothesis_id: string;
  description: string;
  status: HypothesisStatus;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface HypothesisInput {
  description: string;
  status?: HypothesisStatus;
  confidence?: number;
}

export interface HypothesisUpdate {
  status?: HypothesisStatus;
  confidence?: number;
}

export interface HypothesisFilter {
  status?: HypothesisStatus;
}

export interface Observation {
  observation_id: string;
  action_id: string;
  type: string;
  confidence: number;
  data: Record<string, unknown>;
  evidence_refs: string[];
  created_at: string;
}

export interface ObservationInput {
  action_id: string;
  type: string;
  confidence?: number;
  data?: Record<string, unknown>;
  evidence_refs?: string[];
}

export interface Finding {
  finding_id: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  hypothesis_id: string | null;
  evidence_refs: string[];
  confidence: number;
  remediation: string | null;
  created_at: string;
}

export interface FindingInput {
  title: string;
  severity: FindingSeverity;
  status?: FindingStatus;
  hypothesis_id?: string;
  evidence_refs?: string[];
  confidence?: number;
  remediation?: string;
}

export interface FindingUpdate {
  status?: FindingStatus;
  confidence?: number;
  evidence_refs?: string[];
}

export interface FindingFilter {
  status?: FindingStatus;
  severity?: FindingSeverity;
}

export interface WorldModelStats {
  total_assets: number;
  total_endpoints: number;
  total_identities: number;
  total_hypotheses: number;
  hypotheses_by_status: Record<HypothesisStatus, number>;
  total_findings: number;
  findings_by_severity: Record<FindingSeverity, number>;
  findings_by_status: Record<FindingStatus, number>;
  total_observations: number;
}

// Database row types (with JSON as string)
interface AssetRow {
  asset_id: string;
  kind: string;
  name: string;
  tags: string;
  created_at: string;
}

interface EndpointRow {
  endpoint_id: string;
  asset_id: string | null;
  method: string;
  path: string;
  openapi_ref: string | null;
  created_at: string;
}

interface IdentityRow {
  identity_id: string;
  label: string;
  roles: string;
  tenant_id: string | null;
  created_at: string;
}

interface HypothesisRow {
  hypothesis_id: string;
  description: string;
  status: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

interface ObservationRow {
  observation_id: string;
  action_id: string;
  type: string;
  confidence: number;
  data: string;
  evidence_refs: string;
  created_at: string;
}

interface FindingRow {
  finding_id: string;
  title: string;
  severity: string;
  status: string;
  hypothesis_id: string | null;
  evidence_refs: string;
  confidence: number;
  remediation: string | null;
  created_at: string;
}

interface CountRow {
  count: number;
}

interface StatusCountRow {
  status: string;
  count: number;
}

interface SeverityCountRow {
  severity: string;
  count: number;
}

export class WorldModelDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists for file-based databases
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds for locks
    this.initSchema();
  }

  private initSchema(): void {
    // Assets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        asset_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('domain', 'ip', 'service')),
        name TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      )
    `);

    // Endpoints table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS endpoints (
        endpoint_id TEXT PRIMARY KEY,
        asset_id TEXT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        openapi_ref TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
      )
    `);

    // Identities table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS identities (
        identity_id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        roles TEXT NOT NULL DEFAULT '[]',
        tenant_id TEXT,
        created_at TEXT NOT NULL
      )
    `);

    // Hypotheses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hypotheses (
        hypothesis_id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('new', 'testing', 'validated', 'rejected')),
        confidence REAL NOT NULL DEFAULT 0.5,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Observations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        observation_id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        data TEXT NOT NULL DEFAULT '{}',
        evidence_refs TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      )
    `);

    // Findings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS findings (
        finding_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
        status TEXT NOT NULL CHECK(status IN ('draft', 'validated', 'rejected')),
        hypothesis_id TEXT,
        evidence_refs TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0.5,
        remediation TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hypothesis_id) REFERENCES hypotheses(hypothesis_id)
      )
    `);

    // Create indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_endpoints_asset_id ON endpoints(asset_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status)`);
  }

  // Asset methods
  addAsset(input: AssetInput): Asset {
    const asset: Asset = {
      asset_id: uuidv4(),
      kind: input.kind,
      name: input.name,
      tags: input.tags ?? [],
      created_at: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO assets (asset_id, kind, name, tags, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(asset.asset_id, asset.kind, asset.name, JSON.stringify(asset.tags), asset.created_at);

    return asset;
  }

  getAssets(filter?: AssetFilter): Asset[] {
    let query = 'SELECT * FROM assets';
    const params: unknown[] = [];

    if (filter?.kind) {
      query += ' WHERE kind = ?';
      params.push(filter.kind);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as AssetRow[];

    return rows.map((row) => ({
      asset_id: row.asset_id,
      kind: row.kind as AssetKind,
      name: row.name,
      tags: JSON.parse(row.tags) as string[],
      created_at: row.created_at,
    }));
  }

  getAssetById(assetId: string): Asset | null {
    const stmt = this.db.prepare('SELECT * FROM assets WHERE asset_id = ?');
    const row = stmt.get(assetId) as AssetRow | undefined;

    if (!row) return null;

    return {
      asset_id: row.asset_id,
      kind: row.kind as AssetKind,
      name: row.name,
      tags: JSON.parse(row.tags) as string[],
      created_at: row.created_at,
    };
  }

  // Endpoint methods
  addEndpoint(input: EndpointInput): Endpoint {
    const endpoint: Endpoint = {
      endpoint_id: uuidv4(),
      asset_id: input.asset_id ?? null,
      method: input.method,
      path: input.path,
      openapi_ref: input.openapi_ref ?? null,
      created_at: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO endpoints (endpoint_id, asset_id, method, path, openapi_ref, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      endpoint.endpoint_id,
      endpoint.asset_id,
      endpoint.method,
      endpoint.path,
      endpoint.openapi_ref,
      endpoint.created_at
    );

    return endpoint;
  }

  getEndpoints(filter?: EndpointFilter): Endpoint[] {
    let query = 'SELECT * FROM endpoints';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.asset_id) {
      conditions.push('asset_id = ?');
      params.push(filter.asset_id);
    }
    if (filter?.method) {
      conditions.push('method = ?');
      params.push(filter.method);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as EndpointRow[];

    return rows.map((row) => ({
      endpoint_id: row.endpoint_id,
      asset_id: row.asset_id,
      method: row.method,
      path: row.path,
      openapi_ref: row.openapi_ref,
      created_at: row.created_at,
    }));
  }

  // Identity methods
  addIdentity(input: IdentityInput): Identity {
    const identity: Identity = {
      identity_id: uuidv4(),
      label: input.label,
      roles: input.roles ?? [],
      tenant_id: input.tenant_id ?? null,
      created_at: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO identities (identity_id, label, roles, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      identity.identity_id,
      identity.label,
      JSON.stringify(identity.roles),
      identity.tenant_id,
      identity.created_at
    );

    return identity;
  }

  getIdentities(): Identity[] {
    const stmt = this.db.prepare('SELECT * FROM identities');
    const rows = stmt.all() as IdentityRow[];

    return rows.map((row) => ({
      identity_id: row.identity_id,
      label: row.label,
      roles: JSON.parse(row.roles) as string[],
      tenant_id: row.tenant_id,
      created_at: row.created_at,
    }));
  }

  // Helper to generate unique timestamp-based IDs
  private generateTimestampId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  // Hypothesis methods
  addHypothesis(input: HypothesisInput): Hypothesis {
    const now = new Date().toISOString();
    const hypothesis: Hypothesis = {
      hypothesis_id: this.generateTimestampId('H'),
      description: input.description,
      status: input.status ?? 'new',
      confidence: input.confidence ?? 0.5,
      created_at: now,
      updated_at: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO hypotheses (hypothesis_id, description, status, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      hypothesis.hypothesis_id,
      hypothesis.description,
      hypothesis.status,
      hypothesis.confidence,
      hypothesis.created_at,
      hypothesis.updated_at
    );

    return hypothesis;
  }

  updateHypothesis(hypothesisId: string, updates: HypothesisUpdate): Hypothesis | null {
    const existing = this.getHypothesisById(hypothesisId);
    if (!existing) return null;

    const updated: Hypothesis = {
      ...existing,
      status: updates.status ?? existing.status,
      confidence: updates.confidence ?? existing.confidence,
      updated_at: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      UPDATE hypotheses SET status = ?, confidence = ?, updated_at = ? WHERE hypothesis_id = ?
    `);
    stmt.run(updated.status, updated.confidence, updated.updated_at, hypothesisId);

    return updated;
  }

  getHypothesisById(hypothesisId: string): Hypothesis | null {
    const stmt = this.db.prepare('SELECT * FROM hypotheses WHERE hypothesis_id = ?');
    const row = stmt.get(hypothesisId) as HypothesisRow | undefined;

    if (!row) return null;

    return {
      hypothesis_id: row.hypothesis_id,
      description: row.description,
      status: row.status as HypothesisStatus,
      confidence: row.confidence,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  getHypotheses(filter?: HypothesisFilter): Hypothesis[] {
    let query = 'SELECT * FROM hypotheses';
    const params: unknown[] = [];

    if (filter?.status) {
      query += ' WHERE status = ?';
      params.push(filter.status);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as HypothesisRow[];

    return rows.map((row) => ({
      hypothesis_id: row.hypothesis_id,
      description: row.description,
      status: row.status as HypothesisStatus,
      confidence: row.confidence,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  // Observation methods
  addObservation(input: ObservationInput): Observation {
    const observation: Observation = {
      observation_id: uuidv4(),
      action_id: input.action_id,
      type: input.type,
      confidence: input.confidence ?? 0.5,
      data: input.data ?? {},
      evidence_refs: input.evidence_refs ?? [],
      created_at: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO observations (observation_id, action_id, type, confidence, data, evidence_refs, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      observation.observation_id,
      observation.action_id,
      observation.type,
      observation.confidence,
      JSON.stringify(observation.data),
      JSON.stringify(observation.evidence_refs),
      observation.created_at
    );

    return observation;
  }

  getObservations(): Observation[] {
    const stmt = this.db.prepare('SELECT * FROM observations');
    const rows = stmt.all() as ObservationRow[];

    return rows.map((row) => ({
      observation_id: row.observation_id,
      action_id: row.action_id,
      type: row.type,
      confidence: row.confidence,
      data: JSON.parse(row.data) as Record<string, unknown>,
      evidence_refs: JSON.parse(row.evidence_refs) as string[],
      created_at: row.created_at,
    }));
  }

  // Finding methods
  addFinding(input: FindingInput): Finding {
    const finding: Finding = {
      finding_id: this.generateTimestampId('F'),
      title: input.title,
      severity: input.severity,
      status: input.status ?? 'draft',
      hypothesis_id: input.hypothesis_id ?? null,
      evidence_refs: input.evidence_refs ?? [],
      confidence: input.confidence ?? 0.5,
      remediation: input.remediation ?? null,
      created_at: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO findings (finding_id, title, severity, status, hypothesis_id, evidence_refs, confidence, remediation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      finding.finding_id,
      finding.title,
      finding.severity,
      finding.status,
      finding.hypothesis_id,
      JSON.stringify(finding.evidence_refs),
      finding.confidence,
      finding.remediation,
      finding.created_at
    );

    return finding;
  }

  updateFinding(findingId: string, updates: FindingUpdate): Finding | null {
    const existing = this.getFindingById(findingId);
    if (!existing) return null;

    const updated: Finding = {
      ...existing,
      status: updates.status ?? existing.status,
      confidence: updates.confidence ?? existing.confidence,
      evidence_refs: updates.evidence_refs ?? existing.evidence_refs,
    };

    const stmt = this.db.prepare(`
      UPDATE findings SET status = ?, confidence = ?, evidence_refs = ? WHERE finding_id = ?
    `);
    stmt.run(updated.status, updated.confidence, JSON.stringify(updated.evidence_refs), findingId);

    return updated;
  }

  getFindingById(findingId: string): Finding | null {
    const stmt = this.db.prepare('SELECT * FROM findings WHERE finding_id = ?');
    const row = stmt.get(findingId) as FindingRow | undefined;

    if (!row) return null;

    return {
      finding_id: row.finding_id,
      title: row.title,
      severity: row.severity as FindingSeverity,
      status: row.status as FindingStatus,
      hypothesis_id: row.hypothesis_id,
      evidence_refs: JSON.parse(row.evidence_refs) as string[],
      confidence: row.confidence,
      remediation: row.remediation,
      created_at: row.created_at,
    };
  }

  getFindings(filter?: FindingFilter): Finding[] {
    let query = 'SELECT * FROM findings';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.severity) {
      conditions.push('severity = ?');
      params.push(filter.severity);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as FindingRow[];

    return rows.map((row) => ({
      finding_id: row.finding_id,
      title: row.title,
      severity: row.severity as FindingSeverity,
      status: row.status as FindingStatus,
      hypothesis_id: row.hypothesis_id,
      evidence_refs: JSON.parse(row.evidence_refs) as string[],
      confidence: row.confidence,
      remediation: row.remediation,
      created_at: row.created_at,
    }));
  }

  // Statistics
  getStats(): WorldModelStats {
    const totalAssets = (
      this.db.prepare('SELECT COUNT(*) as count FROM assets').get() as CountRow
    ).count;
    const totalEndpoints = (
      this.db.prepare('SELECT COUNT(*) as count FROM endpoints').get() as CountRow
    ).count;
    const totalIdentities = (
      this.db.prepare('SELECT COUNT(*) as count FROM identities').get() as CountRow
    ).count;
    const totalHypotheses = (
      this.db.prepare('SELECT COUNT(*) as count FROM hypotheses').get() as CountRow
    ).count;
    const totalFindings = (
      this.db.prepare('SELECT COUNT(*) as count FROM findings').get() as CountRow
    ).count;
    const totalObservations = (
      this.db.prepare('SELECT COUNT(*) as count FROM observations').get() as CountRow
    ).count;

    // Hypotheses by status
    const hypothesesByStatusRows = this.db
      .prepare('SELECT status, COUNT(*) as count FROM hypotheses GROUP BY status')
      .all() as StatusCountRow[];
    const hypothesesByStatus: Record<HypothesisStatus, number> = {
      new: 0,
      testing: 0,
      validated: 0,
      rejected: 0,
    };
    for (const row of hypothesesByStatusRows) {
      hypothesesByStatus[row.status as HypothesisStatus] = row.count;
    }

    // Findings by severity
    const findingsBySeverityRows = this.db
      .prepare('SELECT severity, COUNT(*) as count FROM findings GROUP BY severity')
      .all() as SeverityCountRow[];
    const findingsBySeverity: Record<FindingSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    for (const row of findingsBySeverityRows) {
      findingsBySeverity[row.severity as FindingSeverity] = row.count;
    }

    // Findings by status
    const findingsByStatusRows = this.db
      .prepare('SELECT status, COUNT(*) as count FROM findings GROUP BY status')
      .all() as StatusCountRow[];
    const findingsByStatus: Record<FindingStatus, number> = {
      draft: 0,
      validated: 0,
      rejected: 0,
    };
    for (const row of findingsByStatusRows) {
      findingsByStatus[row.status as FindingStatus] = row.count;
    }

    return {
      total_assets: totalAssets,
      total_endpoints: totalEndpoints,
      total_identities: totalIdentities,
      total_hypotheses: totalHypotheses,
      hypotheses_by_status: hypothesesByStatus,
      total_findings: totalFindings,
      findings_by_severity: findingsBySeverity,
      findings_by_status: findingsByStatus,
      total_observations: totalObservations,
    };
  }

  close(): void {
    this.db.close();
  }
}
