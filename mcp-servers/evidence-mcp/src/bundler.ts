/**
 * EvidenceBundler class for managing evidence bundles
 */

import type { EvidenceBundle, Artifact, ArtifactInput } from './types.js';
import { randomUUID } from 'crypto';

/**
 * EvidenceBundler manages the creation and manipulation of evidence bundles
 */
export class EvidenceBundler {
  private bundles: Map<string, EvidenceBundle>;

  constructor() {
    this.bundles = new Map();
  }

  /**
   * Generate a unique bundle ID
   */
  private generateBundleId(): string {
    return `EB-${randomUUID().substring(0, 8).toUpperCase()}`;
  }

  /**
   * Generate a unique artifact ID
   */
  private generateArtifactId(): string {
    return `ART-${randomUUID().substring(0, 8).toUpperCase()}`;
  }

  /**
   * Create a new evidence bundle
   */
  createBundle(finding_id: string, metadata?: Record<string, unknown>): EvidenceBundle {
    if (!finding_id || typeof finding_id !== 'string') {
      throw new Error('finding_id is required and must be a string');
    }

    const bundle: EvidenceBundle = {
      bundle_id: this.generateBundleId(),
      finding_id,
      created_at: new Date().toISOString(),
      artifacts: [],
      metadata: metadata ?? {},
    };

    this.bundles.set(bundle.bundle_id, bundle);
    return bundle;
  }

  /**
   * Get a bundle by ID
   */
  getBundle(bundle_id: string): EvidenceBundle | undefined {
    return this.bundles.get(bundle_id);
  }

  /**
   * List all bundles
   */
  listBundles(): EvidenceBundle[] {
    return Array.from(this.bundles.values());
  }

  /**
   * List bundles for a specific finding
   */
  listBundlesByFinding(finding_id: string): EvidenceBundle[] {
    return Array.from(this.bundles.values()).filter(
      (bundle) => bundle.finding_id === finding_id
    );
  }

  /**
   * Add an artifact to a bundle
   */
  addArtifact(bundle_id: string, artifactInput: ArtifactInput): Artifact {
    const bundle = this.bundles.get(bundle_id);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundle_id}`);
    }

    // Validate artifact input
    if (!artifactInput.type) {
      throw new Error('Artifact type is required');
    }
    if (!artifactInput.name) {
      throw new Error('Artifact name is required');
    }
    if (artifactInput.content === undefined || artifactInput.content === null) {
      throw new Error('Artifact content is required');
    }

    const validTypes = ['request', 'response', 'screenshot', 'log', 'config', 'other'];
    if (!validTypes.includes(artifactInput.type)) {
      throw new Error(`Invalid artifact type: ${artifactInput.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    const artifact: Artifact = {
      artifact_id: this.generateArtifactId(),
      type: artifactInput.type,
      name: artifactInput.name,
      content: String(artifactInput.content),
      content_type: artifactInput.content_type || 'text/plain',
      timestamp: new Date().toISOString(),
      redacted: false,
    };

    bundle.artifacts.push(artifact);
    return artifact;
  }

  /**
   * Remove an artifact from a bundle
   */
  removeArtifact(bundle_id: string, artifact_id: string): boolean {
    const bundle = this.bundles.get(bundle_id);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundle_id}`);
    }

    const initialLength = bundle.artifacts.length;
    bundle.artifacts = bundle.artifacts.filter((a) => a.artifact_id !== artifact_id);

    return bundle.artifacts.length < initialLength;
  }

  /**
   * Get a specific artifact from a bundle
   */
  getArtifact(bundle_id: string, artifact_id: string): Artifact | undefined {
    const bundle = this.bundles.get(bundle_id);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundle_id}`);
    }

    return bundle.artifacts.find((a) => a.artifact_id === artifact_id);
  }

  /**
   * Update bundle metadata
   */
  updateMetadata(bundle_id: string, metadata: Record<string, unknown>): EvidenceBundle {
    const bundle = this.bundles.get(bundle_id);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundle_id}`);
    }

    bundle.metadata = {
      ...bundle.metadata,
      ...metadata,
    };

    return bundle;
  }

  /**
   * Delete a bundle
   */
  deleteBundle(bundle_id: string): boolean {
    return this.bundles.delete(bundle_id);
  }

  /**
   * Clear all bundles (for testing)
   */
  clear(): void {
    this.bundles.clear();
  }

  /**
   * Get bundle count
   */
  getBundleCount(): number {
    return this.bundles.size;
  }
}

// Export singleton instance for server use
let bundlerInstance: EvidenceBundler | null = null;

export function getBundler(): EvidenceBundler {
  if (!bundlerInstance) {
    bundlerInstance = new EvidenceBundler();
  }
  return bundlerInstance;
}

export function resetBundler(): void {
  bundlerInstance = null;
}
