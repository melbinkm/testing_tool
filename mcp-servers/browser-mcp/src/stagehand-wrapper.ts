/**
 * Stagehand Wrapper
 * Wraps Stagehand for natural language browser automation
 * with pentest-specific features
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import type {
  BrowserSession,
  BrowserSessionConfig,
  NavigateResult,
  ActResult,
  ExtractResult,
  CorrelationIds,
} from './types.js';
import { CorrelationManager } from './correlation.js';
import { ScopeValidator } from './scope-validator.js';
import { XSSDetector } from './xss-detector.js';
import { FormAnalyzer } from './form-analyzer.js';
import {
  getBrowserLaunchOptions,
  getContextOptions,
  DEFAULT_TIMEOUT,
} from './proxy-config.js';
import {
  NoActiveSessionError,
  NavigationError,
  ActionError,
  ExtractionError,
  SessionLimitError,
} from './errors.js';
import { getGeminiClient, hasGeminiClient, type GeminiADCClient } from './gemini-client.js';
import crypto from 'crypto';

export interface StagehandConfig {
  env: 'LOCAL' | 'BROWSERBASE';
  apiKey?: string;
  projectId?: string;
  enableCaching?: boolean;
  verbose?: number;
  debugDom?: boolean;
  modelName?: string;
  modelClientOptions?: {
    apiKey?: string;
  };
  useGeminiADC?: boolean; // Use Google ADC (same auth as main app)
}

/**
 * Browser session wrapper
 */
export class BrowserSessionWrapper {
  readonly session: BrowserSession;
  private geminiClient: GeminiADCClient | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly correlationManager: CorrelationManager;
  private readonly scopeValidator: ScopeValidator;
  private readonly xssDetector: XSSDetector;
  private readonly formAnalyzer: FormAnalyzer;
  private readonly config: BrowserSessionConfig;

  constructor(
    sessionId: string,
    config: BrowserSessionConfig,
    correlationManager: CorrelationManager,
    scopeValidator: ScopeValidator
  ) {
    this.session = {
      session_id: sessionId,
      created_at: new Date().toISOString(),
      config,
      status: 'active',
    };
    this.config = config;
    this.correlationManager = correlationManager;
    this.scopeValidator = scopeValidator;
    this.xssDetector = new XSSDetector();
    this.formAnalyzer = new FormAnalyzer();
  }

  /**
   * Initialize browser and Gemini client
   */
  async initialize(stagehandConfig?: Partial<StagehandConfig>): Promise<void> {
    try {
      // Launch browser with proxy settings
      const launchOptions = getBrowserLaunchOptions(this.config);

      this.browser = await chromium.launch(launchOptions);

      // Create context with correlation headers
      const correlationIds = this.correlationManager.generateIds(this.session.session_id);
      const correlationHeaders = this.correlationManager.getCorrelationHeaders(correlationIds);
      const contextOptions = getContextOptions(this.config, correlationHeaders);

      this.context = await this.browser.newContext({
        ...contextOptions,
        extraHTTPHeaders: correlationHeaders,
      });

      // Set up request interception for correlation headers
      await this.setupRequestInterception(correlationIds);

      // Create page
      this.page = await this.context.newPage();

      // Set up XSS detection listeners
      await this.xssDetector.setupListeners(this.page);

      // Initialize Gemini client for AI features (uses ADC - same auth as main app)
      try {
        this.geminiClient = await getGeminiClient();
        console.error('[browser-session] Gemini AI features enabled');
      } catch (error) {
        console.error('[browser-session] Gemini AI not available, using basic actions only:', error);
        this.geminiClient = null;
      }
    } catch (error) {
      this.session.status = 'error';
      throw error;
    }
  }

  /**
   * Set up request interception to inject correlation headers
   */
  private async setupRequestInterception(baseIds: CorrelationIds): Promise<void> {
    if (!this.context) return;

    await this.context.route('**/*', async route => {
      const headers = {
        ...route.request().headers(),
        'X-Engagement-ID': baseIds.engagement_id,
        'X-Session-ID': this.session.session_id,
        'X-Request-ID': crypto.randomUUID(),
        'X-Browser-MCP': 'true',
      };
      await route.continue({ headers });
    });
  }

