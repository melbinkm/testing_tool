/**
 * Target Validators - Validates domains, IPs, and URLs against scope
 */

import * as ipaddr from 'ipaddr.js';
import {
  EngagementScope,
  ValidationResult,
  OutOfScopeError
} from './types.js';

/**
 * TargetValidator - Validates targets against engagement scope
 */
export class TargetValidator {
  private scope: EngagementScope;

  constructor(scope: EngagementScope) {
    this.scope = scope;
  }

  /**
   * Validate a target (URL, domain, or IP) against the scope
   * @param target Target to validate
   * @returns ValidationResult with validity and reason
   */
  validateTarget(target: string): ValidationResult {
    const normalizedTarget = target.toLowerCase().trim();

    // Parse the target to extract domain/IP and port
    const parsed = this.parseTarget(normalizedTarget);
    if (!parsed) {
      return {
        valid: false,
        target,
        reason: 'Invalid target format'
      };
    }

    const { host, port, path } = parsed;

    // Check denylist first (takes precedence)
    const denyResult = this.checkDenylist(host, port, path);
    if (denyResult) {
      return {
        valid: false,
        target,
        reason: denyResult.reason,
        matchedRule: denyResult.matchedRule
      };
    }

    // Check allowlist
    const allowResult = this.checkAllowlist(host, port);
    if (!allowResult.allowed) {
      return {
        valid: false,
        target,
        reason: allowResult.reason
      };
    }

    return {
      valid: true,
      target,
      matchedRule: allowResult.matchedRule
    };
  }

  /**
   * Parse a target string into components
   */
  private parseTarget(target: string): { host: string; port?: number; path?: string } | null {
    try {
      // Try parsing as URL first
      if (target.includes('://')) {
        const url = new URL(target);
        const port = url.port ? parseInt(url.port, 10) : this.getDefaultPort(url.protocol);
        return {
          host: url.hostname.toLowerCase(),
          port,
          path: url.pathname + url.search
        };
      }

      // Check if it's an IP address (with optional port)
      const ipPortMatch = target.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?$/);
      if (ipPortMatch) {
        return {
          host: ipPortMatch[1],
          port: ipPortMatch[2] ? parseInt(ipPortMatch[2], 10) : undefined
        };
      }

      // Check if it's an IPv6 address
      const ipv6Match = target.match(/^\[([^\]]+)\](?::(\d+))?$/);
      if (ipv6Match) {
        return {
          host: ipv6Match[1],
          port: ipv6Match[2] ? parseInt(ipv6Match[2], 10) : undefined
        };
      }

