/**
 * Template Manager
 * Handles Nuclei template discovery, listing, and filtering
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, basename, dirname, relative } from 'path';
import { existsSync } from 'fs';
import {
  TemplateInfo,
  TemplateListOptions,
  TemplateListResult,
  Severity,
  TemplateError,
} from './types.js';

const DEFAULT_TEMPLATES_DIR = process.env.TEMPLATES_DIR || './nuclei-templates';

/**
 * Mock templates for testing when templates directory is not available
 */
const MOCK_TEMPLATES: TemplateInfo[] = [
  {
    id: 'CVE-2021-44228',
    name: 'Apache Log4j RCE (Log4Shell)',
    severity: 'critical',
    author: 'pdteam',
    tags: ['cve', 'cve2021', 'rce', 'log4j', 'apache', 'jndi'],
    description: 'Apache Log4j2 <=2.14.1 JNDI features used in configuration, log messages, and parameters do not protect against attacker controlled LDAP and other JNDI related endpoints.',
    reference: ['https://nvd.nist.gov/vuln/detail/CVE-2021-44228'],
    file_path: 'cves/2021/CVE-2021-44228.yaml',
  },
  {
    id: 'CVE-2023-44487',
    name: 'HTTP/2 Rapid Reset Attack',
    severity: 'high',
    author: 'pdteam',
    tags: ['cve', 'cve2023', 'dos', 'http2'],
    description: 'HTTP/2 protocol allows for rapid stream reset, enabling denial of service attacks.',
    reference: ['https://nvd.nist.gov/vuln/detail/CVE-2023-44487'],
    file_path: 'cves/2023/CVE-2023-44487.yaml',
  },
  {
    id: 'xss-detection',
    name: 'Cross-Site Scripting Detection',
    severity: 'medium',
    author: 'pdteam',
    tags: ['xss', 'injection', 'web'],
    description: 'Detects reflected and stored XSS vulnerabilities.',
    file_path: 'vulnerabilities/generic/xss-detection.yaml',
  },
  {
    id: 'sql-injection-detection',
    name: 'SQL Injection Detection',
    severity: 'high',
    author: 'pdteam',
    tags: ['sqli', 'injection', 'database', 'web'],
    description: 'Detects SQL injection vulnerabilities using error-based and time-based detection.',
    file_path: 'vulnerabilities/generic/sql-injection-detection.yaml',
  },
  {
    id: 'http-missing-security-headers',
    name: 'Missing Security Headers',
    severity: 'info',
    author: 'pdteam',
    tags: ['misconfiguration', 'headers', 'security'],
    description: 'Detects missing security headers like CSP, X-Frame-Options, etc.',
    file_path: 'misconfiguration/http-missing-security-headers.yaml',
  },
  {
    id: 'exposed-panels-detect',
    name: 'Exposed Admin Panels',
    severity: 'low',
    author: 'pdteam',
    tags: ['exposure', 'panel', 'admin'],
    description: 'Detects exposed administrative panels and login pages.',
    file_path: 'exposures/panels/exposed-panels-detect.yaml',
  },
  {
    id: 'default-credentials',
    name: 'Default Credentials Check',
    severity: 'high',
    author: 'pdteam',
    tags: ['default-login', 'credentials', 'authentication'],
    description: 'Checks for default credentials on common services.',
    file_path: 'default-logins/default-credentials.yaml',
  },
  {
    id: 'open-redirect',
    name: 'Open Redirect Detection',
    severity: 'medium',
    author: 'pdteam',
    tags: ['redirect', 'web', 'owasp'],
    description: 'Detects open redirect vulnerabilities.',
    file_path: 'vulnerabilities/generic/open-redirect.yaml',
  },
  {
    id: 'ssrf-detection',
    name: 'Server-Side Request Forgery',
    severity: 'high',
    author: 'pdteam',
    tags: ['ssrf', 'owasp', 'web'],
    description: 'Detects SSRF vulnerabilities.',
    file_path: 'vulnerabilities/generic/ssrf-detection.yaml',
  },
  {
    id: 'lfi-detection',
    name: 'Local File Inclusion',
    severity: 'high',
    author: 'pdteam',
    tags: ['lfi', 'inclusion', 'file'],
    description: 'Detects local file inclusion vulnerabilities.',
    file_path: 'vulnerabilities/generic/lfi-detection.yaml',
  },
];

export class TemplateManager {
  private templatesDir: string;
  private mockMode: boolean = false;
  private cachedTemplates: TemplateInfo[] | null = null;

  constructor(templatesDir: string = DEFAULT_TEMPLATES_DIR) {
    this.templatesDir = templatesDir;
  }