  /**
   * Navigate to a URL
   */
  async navigate(
    url: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded',
    timeout?: number
  ): Promise<NavigateResult> {
    const correlationIds = this.correlationManager.generateIds(this.session.session_id);

    // Validate scope before navigation
    await this.scopeValidator.validateOrThrow(url);

    if (!this.page) {
      throw new NoActiveSessionError();
    }

    const startTime = Date.now();

    try {
      const response = await this.page.goto(url, {
        waitUntil,
        timeout: timeout || this.config.timeout || DEFAULT_TIMEOUT,
      });

      const endTime = Date.now();

      this.session.current_url = this.page.url();

      return {
        success: true,
        correlation_ids: correlationIds,
        url,
        final_url: this.page.url(),
        status_code: response?.status(),
        title: await this.page.title(),
        timing: {
          navigation_start: startTime,
          dom_content_loaded: startTime + (endTime - startTime) / 2,
          load_complete: endTime,
          duration_ms: endTime - startTime,
        },
      };
    } catch (error) {
      throw new NavigationError(
        url,
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Perform a natural language action using Gemini AI
   */
  async act(action: string, timeout?: number): Promise<ActResult> {
    const correlationIds = this.correlationManager.generateIds(this.session.session_id);

    if (!this.page) {
      throw new NoActiveSessionError();
    }

    try {
      if (this.geminiClient) {
        // Use Gemini AI to analyze page and determine action
        const visibleElements = await this.getVisibleElements();
        const pageContent = await this.page.textContent('body') || '';

        const analysis = await this.geminiClient.analyzePageForAction(
          action,
          pageContent,
          visibleElements
        );

        // Execute the determined action
        if (analysis.actionType === 'click') {
          await this.page.click(analysis.selector, { timeout: timeout || 5000 });
        } else if (analysis.actionType === 'fill' && analysis.value) {
          await this.page.fill(analysis.selector, analysis.value);
        } else if (analysis.actionType === 'select' && analysis.value) {
          await this.page.selectOption(analysis.selector, analysis.value);
        }

        return {
          success: true,
          correlation_ids: correlationIds,
          action,
          elements_interacted: [analysis.selector],
        };
      } else {
        // Fallback: try to interpret basic actions without AI
        await this.performBasicAction(action, timeout);
      }

      return {
        success: true,
        correlation_ids: correlationIds,
        action,
      };
    } catch (error) {
      throw new ActionError(
        action,
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get visible interactive elements for AI analysis
   */
  private async getVisibleElements(): Promise<string> {
    if (!this.page) return '';

    return this.page.evaluate(() => {
      const selectors = 'button, a, input, select, textarea, [role="button"], [onclick], [aria-label]';
      const elements = Array.from(document.querySelectorAll(selectors)).slice(0, 50);

      return elements.map((el, i) => {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const classes = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
        const text = (el.textContent || '').trim().substring(0, 50);
        const ariaLabel = el.getAttribute('aria-label') || '';
        const type = el.getAttribute('type') || '';
        const name = el.getAttribute('name') || '';
        const placeholder = el.getAttribute('placeholder') || '';

        return `[${i}] <${tag}${id}${classes}> type="${type}" name="${name}" aria-label="${ariaLabel}" placeholder="${placeholder}" text="${text}"`;
      }).join('\n');
    });
  }

  /**
   * Perform basic actions without AI (fallback)
   */
  private async performBasicAction(action: string, timeout?: number): Promise<void> {
    if (!this.page) throw new NoActiveSessionError();

    const lowerAction = action.toLowerCase();

    // Click actions
    if (lowerAction.includes('click')) {
      const match = action.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"']+)["']?/i);
      if (match) {
        const target = match[1].trim();
        // Try common selectors
        const selectors = [
          `text="${target}"`,
          `button:has-text("${target}")`,
          `a:has-text("${target}")`,
          `[aria-label="${target}"]`,
          `#${target.replace(/\s+/g, '-').toLowerCase()}`,
        ];

        for (const selector of selectors) {
          try {
            await this.page.click(selector, { timeout: timeout || 5000 });
            return;
          } catch {
            continue;
          }
        }
        throw new Error(`Could not find element to click: ${target}`);
      }
    }

    // Type actions
    if (lowerAction.includes('type') || lowerAction.includes('fill') || lowerAction.includes('enter')) {
      const match = action.match(/(?:type|fill|enter)\s+["']([^"']+)["']\s+(?:in|into)\s+["']?([^"']+)["']?/i);
      if (match) {
        const [, text, field] = match;
        const selectors = [
          `[name="${field}"]`,
          `[placeholder*="${field}" i]`,
          `#${field.replace(/\s+/g, '-').toLowerCase()}`,
          `input[type="text"]:near(:text("${field}"))`,
        ];

        for (const selector of selectors) {
          try {
            await this.page.fill(selector, text, { timeout: timeout || 5000 });
            return;
          } catch {
            continue;
          }
        }
        throw new Error(`Could not find field: ${field}`);
      }
    }

    // Navigate actions
    if (lowerAction.includes('go to') || lowerAction.includes('navigate')) {
      const match = action.match(/(?:go to|navigate to?)\s+["']?([^"']+)["']?/i);
      if (match) {
        const url = match[1].trim();
        await this.navigate(url.startsWith('http') ? url : `https://${url}`);
        return;
      }
    }

    throw new Error(
      `Could not interpret action: "${action}". Gemini AI not available for natural language support.`
    );
  }

  /**
   * Extract data from the page using Gemini AI
   */
  async extract(instruction: string, schema?: Record<string, unknown>): Promise<ExtractResult> {
    const correlationIds = this.correlationManager.generateIds(this.session.session_id);

    if (!this.page) {
      throw new NoActiveSessionError();
    }

    try {
      let data: unknown;

      if (this.geminiClient) {
        // Use Gemini AI for extraction
        const pageContent = await this.page.content();
        data = await this.geminiClient.extractFromPage(instruction, pageContent);
      } else {
        // Fallback: basic extraction
        data = await this.performBasicExtraction(instruction);
      }

      return {
        success: true,
        correlation_ids: correlationIds,
        data,
      };
    } catch (error) {
      throw new ExtractionError(
        instruction,
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Basic extraction without AI (fallback)
   */
  private async performBasicExtraction(instruction: string): Promise<unknown> {
    if (!this.page) throw new NoActiveSessionError();

    const lowerInstruction = instruction.toLowerCase();

    // Extract text content
    if (lowerInstruction.includes('text') || lowerInstruction.includes('content')) {
      return {
        text: await this.page.textContent('body'),
        title: await this.page.title(),
        url: this.page.url(),
      };
    }

    // Extract links
    if (lowerInstruction.includes('links')) {
      return this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => ({
          text: a.textContent?.trim(),
          href: a.href,
        }));
      });
    }

    // Extract images
    if (lowerInstruction.includes('images')) {
      return this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          alt: img.alt,
        }));
      });
    }

    // Default: return page info
    return {
      title: await this.page.title(),
      url: this.page.url(),
    };
  }

  /**
   * Get the Playwright page instance
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Get the XSS detector
   */
  getXSSDetector(): XSSDetector {
    return this.xssDetector;
  }

  /**
   * Get the form analyzer
   */
  getFormAnalyzer(): FormAnalyzer {
    return this.formAnalyzer;
  }

  /**
   * Close the browser session
   */
  async close(): Promise<void> {
    this.geminiClient = null;

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.page = null;
    this.session.status = 'closed';
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.session.status === 'active' && this.page !== null;
  }
}

/**
 * Session Manager for handling multiple browser sessions
 */
export class SessionManager {
  private readonly sessions: Map<string, BrowserSessionWrapper> = new Map();
  private readonly maxSessions: number;
  private activeSession: BrowserSessionWrapper | null = null;
  private readonly correlationManager: CorrelationManager;
  private readonly scopeValidator: ScopeValidator;
  private readonly stagehandConfig?: Partial<StagehandConfig>;

