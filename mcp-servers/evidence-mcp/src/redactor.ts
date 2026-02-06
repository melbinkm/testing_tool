/**
 * Redactor class for removing sensitive data from evidence artifacts
 */

import type { RedactionConfig, RedactionPattern, Artifact, RedactionResult } from './types.js';

/**
 * Default redaction patterns for common sensitive data types
 */
export const DEFAULT_PATTERNS: RedactionPattern[] = [
  {
    name: 'api_key',
    pattern: '(api[_-]?key|apikey)[=:\\s]["\']?[\\w-]{20,}["\']?',
    replacement: '$1=[REDACTED]',
  },
  {
    name: 'bearer_token',
    pattern: 'Bearer\\s+[\\w-._~+/]+=*',
    replacement: 'Bearer [REDACTED]',
  },
  {
    name: 'basic_auth',
    pattern: 'Basic\\s+[A-Za-z0-9+/]+=*',
    replacement: 'Basic [REDACTED]',
  },
  {
    name: 'password',
    pattern: '(password|passwd|pwd)[=:\\s]["\']?[^\\s"\']+["\']?',
    replacement: '$1=[REDACTED]',
  },
  {
    name: 'credit_card',
    pattern: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
    replacement: '[CREDIT_CARD_REDACTED]',
  },
  {
    name: 'ssn',
    pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    replacement: '[SSN_REDACTED]',
  },
  {
    name: 'email',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    replacement: '[EMAIL_REDACTED]',
  },
  {
    name: 'private_ip',
    pattern: '\\b(10\\.\\d+\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+|172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+)\\b',
    replacement: '[PRIVATE_IP_REDACTED]',
  },
  {
    name: 'jwt_token',
    pattern: 'eyJ[A-Za-z0-9-_=]+\\.eyJ[A-Za-z0-9-_=]+\\.[A-Za-z0-9-_.+/=]*',
    replacement: '[JWT_REDACTED]',
  },
  {
    name: 'aws_key',
    pattern: 'AKIA[0-9A-Z]{16}',
    replacement: '[AWS_KEY_REDACTED]',
  },
  {
    name: 'github_token',
    pattern: 'gh[ps]_[A-Za-z0-9_]{36}',
    replacement: '[GITHUB_TOKEN_REDACTED]',
  },
];

/**
 * Redactor class for applying redaction patterns to content
 */
export class Redactor {
  private patterns: Map<string, RedactionPattern>;
  private maskChar: string;
  private preserveLength: boolean;

  constructor(config?: Partial<RedactionConfig>) {
    this.patterns = new Map();
    this.maskChar = config?.mask_char ?? '*';
    this.preserveLength = config?.preserve_length ?? false;

    // Load default patterns first
    for (const pattern of DEFAULT_PATTERNS) {
      this.patterns.set(pattern.name, pattern);
    }

    // Override with custom patterns if provided
    if (config?.patterns) {
      for (const pattern of config.patterns) {
        this.patterns.set(pattern.name, pattern);
      }
    }
  }

  /**
   * Add a redaction pattern
   */
  addPattern(pattern: RedactionPattern): void {
    if (!pattern.name || !pattern.pattern) {
      throw new Error('Pattern must have name and pattern properties');
    }
    this.patterns.set(pattern.name, pattern);
  }

  /**
   * Remove a redaction pattern by name
   */
  removePattern(name: string): boolean {
    return this.patterns.delete(name);
  }

  /**
   * Get all configured patterns
   */
  getPatterns(): RedactionPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Set the masking character
   */
  setMaskChar(char: string): void {
    if (char.length !== 1) {
      throw new Error('Mask character must be a single character');
    }
    this.maskChar = char;
  }

  /**
   * Get the current mask character
   */
  getMaskChar(): string {
    return this.maskChar;
  }

  /**
   * Set whether to preserve length when redacting
   */
  setPreserveLength(preserve: boolean): void {
    this.preserveLength = preserve;
  }

  /**
   * Apply all redaction patterns to content
   * Returns the redacted content and metadata about the redaction
   */
  redact(content: string): { content: string; result: RedactionResult } {
    if (!content) {
      return {
        content: '',
        result: {
          original_length: 0,
          redacted_length: 0,
          patterns_applied: [],
          redaction_count: 0,
        },
      };
    }

    let redactedContent = content;
    const patternsApplied: string[] = [];
    let redactionCount = 0;

    for (const [name, pattern] of this.patterns) {
      try {
        const regex = new RegExp(pattern.pattern, 'gi');
        const matches = redactedContent.match(regex);

        if (matches && matches.length > 0) {
          redactionCount += matches.length;
          patternsApplied.push(name);

          if (this.preserveLength) {
            // Replace with mask characters preserving length
            redactedContent = redactedContent.replace(regex, (match) => {
              return this.maskChar.repeat(match.length);
            });
          } else {
            // Use the pattern's replacement or default
            const replacement = pattern.replacement ?? `[${name.toUpperCase()}_REDACTED]`;
            redactedContent = redactedContent.replace(regex, replacement);
          }
        }
      } catch (e) {
        // Skip invalid regex patterns
        console.error(`[redactor] Invalid pattern "${name}": ${e}`);
      }
    }

    return {
      content: redactedContent,
      result: {
        original_length: content.length,
        redacted_length: redactedContent.length,
        patterns_applied: patternsApplied,
        redaction_count: redactionCount,
      },
    };
  }

  /**
   * Redact an artifact's content and return a new artifact
   */
  redactArtifact(artifact: Artifact): { artifact: Artifact; result: RedactionResult } {
    const { content, result } = this.redact(artifact.content);

    return {
      artifact: {
        ...artifact,
        content,
        redacted: result.redaction_count > 0 || artifact.redacted,
      },
      result,
    };
  }

  /**
   * Check if content contains any sensitive data
   */
  containsSensitiveData(content: string): boolean {
    if (!content) return false;

    for (const [, pattern] of this.patterns) {
      try {
        const regex = new RegExp(pattern.pattern, 'gi');
        if (regex.test(content)) {
          return true;
        }
      } catch {
        // Skip invalid patterns
      }
    }

    return false;
  }
}

// Export singleton instance for server use
let redactorInstance: Redactor | null = null;

export function getRedactor(): Redactor {
  if (!redactorInstance) {
    redactorInstance = new Redactor();
  }
  return redactorInstance;
}

export function resetRedactor(): void {
  redactorInstance = null;
}
