/**
 * Correlation ID Management
 * Provides tracking headers for Burp proxy and evidence correlation
 */

import crypto from 'crypto';
import type { CorrelationIds } from './types.js';

export class CorrelationManager {
  private readonly engagementId: string;
  private actionCounter: number = 0;

  constructor(engagementId: string) {
    this.engagementId = engagementId;
  }

  /**
   * Generate a new set of correlation IDs for an action
   */
  generateIds(sessionId?: string): CorrelationIds {
    this.actionCounter++;
    return {
      engagement_id: this.engagementId,
      action_id: `action-${this.actionCounter}-${Date.now()}`,
      request_id: crypto.randomUUID(),
      session_id: sessionId,
    };
  }

  /**
   * Get HTTP headers for correlation tracking
   * These are injected into all browser requests for Burp visibility
   */
  getCorrelationHeaders(ids: CorrelationIds): Record<string, string> {
    return {
      'X-Engagement-ID': ids.engagement_id,
      'X-Action-ID': ids.action_id,
      'X-Request-ID': ids.request_id,
      'X-Browser-MCP': 'true',
      ...(ids.session_id && { 'X-Session-ID': ids.session_id }),
    };
  }

  /**
   * Get the current engagement ID
   */
  getEngagementId(): string {
    return this.engagementId;
  }

  /**
   * Reset action counter (useful for testing)
   */
  reset(): void {
    this.actionCounter = 0;
  }
}
