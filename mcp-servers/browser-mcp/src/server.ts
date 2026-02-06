/**
 * Browser MCP Server
 * Main MCP server implementation for browser automation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  BrowserMCPConfig,
  BrowserSessionConfig,
  NavigateParams,
  ActParams,
  ExtractParams,
  XSSTestParams,
  ScreenshotParams,
  SessionCreateResult,
  SessionCloseResult,
  NavigateResult,
  ActResult,
  ExtractResult,
  FormDiscoveryResult,
  XSSTestResult,
  ScreenshotResult,
  PageStateResult,
  CorrelationIds,
} from './types.js';
import { CorrelationManager } from './correlation.js';
import { ScopeValidator, createScopeValidator, createDisabledValidator } from './scope-validator.js';
import { SessionManager, type StagehandConfig } from './stagehand-wrapper.js';
import { XSSDetector } from './xss-detector.js';
import { getDefaultSessionConfig } from './proxy-config.js';
import {
  BrowserMCPError,
  NoActiveSessionError,
  SessionNotFoundError,
  FormNotFoundError,
  FieldNotFoundError,
} from './errors.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Browser MCP Server class
 */
export class BrowserMCPServer {
  private readonly server: Server;
  private readonly config: BrowserMCPConfig;
  private readonly correlationManager: CorrelationManager;
  private readonly scopeValidator: ScopeValidator;
  private readonly sessionManager: SessionManager;

