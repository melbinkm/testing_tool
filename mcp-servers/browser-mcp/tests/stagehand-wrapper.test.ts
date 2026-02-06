/**
 * Tests for Stagehand Wrapper
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionManager, BrowserSessionWrapper } from '../src/stagehand-wrapper.js';
import { CorrelationManager } from '../src/correlation.js';
import { createDisabledValidator } from '../src/scope-validator.js';
import { SessionLimitError, NoActiveSessionError } from '../src/errors.js';

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        route: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn().mockResolvedValue({
          on: vi.fn(),
          goto: vi.fn().mockResolvedValue({ status: vi.fn().mockReturnValue(200) }),
          url: vi.fn().mockReturnValue('https://example.com'),
          title: vi.fn().mockResolvedValue('Example Page'),
          evaluate: vi.fn().mockResolvedValue([]),
          fill: vi.fn().mockResolvedValue(undefined),
          click: vi.fn().mockResolvedValue(undefined),
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          goBack: vi.fn().mockResolvedValue(undefined),
          textContent: vi.fn().mockResolvedValue('Page text content'),
          content: vi.fn().mockResolvedValue('<html><body>Page content</body></html>'),
          context: vi.fn().mockReturnValue({
            cookies: vi.fn().mockResolvedValue([]),
          }),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock Stagehand
vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    page: {
      act: vi.fn().mockResolvedValue(undefined),
      extract: vi.fn().mockResolvedValue({ data: 'extracted' }),
    },
  })),
}));

// Mock Gemini client
vi.mock('../src/gemini-client.js', () => ({
  getGeminiClient: vi.fn().mockResolvedValue({
    analyzePageForAction: vi.fn().mockResolvedValue({
      selector: 'button',
      actionType: 'click',
    }),
    extractFromPage: vi.fn().mockResolvedValue({ data: 'extracted' }),
  }),
  hasGeminiClient: vi.fn().mockReturnValue(true),
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let correlationManager: CorrelationManager;
  let scopeValidator: ReturnType<typeof createDisabledValidator>;

  beforeEach(() => {
    correlationManager = new CorrelationManager('test-engagement');
    scopeValidator = createDisabledValidator();
    sessionManager = new SessionManager(correlationManager, scopeValidator, 3);
  });

  afterEach(async () => {
    await sessionManager.closeAllSessions();
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await sessionManager.createSession({
        headless: true,
      });

      expect(session).toBeDefined();
      expect(session.session.session_id).toMatch(/^session-/);
      expect(session.session.status).toBe('active');
    });

    it('should set created session as active', async () => {
      const session = await sessionManager.createSession({ headless: true });

      expect(sessionManager.getActiveSession()).toBe(session);
    });

    it('should track session count', async () => {
      expect(sessionManager.getSessionCount()).toBe(0);

      await sessionManager.createSession({ headless: true });
      expect(sessionManager.getSessionCount()).toBe(1);

      await sessionManager.createSession({ headless: true });
      expect(sessionManager.getSessionCount()).toBe(2);
    });

    it('should throw when session limit reached', async () => {
      await sessionManager.createSession({ headless: true });
      await sessionManager.createSession({ headless: true });
      await sessionManager.createSession({ headless: true });

      await expect(sessionManager.createSession({ headless: true })).rejects.toThrow(
        SessionLimitError
      );
    });
  });

  describe('getSession', () => {
    it('should return session by ID', async () => {
      const session = await sessionManager.createSession({ headless: true });
      const sessionId = session.session.session_id;

      const retrieved = sessionManager.getSession(sessionId);
      expect(retrieved).toBe(session);
    });

    it('should return undefined for unknown ID', () => {
      const retrieved = sessionManager.getSession('unknown-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('setActiveSession', () => {
    it('should change active session', async () => {
      const session1 = await sessionManager.createSession({ headless: true });
      const session2 = await sessionManager.createSession({ headless: true });

      expect(sessionManager.getActiveSession()).toBe(session2);

      sessionManager.setActiveSession(session1.session.session_id);
      expect(sessionManager.getActiveSession()).toBe(session1);
    });

    it('should throw for unknown session ID', () => {
      expect(() => sessionManager.setActiveSession('unknown')).toThrow(NoActiveSessionError);
    });
  });

  describe('closeSession', () => {
    it('should close and remove session', async () => {
      const session = await sessionManager.createSession({ headless: true });
      const sessionId = session.session.session_id;

      await sessionManager.closeSession(sessionId);

      expect(sessionManager.getSession(sessionId)).toBeUndefined();
      expect(sessionManager.getSessionCount()).toBe(0);
    });

    it('should clear active session if closed', async () => {
      const session = await sessionManager.createSession({ headless: true });

      await sessionManager.closeSession(session.session.session_id);

      expect(sessionManager.getActiveSession()).toBeNull();
    });
  });

  describe('closeAllSessions', () => {
    it('should close all sessions', async () => {
      await sessionManager.createSession({ headless: true });
      await sessionManager.createSession({ headless: true });

      expect(sessionManager.getSessionCount()).toBe(2);

      await sessionManager.closeAllSessions();

      expect(sessionManager.getSessionCount()).toBe(0);
      expect(sessionManager.getActiveSession()).toBeNull();
    });
  });

  describe('getSessionIds', () => {
    it('should return all session IDs', async () => {
      const session1 = await sessionManager.createSession({ headless: true });
      const session2 = await sessionManager.createSession({ headless: true });

      const ids = sessionManager.getSessionIds();

      expect(ids).toContain(session1.session.session_id);
      expect(ids).toContain(session2.session.session_id);
    });
  });
});

describe('BrowserSessionWrapper', () => {
  let session: BrowserSessionWrapper;
  let correlationManager: CorrelationManager;
  let scopeValidator: ReturnType<typeof createDisabledValidator>;

  beforeEach(async () => {
    correlationManager = new CorrelationManager('test-engagement');
    scopeValidator = createDisabledValidator();
    session = new BrowserSessionWrapper(
      'test-session-id',
      { headless: true },
      correlationManager,
      scopeValidator
    );
    await session.initialize();
  });

  afterEach(async () => {
    if (session.isActive()) {
      await session.close();
    }
  });

  describe('session state', () => {
    it('should have correct initial state', () => {
      expect(session.session.session_id).toBe('test-session-id');
      expect(session.session.status).toBe('active');
      expect(session.session.created_at).toBeDefined();
    });

    it('should report as active after initialization', () => {
      expect(session.isActive()).toBe(true);
    });
  });

  describe('navigate', () => {
    it('should navigate to URL', async () => {
      const result = await session.navigate('https://example.com');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com');
      expect(result.correlation_ids).toBeDefined();
    });

    it('should include timing information', async () => {
      const result = await session.navigate('https://example.com');

      expect(result.timing).toBeDefined();
      expect(result.timing?.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('act', () => {
    it('should perform actions', async () => {
      const result = await session.act('click button');

      expect(result.success).toBe(true);
      expect(result.action).toBe('click button');
    });
  });

  describe('extract', () => {
    it('should extract data from page', async () => {
      const result = await session.extract('get the title');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('getPage', () => {
    it('should return page instance', () => {
      const page = session.getPage();
      expect(page).not.toBeNull();
    });
  });

  describe('getXSSDetector', () => {
    it('should return XSS detector instance', () => {
      const detector = session.getXSSDetector();
      expect(detector).toBeDefined();
    });
  });

  describe('getFormAnalyzer', () => {
    it('should return form analyzer instance', () => {
      const analyzer = session.getFormAnalyzer();
      expect(analyzer).toBeDefined();
    });
  });

  describe('close', () => {
    it('should close session and update status', async () => {
      await session.close();

      expect(session.session.status).toBe('closed');
      expect(session.isActive()).toBe(false);
      expect(session.getPage()).toBeNull();
    });
  });
});
