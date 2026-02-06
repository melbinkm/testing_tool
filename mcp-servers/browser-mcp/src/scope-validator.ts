/**
 * Scope Validator
 * Validates URLs against scope before navigation
 * Integrates with scope-guard-mcp when available
 */

import type { ScopeValidationResult } from './types.js';
import { ScopeValidationError } from './errors.js';

export interface ScopeConfig {
  enabled: boolean;
  allowedDomains?: string[];
  deniedDomains?: string[];
  allowedPorts?: number[];
  allowPrivateIPs?: boolean;
}

/**
 * Private IP ranges (RFC 1918 and others)
 */
const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
];

/**
 * Dangerous ports that should be blocked by default
 */
const DANGEROUS_PORTS = [22, 23, 25, 135, 139, 445, 3389];

export class ScopeValidator {
  private readonly config: ScopeConfig;

  constructor(config: ScopeConfig) {
    this.config = config;
  }

  /**
   * Validate a URL before navigation
   */
  async validate(url: string): Promise<ScopeValidationResult> {
    if (!this.config.enabled) {
      return { valid: true, target: url };
    }

    try {
      const parsed = new URL(url);

      // Check protocol
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return {
          valid: false,
          target: url,
          reason: `Invalid protocol: ${parsed.protocol}. Only http and https are allowed.`,
        };
      }

      // Check for private IPs
      if (!this.config.allowPrivateIPs && this.isPrivateIP(parsed.hostname)) {
        return {
          valid: false,
          target: url,
          reason: `Private IP addresses are not allowed: ${parsed.hostname}`,
        };
      }

      // Check port
      const port = this.getPort(parsed);
      if (DANGEROUS_PORTS.includes(port)) {
        return {
          valid: false,
          target: url,
          reason: `Dangerous port blocked: ${port}`,
        };
      }

      if (this.config.allowedPorts && this.config.allowedPorts.length > 0) {
        if (!this.config.allowedPorts.includes(port)) {
          return {
            valid: false,
            target: url,
            reason: `Port ${port} is not in allowed list`,
          };
        }
      }

      // Check denied domains first (deny takes precedence)
      if (this.config.deniedDomains) {
        for (const pattern of this.config.deniedDomains) {
          if (this.matchesDomainPattern(parsed.hostname, pattern)) {
            return {
              valid: false,
              target: url,
              reason: `Domain "${parsed.hostname}" is explicitly denied`,
            };
          }
        }
      }

      // Check allowed domains
      if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
        let allowed = false;
        for (const pattern of this.config.allowedDomains) {
          if (this.matchesDomainPattern(parsed.hostname, pattern)) {
            allowed = true;
            break;
          }
        }
        if (!allowed) {
          return {
            valid: false,
            target: url,
            reason: `Domain "${parsed.hostname}" is not in allowed list`,
          };
        }
      }

      return { valid: true, target: url };
    } catch (error) {
      return {
        valid: false,
        target: url,
        reason: `Invalid URL format: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }

  /**
   * Validate and throw if invalid
   */
  async validateOrThrow(url: string): Promise<void> {
    const result = await this.validate(url);
    if (!result.valid) {
      throw new ScopeValidationError(result.target, result.reason || 'Unknown validation error');
    }
  }

  /**
   * Check if hostname is a private IP
   */
  private isPrivateIP(hostname: string): boolean {
    // Check localhost
    if (hostname === 'localhost') {
      return true;
    }

    // Check IPv4 private ranges
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    // Check IPv6 localhost
    if (hostname === '::1' || hostname === '[::1]') {
      return true;
    }

    return false;
  }

  /**
   * Match domain against pattern (supports wildcards)
   */
  private matchesDomainPattern(domain: string, pattern: string): boolean {
    const normalizedDomain = domain.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();

    // Exact match
    if (normalizedDomain === normalizedPattern) {
      return true;
    }

    // Wildcard match (*.example.com)
    if (normalizedPattern.startsWith('*.')) {
      const suffix = normalizedPattern.slice(2);
      return normalizedDomain.endsWith('.' + suffix) || normalizedDomain === suffix;
    }

    return false;
  }

  /**
   * Get port from URL, using defaults for protocol
   */
  private getPort(url: URL): number {
    if (url.port) {
      return parseInt(url.port, 10);
    }
    return url.protocol === 'https:' ? 443 : 80;
  }

  /**
   * Update scope configuration
   */
  updateConfig(newConfig: Partial<ScopeConfig>): void {
    Object.assign(this.config, newConfig);
  }

  /**
   * Check if scope validation is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create a disabled scope validator (allows all URLs)
 */
export function createDisabledValidator(): ScopeValidator {
  return new ScopeValidator({ enabled: false });
}

/**
 * Create a scope validator from environment/config
 */
export function createScopeValidator(
  enabled: boolean,
  allowedDomains?: string[],
  deniedDomains?: string[],
  allowPrivateIPs: boolean = false
): ScopeValidator {
  return new ScopeValidator({
    enabled,
    allowedDomains,
    deniedDomains,
    allowPrivateIPs,
  });
}