  constructor(config: BrowserMCPConfig) {
    this.config = config;
    this.correlationManager = new CorrelationManager(config.engagementId);

    // Create scope validator
    this.scopeValidator = config.enableScopeValidation
      ? createScopeValidator(true, undefined, undefined, false)
      : createDisabledValidator();

    // Create stagehand config if AI keys available
    const stagehandConfig: Partial<StagehandConfig> | undefined =
      config.geminiApiKey || config.openaiApiKey
        ? {
            env: 'LOCAL',
            modelClientOptions: {
              apiKey: config.geminiApiKey || config.openaiApiKey,
            },
          }
        : undefined;

    // Create session manager
    this.sessionManager = new SessionManager(
      this.correlationManager,
      this.scopeValidator,
      config.maxSessions,
      stagehandConfig
    );

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'browser-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'browser_session_create',
          description:
            'Create a new browser session with optional Burp proxy integration. The browser will be visible (headed mode).',
          inputSchema: {
            type: 'object',
            properties: {
              proxy_url: {
                type: 'string',
                description: 'Proxy URL for Burp Suite (default: http://127.0.0.1:8080)',
              },
              headless: {
                type: 'boolean',
                description: 'Run in headless mode (default: false for visibility)',
              },
              viewport_width: {
                type: 'number',
                description: 'Browser viewport width (default: 1280)',
              },
              viewport_height: {
                type: 'number',
                description: 'Browser viewport height (default: 720)',
              },
            },
          },
        },
        {
          name: 'browser_session_close',
          description: 'Close a browser session by ID, or close the active session if no ID provided',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: {
                type: 'string',
                description: 'Session ID to close (optional, closes active session if not provided)',
              },
            },
          },
        },
        {
          name: 'browser_navigate',
          description: 'Navigate to a URL. Validates scope before navigation if scope checking is enabled.',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to navigate to',
              },
              wait_until: {
                type: 'string',
                enum: ['load', 'domcontentloaded', 'networkidle'],
                description: 'When to consider navigation complete (default: domcontentloaded)',
              },
              timeout: {
                type: 'number',
                description: 'Navigation timeout in milliseconds',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'browser_act',
          description:
            'Perform a natural language action in the browser (e.g., "click the login button", "fill the search box with test")',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                description: 'Natural language action to perform',
              },
              timeout: {
                type: 'number',
                description: 'Action timeout in milliseconds',
              },
            },
            required: ['action'],
          },
        },
        {
          name: 'browser_extract',
          description: 'Extract data from the current page using natural language instructions',
          inputSchema: {
            type: 'object',
            properties: {
              instruction: {
                type: 'string',
                description: 'What data to extract (e.g., "get all product prices")',
              },
              schema: {
                type: 'object',
                description: 'Optional JSON schema for structured extraction',
              },
            },
            required: ['instruction'],
          },
        },
        {
          name: 'browser_discover_forms',
          description: 'Discover all forms on the current page with their fields and submit buttons',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'browser_test_xss',
          description: 'Test a form field for XSS vulnerabilities using various payloads',
          inputSchema: {
            type: 'object',
            properties: {
              form_selector: {
                type: 'string',
                description: 'CSS selector for the form (optional, will auto-detect)',
              },
              field_name: {
                type: 'string',
                description: 'Name or ID of the field to test',
              },
              payloads: {
                type: 'array',
                items: { type: 'string' },
                description: 'Custom XSS payloads to test (optional, uses defaults if not provided)',
              },
              submit: {
                type: 'boolean',
                description: 'Whether to submit the form after filling (default: true)',
              },
            },
            required: ['field_name'],
          },
        },
        {
          name: 'browser_screenshot',
          description: 'Capture a screenshot of the current page for evidence',
          inputSchema: {
            type: 'object',
            properties: {
              full_page: {
                type: 'boolean',
                description: 'Capture full page screenshot (default: false)',
              },
              selector: {
                type: 'string',
                description: 'CSS selector to screenshot specific element',
              },
              format: {
                type: 'string',
                enum: ['png', 'jpeg'],
                description: 'Image format (default: png)',
              },
              quality: {
                type: 'number',
                description: 'JPEG quality 0-100 (only for jpeg format)',
              },
            },
          },
        },
        {
          name: 'browser_get_state',
          description: 'Get current browser state including URL, title, cookies, and storage',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'browser_click',
          description: 'Click an element by CSS selector. Use this for precise element interaction.',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector (e.g., "#search-btn", ".submit", "[aria-label=Search]")',
              },
              timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default: 5000)',
              },
            },
            required: ['selector'],
          },
        },
        {
          name: 'browser_fill',
          description: 'Fill an input field by CSS selector with text.',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector for the input (e.g., "#username", "input[name=email]")',
              },
              value: {
                type: 'string',
                description: 'Text to fill in the field',
              },
              clear: {
                type: 'boolean',
                description: 'Clear field before filling (default: true)',
              },
            },
            required: ['selector', 'value'],
          },
        },
        {
          name: 'browser_eval',
          description: 'Execute JavaScript in the browser and return the result. Useful for inspecting DOM.',
          inputSchema: {
            type: 'object',
            properties: {
              script: {
                type: 'string',
                description: 'JavaScript code to execute (e.g., "document.querySelectorAll(\'input\').length")',
              },
            },
            required: ['script'],
          },
        },
        {
          name: 'browser_get_elements',
          description: 'Get information about elements matching a CSS selector.',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector to find elements',
              },
              attributes: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of attributes to extract (default: id, name, class, type, placeholder, aria-label)',
              },
              limit: {
                type: 'number',
                description: 'Maximum elements to return (default: 20)',
              },
            },
            required: ['selector'],
          },
        },
        {
          name: 'browser_press_key',
          description: 'Press a keyboard key. Use for Enter, Tab, Escape, arrows, etc.',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown", "Backspace")',
              },
              selector: {
                type: 'string',
                description: 'Optional: focus this element first before pressing key',
              },
              modifiers: {
                type: 'array',
                items: { type: 'string' },
                description: 'Modifier keys (e.g., ["Control", "Shift"])',
              },
            },
            required: ['key'],
          },
        },
        {
          name: 'browser_wait',
          description: 'Wait for a condition or fixed time.',
          inputSchema: {
            type: 'object',
            properties: {
              milliseconds: {
                type: 'number',
                description: 'Wait for fixed milliseconds',
              },
              selector: {
                type: 'string',
                description: 'Wait for element to appear',
              },
              state: {
                type: 'string',
                enum: ['visible', 'hidden', 'attached', 'detached'],
                description: 'Wait for element state (default: visible)',
              },
            },
          },
        },
        {
          name: 'browser_dismiss_popups',
          description: 'Automatically dismiss common popups, banners, cookie consents, and dialogs. Call this right after navigating to a new page.',
          inputSchema: {
            type: 'object',
            properties: {
              timeout: {
                type: 'number',
                description: 'Timeout per popup attempt in ms (default: 2000)',
              },
            },
          },
        },
        {
          name: 'browser_type',
          description: 'Type text character by character (useful for autocomplete/search). Faster than fill for triggering input events.',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector for the input element',
              },
              text: {
                type: 'string',
                description: 'Text to type',
              },
              delay: {
                type: 'number',
                description: 'Delay between keystrokes in ms (default: 50)',
              },
              clear: {
                type: 'boolean',
                description: 'Clear field first (default: true)',
              },
              pressEnter: {
                type: 'boolean',
                description: 'Press Enter after typing (default: false)',
              },
            },
            required: ['selector', 'text'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'browser_session_create':
            return this.formatResponse(await this.handleSessionCreate(args ?? {}));

          case 'browser_session_close':
            return this.formatResponse(await this.handleSessionClose(args ?? {}));

          case 'browser_navigate':
            return this.formatResponse(await this.handleNavigate(args as unknown as NavigateParams));

          case 'browser_act':
            return this.formatResponse(await this.handleAct(args as unknown as ActParams));

          case 'browser_extract':
            return this.formatResponse(await this.handleExtract(args as unknown as ExtractParams));

          case 'browser_discover_forms':
            return this.formatResponse(await this.handleDiscoverForms());

          case 'browser_test_xss':
            return this.formatResponse(await this.handleTestXSS(args as unknown as XSSTestParams));

          case 'browser_screenshot':
            return this.formatResponse(await this.handleScreenshot((args ?? {}) as unknown as ScreenshotParams));

          case 'browser_get_state':
            return this.formatResponse(await this.handleGetState());

          case 'browser_click':
            return this.formatResponse(await this.handleClick(args as Record<string, unknown>));

          case 'browser_fill':
            return this.formatResponse(await this.handleFill(args as Record<string, unknown>));

          case 'browser_eval':
            return this.formatResponse(await this.handleEval(args as Record<string, unknown>));

          case 'browser_get_elements':
            return this.formatResponse(await this.handleGetElements(args as Record<string, unknown>));

          case 'browser_press_key':
            return this.formatResponse(await this.handlePressKey(args as Record<string, unknown>));

          case 'browser_wait':
            return this.formatResponse(await this.handleWait(args as Record<string, unknown>));

          case 'browser_dismiss_popups':
            return this.formatResponse(await this.handleDismissPopups(args as Record<string, unknown>));

          case 'browser_type':
            return this.formatResponse(await this.handleType(args as Record<string, unknown>));

          default:
            return this.formatError('UNKNOWN_TOOL', `Unknown tool: ${name}`);
        }
      } catch (error) {
        return this.handleError(error);
      }
    });
  }

  /**
   * Handle browser_session_create
   */
  private async handleSessionCreate(args: Record<string, unknown>): Promise<SessionCreateResult> {
    const correlationIds = this.correlationManager.generateIds();

    const config: BrowserSessionConfig = getDefaultSessionConfig({
      headless: args.headless as boolean | undefined ?? false,
      proxyUrl: args.proxy_url as string | undefined ?? this.config.proxyUrl,
      viewport:
        args.viewport_width || args.viewport_height
          ? {
              width: (args.viewport_width as number) || 1280,
              height: (args.viewport_height as number) || 720,
            }
          : undefined,
    });

    const session = await this.sessionManager.createSession(config);

    return {
      success: true,
      correlation_ids: correlationIds,
      session: session.session,
    };
  }

  /**
   * Handle browser_session_close
   */
  private async handleSessionClose(args: Record<string, unknown>): Promise<SessionCloseResult> {
    const correlationIds = this.correlationManager.generateIds();
    const sessionId = args.session_id as string | undefined;

    if (sessionId) {
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new SessionNotFoundError(sessionId);
      }
      await this.sessionManager.closeSession(sessionId);
    } else {
      const activeSession = this.sessionManager.getActiveSession();
      if (!activeSession) {
        throw new NoActiveSessionError();
      }
      await this.sessionManager.closeSession(activeSession.session.session_id);
    }

    return {
      success: true,
      correlation_ids: correlationIds,
      session_id: sessionId || 'active',
    };
  }

  /**
   * Handle browser_navigate
   */
  private async handleNavigate(args: NavigateParams): Promise<NavigateResult> {
    const session = this.sessionManager.getActiveSession();
    if (!session) {
      throw new NoActiveSessionError();
    }

    return session.navigate(
      args.url,
      args.waitUntil as 'load' | 'domcontentloaded' | 'networkidle' | undefined,
      args.timeout
    );
  }

  /**
   * Handle browser_act
   */
  private async handleAct(args: ActParams): Promise<ActResult> {
    const session = this.sessionManager.getActiveSession();
    if (!session) {
      throw new NoActiveSessionError();
    }

    return session.act(args.action, args.timeout);
  }

  /**
   * Handle browser_extract
   */
  private async handleExtract(args: ExtractParams): Promise<ExtractResult> {
    const session = this.sessionManager.getActiveSession();
    if (!session) {
      throw new NoActiveSessionError();
    }

    return session.extract(args.instruction, args.schema);
  }

  /**
   * Handle browser_discover_forms
   */
  private async handleDiscoverForms(): Promise<FormDiscoveryResult> {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const formAnalyzer = session.getFormAnalyzer();
    const forms = await formAnalyzer.discoverForms(page);

    return {
      success: true,
      correlation_ids: correlationIds,
      forms,
      total_count: forms.length,
    };
  }

  /**
   * Handle browser_test_xss
   */
  private async handleTestXSS(args: XSSTestParams): Promise<XSSTestResult> {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const formAnalyzer = session.getFormAnalyzer();
    const xssDetector = session.getXSSDetector();

    // Find the form
    let form;
    if (args.form_selector) {
      form = await formAnalyzer.getForm(page, args.form_selector);
      if (!form) {
        throw new FormNotFoundError(args.form_selector);
      }
    } else {
      form = await formAnalyzer.findFormWithField(page, args.field_name);
      if (!form) {
        throw new FieldNotFoundError(args.field_name);
      }
    }

    // Get field selector
    const fieldSelector = formAnalyzer.getFieldSelector(form, args.field_name);

    // Get payloads
    const payloads = args.payloads || XSSDetector.getDefaultPayloadStrings();

    // Test for XSS
    const vulnerabilities = await xssDetector.testField(
      page,
      args.field_name,
      fieldSelector,
      payloads,
      args.submit !== false ? form.submit_button?.selector : undefined
    );

    return {
      success: true,
      correlation_ids: correlationIds,
      vulnerable: vulnerabilities.length > 0,
      vulnerabilities,
      payloads_tested: payloads.length,
    };
  }

  /**
   * Handle browser_screenshot
   */
  private async handleScreenshot(args: ScreenshotParams): Promise<ScreenshotResult> {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    // Ensure evidence directory exists
    await fs.mkdir(this.config.evidenceDir, { recursive: true });

    // Generate screenshot filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = args.format || 'png';
    const filename = `screenshot-${timestamp}.${extension}`;
    const filepath = path.join(this.config.evidenceDir, filename);

    // Capture screenshot
    const screenshotOptions: {
      path: string;
      fullPage?: boolean;
      type?: 'png' | 'jpeg';
      quality?: number;
    } = {
      path: filepath,
      fullPage: args.full_page,
      type: args.format,
    };

    if (args.format === 'jpeg' && args.quality) {
      screenshotOptions.quality = args.quality;
    }

    let buffer: Buffer;
    if (args.selector) {
      const element = await page.$(args.selector);
      if (!element) {
        throw new BrowserMCPError('ELEMENT_NOT_FOUND', `Element not found: ${args.selector}`);
      }
      buffer = await element.screenshot(screenshotOptions);
    } else {
      buffer = await page.screenshot(screenshotOptions);
    }

    return {
      success: true,
      correlation_ids: correlationIds,
      path: filepath,
      size_bytes: buffer.length,
    };
  }

  /**
   * Handle browser_get_state
   */
  private async handleGetState(): Promise<PageStateResult> {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const context = page.context();

    // Get cookies
    const cookies = await context.cookies();

    // Get storage (if possible)
    let localStorage: Record<string, string> | undefined;
    let sessionStorage: Record<string, string> | undefined;

    try {
      localStorage = await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            items[key] = window.localStorage.getItem(key) || '';
          }
        }
        return items;
      });

      sessionStorage = await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key) {
            items[key] = window.sessionStorage.getItem(key) || '';
          }
        }
        return items;
      });
    } catch {
      // Storage access may fail on some pages
    }

    return {
      success: true,
      correlation_ids: correlationIds,
      state: {
        url: page.url(),
        title: await page.title(),
        cookies: cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
        })),
        localStorage,
        sessionStorage,
      },
    };
  }

  /**
   * Handle browser_click
   */
  private async handleClick(args: Record<string, unknown>) {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const selector = args.selector as string;
    const timeout = (args.timeout as number) || 5000;

    await page.click(selector, { timeout });

    return {
      success: true,
      correlation_ids: correlationIds,
      selector,
      clicked: true,
    };
  }

  /**
   * Handle browser_fill
   */
  private async handleFill(args: Record<string, unknown>) {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const selector = args.selector as string;
    const value = args.value as string;
    const clear = args.clear !== false;

    if (clear) {
      await page.fill(selector, '');
    }
    await page.fill(selector, value);

    return {
      success: true,
      correlation_ids: correlationIds,
      selector,
      value,
    };
  }

  /**
   * Handle browser_eval
   */
  private async handleEval(args: Record<string, unknown>) {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const script = args.script as string;

    // Execute the script and return the result
    const result = await page.evaluate((code: string) => {
      // eslint-disable-next-line no-eval
      return eval(code);
    }, script);

    return {
      success: true,
      correlation_ids: correlationIds,
      result,
    };
  }

  /**
   * Handle browser_get_elements
   */
  private async handleGetElements(args: Record<string, unknown>) {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const selector = args.selector as string;
    const attributes = (args.attributes as string[]) || ['id', 'name', 'class', 'type', 'placeholder', 'aria-label', 'href', 'value'];
    const limit = (args.limit as number) || 20;

    const elements = await page.evaluate(
      ({ sel, attrs, lim }: { sel: string; attrs: string[]; lim: number }) => {
        const els = Array.from(document.querySelectorAll(sel)).slice(0, lim);
        return els.map((el, index) => {
          const result: Record<string, string | number> = {
            index,
            tagName: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().substring(0, 100),
          };

          for (const attr of attrs) {
            const value = el.getAttribute(attr);
            if (value) {
              result[attr] = value;
            }
          }

          // Add computed selector hint
          if (el.id) {
            result.selectorHint = `#${el.id}`;
          } else if (el.className && typeof el.className === 'string') {
            result.selectorHint = `.${el.className.split(' ')[0]}`;
          }

          return result;
        });
      },
      { sel: selector, attrs: attributes, lim: limit }
    );

    return {
      success: true,
      correlation_ids: correlationIds,
      selector,
      count: elements.length,
      elements,
    };
  }

  /**
   * Handle browser_press_key
   */
  private async handlePressKey(args: Record<string, unknown>) {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const key = args.key as string;
    const selector = args.selector as string | undefined;
    const modifiers = (args.modifiers as string[]) || [];

    // Focus element if selector provided
    if (selector) {
      await page.focus(selector);
    }

    // Build key combination
    let keyCombo = key;
    if (modifiers.length > 0) {
      keyCombo = [...modifiers, key].join('+');
    }

    await page.keyboard.press(keyCombo);

    return {
      success: true,
      correlation_ids: correlationIds,
      key: keyCombo,
      selector,
    };
  }

  /**
   * Handle browser_wait
   */
  private async handleWait(args: Record<string, unknown>) {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const milliseconds = args.milliseconds as number | undefined;
    const selector = args.selector as string | undefined;
    const state = (args.state as 'visible' | 'hidden' | 'attached' | 'detached') || 'visible';

    if (milliseconds) {
      await page.waitForTimeout(milliseconds);
      return {
        success: true,
        correlation_ids: correlationIds,
        waited_ms: milliseconds,
      };
    }

    if (selector) {
      await page.waitForSelector(selector, { state });
      return {
        success: true,
        correlation_ids: correlationIds,
        selector,
        state,
      };
    }

    return {
      success: true,
      correlation_ids: correlationIds,
      message: 'No wait condition specified',
    };
  }

  /**
   * Handle browser_dismiss_popups - automatically close common popups
   */
  private async handleDismissPopups(args: Record<string, unknown>) {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const timeout = (args.timeout as number) || 2000;
    const dismissed: string[] = [];

    // Common popup/dialog/banner selectors to try
    const popupSelectors = [
      // Juice Shop specific
      'button.close-dialog',
      '[aria-label="Close Welcome Banner"]',
      'a.cc-dismiss',
      'a:has-text("Me want it")',

      // Generic close buttons
      '[aria-label*="close" i]',
      '[aria-label*="dismiss" i]',
      'button:has-text("Dismiss")',
      'button:has-text("Close")',
      'button:has-text("Accept")',
      'button:has-text("Got it")',
      'button:has-text("OK")',
      'button:has-text("I agree")',
      'button:has-text("Accept all")',

      // Cookie consent common patterns
      '.cc-dismiss',
      '.cookie-accept',
      '#cookie-accept',
      '[data-testid="cookie-accept"]',
      '.gdpr-accept',

      // Modal close buttons
      '.modal-close',
      '.dialog-close',
      '.popup-close',
      'button.close',
      '.close-button',
      '[data-dismiss="modal"]',

      // Material/Angular
      'mat-dialog-container button:has-text("Close")',
      'mat-dialog-container button:has-text("OK")',
      '.cdk-overlay-container button.close-dialog',

      // Generic X buttons
      'button[aria-label="Close"]',
      '.close-icon',
      'svg.close',
    ];

    for (const selector of popupSelectors) {
      try {
        const element = await page.$(selector);
        if (element && await element.isVisible()) {
          await element.click({ timeout });
          dismissed.push(selector);
          // Wait briefly for animations
          await page.waitForTimeout(300);
        }
      } catch {
        // Ignore - element not found or not clickable
      }
    }

    // Also try pressing Escape
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    } catch {
      // Ignore
    }

    return {
      success: true,
      correlation_ids: correlationIds,
      dismissed_count: dismissed.length,
      dismissed_selectors: dismissed,
    };
  }

  /**
   * Handle browser_type - type text character by character
   */
  private async handleType(args: Record<string, unknown>) {
    const correlationIds = this.correlationManager.generateIds();
    const session = this.sessionManager.getActiveSession();

    if (!session) {
      throw new NoActiveSessionError();
    }

    const page = session.getPage();
    if (!page) {
      throw new NoActiveSessionError();
    }

    const selector = args.selector as string;
    const text = args.text as string;
    const delay = (args.delay as number) || 50;
    const clear = args.clear !== false;
    const pressEnter = args.pressEnter === true;

    // Click to focus
    await page.click(selector);

    // Clear if requested
    if (clear) {
      await page.fill(selector, '');
    }

    // Type character by character
    await page.type(selector, text, { delay });

    // Press Enter if requested
    if (pressEnter) {
      await page.keyboard.press('Enter');
    }

    return {
      success: true,
      correlation_ids: correlationIds,
      selector,
      typed: text,
      pressedEnter: pressEnter,
    };
  }

  /**
   * Format successful response
   */
  private formatResponse(data: unknown) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  /**
   * Format error response
   */
  private formatError(code: string, message: string, details?: unknown) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: code, message, details }, null, 2),
        },
      ],
      isError: true,
    };
  }

  /**
   * Handle errors
   */
  private handleError(error: unknown) {
    console.error('[browser-mcp] Error:', error);

    if (error instanceof BrowserMCPError) {
      return this.formatError(error.code, error.message);
    }

    if (error instanceof Error) {
      return this.formatError('INTERNAL_ERROR', error.message);
    }

    return this.formatError('UNKNOWN_ERROR', 'An unknown error occurred');
  }

  /**
   * Connect to transport
   */
  async connect(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[browser-mcp] Server ready');
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    await this.sessionManager.closeAllSessions();
  }
}
