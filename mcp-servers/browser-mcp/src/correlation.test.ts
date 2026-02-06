/**
 * Tests for Correlation Manager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CorrelationManager } from './correlation.js';

describe('CorrelationManager', () => {
  let manager: CorrelationManager;
  const testEngagementId = 'test-engagement-123';

  beforeEach(() => {
    manager = new CorrelationManager(testEngagementId);
  });

  describe('generateIds', () => {
    it('should generate correlation IDs with engagement ID', () => {
      const ids = manager.generateIds();

      expect(ids.engagement_id).toBe(testEngagementId);
      expect(ids.action_id).toBeDefined();
      expect(ids.request_id).toBeDefined();
    });

    it('should include session ID when provided', () => {
      const sessionId = 'session-456';
      const ids = manager.generateIds(sessionId);

      expect(ids.session_id).toBe(sessionId);
    });

    it('should generate unique action IDs', () => {
      const ids1 = manager.generateIds();
      const ids2 = manager.generateIds();

      expect(ids1.action_id).not.toBe(ids2.action_id);
    });

    it('should generate unique request IDs', () => {
      const ids1 = manager.generateIds();
      const ids2 = manager.generateIds();

      expect(ids1.request_id).not.toBe(ids2.request_id);
    });

    it('should increment action counter', () => {
      const ids1 = manager.generateIds();
      const ids2 = manager.generateIds();

      expect(ids1.action_id).toMatch(/action-1-/);
      expect(ids2.action_id).toMatch(/action-2-/);
    });
  });

  describe('getCorrelationHeaders', () => {
    it('should generate all required headers', () => {
      const ids = manager.generateIds();
      const headers = manager.getCorrelationHeaders(ids);

      expect(headers['X-Engagement-ID']).toBe(ids.engagement_id);
      expect(headers['X-Action-ID']).toBe(ids.action_id);
      expect(headers['X-Request-ID']).toBe(ids.request_id);
      expect(headers['X-Browser-MCP']).toBe('true');
    });

    it('should include session ID header when provided', () => {
      const ids = manager.generateIds('session-789');
      const headers = manager.getCorrelationHeaders(ids);

      expect(headers['X-Session-ID']).toBe('session-789');
    });

    it('should not include session ID header when not provided', () => {
      const ids = manager.generateIds();
      const headers = manager.getCorrelationHeaders(ids);

      expect(headers['X-Session-ID']).toBeUndefined();
    });
  });

  describe('getEngagementId', () => {
    it('should return the engagement ID', () => {
      expect(manager.getEngagementId()).toBe(testEngagementId);
    });
  });

  describe('reset', () => {
    it('should reset action counter', () => {
      manager.generateIds();
      manager.generateIds();
      manager.reset();

      const ids = manager.generateIds();
      expect(ids.action_id).toMatch(/action-1-/);
    });
  });
});
