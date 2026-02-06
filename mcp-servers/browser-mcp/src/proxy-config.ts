/**
 * Burp Proxy Configuration
 * Handles browser launch configuration with proxy settings
 */

import type { BrowserSessionConfig } from './types.js';

export interface ProxySettings {
  server: string;
  bypass?: string;
}

export interface BrowserLaunchOptions {
  headless: boolean;
  proxy?: ProxySettings;
  args?: string[];
}

export interface ContextOptions {
  ignoreHTTPSErrors: boolean;
  viewport: {
    width: number;
    height: number;
  };
  userAgent?: string;
  extraHTTPHeaders?: Record<string, string>;
}

/**
 * Default proxy URL for Burp Suite
 */
export const DEFAULT_PROXY_URL = 'http://127.0.0.1:8080';

/**
 * Default viewport size
 */
export const DEFAULT_VIEWPORT = {
  width: 1280,
  height: 720,
};

/**
 * Default timeout in milliseconds (60 seconds for slow sites)
 */
export const DEFAULT_TIMEOUT = 60000;

/**
 * Generate browser launch options from session config
 */
export function getBrowserLaunchOptions(config: BrowserSessionConfig): BrowserLaunchOptions {
  const options: BrowserLaunchOptions = {
    headless: config.headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  };

  if (config.proxyUrl) {
    options.proxy = {
      server: config.proxyUrl,
    };
    // Don't proxy localhost for local testing
    options.proxy.bypass = 'localhost,127.0.0.1';
  }

  return options;
}

/**
 * Generate browser context options from session config
 */
export function getContextOptions(
  config: BrowserSessionConfig,
  correlationHeaders?: Record<string, string>
): ContextOptions {
  const options: ContextOptions = {
    ignoreHTTPSErrors: config.ignoreHTTPSErrors ?? true,
    viewport: config.viewport ?? DEFAULT_VIEWPORT,
  };

  if (config.userAgent) {
    options.userAgent = config.userAgent;
  }

  if (correlationHeaders) {
    options.extraHTTPHeaders = correlationHeaders;
  }

  return options;
}

/**
 * Parse and validate proxy URL
 */
export function parseProxyUrl(proxyUrl: string): { host: string; port: number } | null {
  try {
    const url = new URL(proxyUrl);
    const port = url.port ? parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 8080;
    return {
      host: url.hostname,
      port,
    };
  } catch {
    return null;
  }
}

/**
 * Check if proxy is configured and validate format
 */
export function validateProxyConfig(proxyUrl?: string): { valid: boolean; error?: string } {
  if (!proxyUrl) {
    return { valid: true }; // No proxy is valid (direct connection)
  }

  const parsed = parseProxyUrl(proxyUrl);
  if (!parsed) {
    return {
      valid: false,
      error: `Invalid proxy URL format: ${proxyUrl}`,
    };
  }

  if (parsed.port < 1 || parsed.port > 65535) {
    return {
      valid: false,
      error: `Invalid proxy port: ${parsed.port}`,
    };
  }

  return { valid: true };
}

/**
 * Get default session configuration
 */
export function getDefaultSessionConfig(
  overrides?: Partial<BrowserSessionConfig>
): BrowserSessionConfig {
  return {
    headless: false,
    proxyUrl: DEFAULT_PROXY_URL,
    viewport: DEFAULT_VIEWPORT,
    timeout: DEFAULT_TIMEOUT,
    ignoreHTTPSErrors: true,
    ...overrides,
  };
}