  constructor(
    correlationManager: CorrelationManager,
    scopeValidator: ScopeValidator,
    maxSessions: number = 5,
    stagehandConfig?: Partial<StagehandConfig>
  ) {
    this.correlationManager = correlationManager;
    this.scopeValidator = scopeValidator;
    this.maxSessions = maxSessions;
    this.stagehandConfig = stagehandConfig;
  }

  /**
   * Create a new browser session
   */
  async createSession(config: BrowserSessionConfig): Promise<BrowserSessionWrapper> {
    if (this.sessions.size >= this.maxSessions) {
      throw new SessionLimitError(this.maxSessions, this.sessions.size);
    }

    const sessionId = `session-${crypto.randomUUID()}`;
    const session = new BrowserSessionWrapper(
      sessionId,
      config,
      this.correlationManager,
      this.scopeValidator
    );

    await session.initialize(this.stagehandConfig);

    this.sessions.set(sessionId, session);
    this.activeSession = session;

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): BrowserSessionWrapper | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get the active session
   */
  getActiveSession(): BrowserSessionWrapper | null {
    return this.activeSession;
  }

  /**
   * Set the active session
   */
  setActiveSession(sessionId: string): BrowserSessionWrapper {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NoActiveSessionError();
    }
    this.activeSession = session;
    return session;
  }

  /**
   * Close a specific session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      this.sessions.delete(sessionId);

      if (this.activeSession?.session.session_id === sessionId) {
        this.activeSession = null;
      }
    }
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.close();
    }
    this.sessions.clear();
    this.activeSession = null;
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}