  /**
   * Check if templates directory exists and is accessible
   */
  async checkTemplatesDir(): Promise<boolean> {
    try {
      const stats = await stat(this.templatesDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get whether running in mock mode
   */
  async isMockMode(): Promise<boolean> {
    if (this.mockMode) return true;
    const exists = await this.checkTemplatesDir();
    this.mockMode = !exists;
    return this.mockMode;
  }

  /**
   * Force mock mode
   */
  setMockMode(enabled: boolean): void {
    this.mockMode = enabled;
    this.cachedTemplates = null;
  }

  /**
   * Get templates directory path
   */
  getTemplatesDir(): string {
    return this.templatesDir;
  }

  /**
   * Parse a YAML template file to extract metadata
   */
  private async parseTemplateFile(filePath: string): Promise<TemplateInfo | null> {
    try {
      const content = await readFile(filePath, 'utf-8');

      // Simple YAML parsing for template metadata
      const idMatch = content.match(/^id:\s*(.+)$/m);
      const nameMatch = content.match(/^\s*name:\s*(.+)$/m);
      const severityMatch = content.match(/^\s*severity:\s*(.+)$/m);
      const authorMatch = content.match(/^\s*author:\s*(.+)$/m);
      const tagsMatch = content.match(/^\s*tags:\s*(.+)$/m);
      const descriptionMatch = content.match(/^\s*description:\s*[|>]?\s*(.+)$/m);

      if (!idMatch) return null;

      const id = idMatch[1].trim();
      const severity = (severityMatch?.[1]?.trim().toLowerCase() || 'info') as Severity;

      // Parse tags (comma-separated or YAML array)
      let tags: string[] = [];
      if (tagsMatch) {
        const tagStr = tagsMatch[1].trim();
        tags = tagStr.split(',').map(t => t.trim()).filter(t => t);
      }

      // Parse author (can be string or array)
      let author = 'unknown';
      if (authorMatch) {
        author = authorMatch[1].trim();
      }

      return {
        id,
        name: nameMatch?.[1]?.trim() || id,
        severity,
        author,
        tags,
        description: descriptionMatch?.[1]?.trim(),
        file_path: relative(this.templatesDir, filePath),
      };
    } catch {
      return null;
    }
  }

  /**
   * Recursively find all YAML files in a directory
   */
  private async findYamlFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories and node_modules
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const subFiles = await this.findYamlFiles(fullPath);
            files.push(...subFiles);
          }
        } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory might not be readable
    }

    return files;
  }

  /**
   * Load all templates from disk
   */
  async loadTemplates(): Promise<TemplateInfo[]> {
    if (this.cachedTemplates) {
      return this.cachedTemplates;
    }

    if (await this.isMockMode()) {
      this.cachedTemplates = MOCK_TEMPLATES;
      return MOCK_TEMPLATES;
    }

    const templates: TemplateInfo[] = [];
    const yamlFiles = await this.findYamlFiles(this.templatesDir);

    for (const file of yamlFiles) {
      const template = await this.parseTemplateFile(file);
      if (template) {
        templates.push(template);
      }
    }

    this.cachedTemplates = templates;
    return templates;
  }

  /**
   * Clear cached templates
   */
  clearCache(): void {
    this.cachedTemplates = null;
  }

  /**
   * List templates with optional filtering
   */
  async listTemplates(options: TemplateListOptions = {}): Promise<TemplateListResult> {
    try {
      const allTemplates = await this.loadTemplates();
      let filtered = [...allTemplates];

      // Filter by severity
      if (options.severity) {
        const severities = Array.isArray(options.severity)
          ? options.severity
          : [options.severity];
        filtered = filtered.filter(t => severities.includes(t.severity));
      }

      // Filter by tags
      if (options.tags && options.tags.length > 0) {
        filtered = filtered.filter(t =>
          options.tags!.some(tag => t.tags.includes(tag.toLowerCase()))
        );
      }

      // Filter by author
      if (options.author) {
        const authorLower = options.author.toLowerCase();
        filtered = filtered.filter(t =>
          t.author.toLowerCase().includes(authorLower)
        );
      }

      // Filter by search term
      if (options.search) {
        const searchLower = options.search.toLowerCase();
        filtered = filtered.filter(t =>
          t.id.toLowerCase().includes(searchLower) ||
          t.name.toLowerCase().includes(searchLower) ||
          t.description?.toLowerCase().includes(searchLower) ||
          t.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }

      // Apply limit
      const totalFiltered = filtered.length;
      if (options.limit && options.limit > 0) {
        filtered = filtered.slice(0, options.limit);
      }

      return {
        success: true,
        templates: filtered,
        total_count: allTemplates.length,
        filtered_count: totalFiltered,
      };
    } catch (error) {
      return {
        success: false,
        templates: [],
        total_count: 0,
        filtered_count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a specific template by ID
   */
  async getTemplate(templateId: string): Promise<TemplateInfo | null> {
    const templates = await this.loadTemplates();
    return templates.find(t => t.id === templateId) || null;
  }

  /**
   * Check if a template exists
   */
  async templateExists(templateId: string): Promise<boolean> {
    const template = await this.getTemplate(templateId);
    return template !== null;
  }

  /**
   * Get templates by severity
   */
  async getTemplatesBySeverity(severity: Severity): Promise<TemplateInfo[]> {
    const result = await this.listTemplates({ severity });
    return result.templates;
  }

  /**
   * Get templates by tags
   */
  async getTemplatesByTags(tags: string[]): Promise<TemplateInfo[]> {
    const result = await this.listTemplates({ tags });
    return result.templates;
  }

  /**
   * Get template count by severity
   */
  async getTemplateCountBySeverity(): Promise<Record<Severity, number>> {
    const templates = await this.loadTemplates();
    const counts: Record<Severity, number> = {
      info: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const template of templates) {
      counts[template.severity]++;
    }

    return counts;
  }

  /**
   * Get all unique tags
   */
  async getAllTags(): Promise<string[]> {
    const templates = await this.loadTemplates();
    const tagSet = new Set<string>();

    for (const template of templates) {
      for (const tag of template.tags) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet).sort();
  }
}

// Export a default instance
export const templateManager = new TemplateManager();

// Export mock templates for testing
export { MOCK_TEMPLATES };