      // Treat as domain (with optional port)
      const domainPortMatch = target.match(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)(?::(\d+))?$/i);
      if (domainPortMatch) {
        return {
          host: domainPortMatch[1].toLowerCase(),
          port: domainPortMatch[5] ? parseInt(domainPortMatch[5], 10) : undefined
        };
      }

      // Try as plain IP without strict validation
      if (this.isValidIP(target)) {
        return { host: target };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get default port for a protocol
   */
  private getDefaultPort(protocol: string): number | undefined {
    const ports: Record<string, number> = {
      'http:': 80,
      'https:': 443,
      'ssh:': 22,
      'ftp:': 21
    };
    return ports[protocol];
  }

  /**
   * Check if a host is in the denylist
   */
  private checkDenylist(
    host: string,
    port?: number,
    path?: string
  ): { reason: string; matchedRule: string } | null {
    const denylist = this.scope.denylist;
    if (!denylist) return null;

    // Check denied domains
    if (denylist.domains) {
      for (const pattern of denylist.domains) {
        if (this.matchesDomainPattern(host, pattern.toLowerCase())) {
          return {
            reason: 'Domain is in denylist',
            matchedRule: `denylist.domains: ${pattern}`
          };
        }
      }
    }

    // Check denied IP ranges
    if (denylist.ip_ranges && this.isValidIP(host)) {
      for (const range of denylist.ip_ranges) {
        if (this.ipInRange(host, range)) {
          return {
            reason: 'IP is in denylist',
            matchedRule: `denylist.ip_ranges: ${range}`
          };
        }
      }
    }

    // Check denied ports
    if (denylist.ports && port !== undefined) {
      if (denylist.ports.includes(port)) {
        return {
          reason: 'Port is in denylist',
          matchedRule: `denylist.ports: ${port}`
        };
      }
    }

    // Check denied keywords in path
    if (denylist.keywords && path) {
      const lowerPath = path.toLowerCase();
      for (const keyword of denylist.keywords) {
        if (lowerPath.includes(keyword.toLowerCase())) {
          return {
            reason: 'Path contains denied keyword',
            matchedRule: `denylist.keywords: ${keyword}`
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if a host is in the allowlist
   */
  private checkAllowlist(
    host: string,
    port?: number
  ): { allowed: boolean; reason: string; matchedRule?: string } {
    const allowlist = this.scope.allowlist;

    // Check if it's an IP address
    if (this.isValidIP(host)) {
      // Check allowed IP ranges
      if (allowlist.ip_ranges) {
        for (const range of allowlist.ip_ranges) {
          if (this.ipInRange(host, range)) {
            // Also check port if specified
            if (port !== undefined && allowlist.ports && !allowlist.ports.includes(port)) {
              return {
                allowed: false,
                reason: `Port ${port} is not in allowlist`
              };
            }
            return {
              allowed: true,
              reason: 'IP in allowed range',
              matchedRule: `allowlist.ip_ranges: ${range}`
            };
          }
        }
      }
      return {
        allowed: false,
        reason: 'IP not in any allowed range'
      };
    }

    // Check allowed domains
    if (allowlist.domains) {
      for (const pattern of allowlist.domains) {
        if (this.matchesDomainPattern(host, pattern.toLowerCase())) {
          // Also check port if specified
          if (port !== undefined && allowlist.ports && !allowlist.ports.includes(port)) {
            return {
              allowed: false,
              reason: `Port ${port} is not in allowlist`
            };
          }
          return {
            allowed: true,
            reason: 'Domain matches allowed pattern',
            matchedRule: `allowlist.domains: ${pattern}`
          };
        }
      }
    }

    return {
      allowed: false,
      reason: 'Domain not in allowlist'
    };
  }

  /**
   * Check if a domain matches a pattern (supports wildcards)
   * @param domain Domain to check
   * @param pattern Pattern to match (e.g., "*.example.com", "api.example.com")
   */
  matchesDomainPattern(domain: string, pattern: string): boolean {
    const normalizedDomain = domain.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();

    // Exact match
    if (normalizedDomain === normalizedPattern) {
      return true;
    }

    // Wildcard match (*.example.com)
    if (normalizedPattern.startsWith('*.')) {
      const suffix = normalizedPattern.slice(2); // Remove "*."

      // Must be a subdomain, not just the base domain
      if (normalizedDomain === suffix) {
        return false;
      }

      // Check if domain ends with the suffix
      return normalizedDomain.endsWith('.' + suffix);
    }

    return false;
  }

  /**
   * Check if an IP is valid
   */
  isValidIP(host: string): boolean {
    try {
      ipaddr.parse(host);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if an IP is within a CIDR range
   * @param ip IP address to check
   * @param range CIDR range (e.g., "192.168.1.0/24")
   */
  ipInRange(ip: string, range: string): boolean {
    try {
      const addr = ipaddr.parse(ip);

      // Handle single IP (no CIDR notation)
      if (!range.includes('/')) {
        return ip === range;
      }

      const [rangeAddr, prefixLength] = ipaddr.parseCIDR(range);

      // Ensure both are same type (IPv4 or IPv6)
      if (addr.kind() !== rangeAddr.kind()) {
        // Try to convert IPv4-mapped IPv6 to IPv4
        if (addr.kind() === 'ipv6' && rangeAddr.kind() === 'ipv4') {
          const ipv6 = addr as ipaddr.IPv6;
          if (ipv6.isIPv4MappedAddress()) {
            const ipv4 = ipv6.toIPv4Address();
            return ipv4.match(rangeAddr, prefixLength);
          }
        }
        return false;
      }

      return addr.match(rangeAddr, prefixLength);
    } catch {
      return false;
    }
  }

  /**
   * Validate and throw if target is out of scope
   * @param target Target to validate
   * @throws OutOfScopeError if target is not in scope
   */
  assertInScope(target: string): void {
    const result = this.validateTarget(target);
    if (!result.valid) {
      throw new OutOfScopeError(target, result.reason || 'Unknown reason');
    }
  }

  /**
   * Get the current scope
   */
  getScope(): EngagementScope {
    return this.scope;
  }

  /**
   * Update the scope
   */
  updateScope(scope: EngagementScope): void {
    this.scope = scope;
  }
}
