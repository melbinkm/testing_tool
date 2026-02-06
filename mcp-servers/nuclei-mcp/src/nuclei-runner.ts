/**
 * Nuclei Runner
 * Wrapper for the Nuclei vulnerability scanner binary with mock mode support
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { access } from 'fs/promises';
import { constants } from 'fs';
import {
  NucleiConfig,
  ScanResult,
  NucleiFinding,
  NucleiOutput,
  NucleiError,
  Severity,
} from './types.js';

const DEFAULT_CONFIG: NucleiConfig = {
  nucleiPath: process.env.NUCLEI_PATH || 'nuclei',
  templatesDir: process.env.TEMPLATES_DIR || './nuclei-templates',
  rateLimit: parseInt(process.env.RATE_LIMIT || '10', 10),
  timeout: parseInt(process.env.TIMEOUT || '30000', 10),
  mockMode: process.env.MOCK_MODE === 'true',
};

/**
 * Mock findings for testing when nuclei binary is not available
 */
const MOCK_FINDINGS: Record<string, NucleiFinding[]> = {
  'cves/2021/CVE-2021-44228': [
    {
      template_id: 'CVE-2021-44228',
      template_name: 'Log4j RCE (Log4Shell)',
      severity: 'critical',
      matched_at: '{{target}}/api/endpoint',
      matcher_name: 'log4j-rce',
      extracted_data: { 'dns-callback': 'detected' },
      timestamp: new Date().toISOString(),
    },
  ],
  'vulnerabilities/generic/xss-detection': [
    {
      template_id: 'xss-detection',
      template_name: 'Cross-Site Scripting Detection',
      severity: 'medium',
      matched_at: '{{target}}/search?q=<script>',
      matcher_name: 'xss-reflected',
      timestamp: new Date().toISOString(),
    },
  ],
  'misconfiguration/http-missing-security-headers': [
    {
      template_id: 'http-missing-security-headers',
      template_name: 'Missing Security Headers',
      severity: 'info',
      matched_at: '{{target}}/',
      matcher_name: 'missing-csp',
      timestamp: new Date().toISOString(),
    },
    {
      template_id: 'http-missing-security-headers',
      template_name: 'Missing Security Headers',
      severity: 'info',
      matched_at: '{{target}}/',
      matcher_name: 'missing-x-frame-options',
      timestamp: new Date().toISOString(),
    },
  ],
};

export class NucleiRunner {
  private config: NucleiConfig;
  private binaryAvailable: boolean | null = null;

  constructor(config: Partial<NucleiConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if nuclei binary is available
   */
  async checkBinary(): Promise<boolean> {
    if (this.binaryAvailable !== null) {
      return this.binaryAvailable;
    }

    // If mock mode is forced, return false
    if (this.config.mockMode) {
      this.binaryAvailable = false;
      return false;
    }

    try {
      // Check if it's an absolute path
      if (this.config.nucleiPath.startsWith('/') || this.config.nucleiPath.includes('/')) {
        await access(this.config.nucleiPath, constants.X_OK);
        this.binaryAvailable = true;
        return true;
      }

      // Check PATH
      const result = await this.executeCommand('which', [this.config.nucleiPath]);
      this.binaryAvailable = result.exitCode === 0;
      return this.binaryAvailable;
    } catch {
      this.binaryAvailable = false;
      return false;
    }
  }

  /**
   * Get whether running in mock mode
   */
  async isMockMode(): Promise<boolean> {
    if (this.config.mockMode) return true;
    const binaryAvailable = await this.checkBinary();
    return !binaryAvailable;
  }

  /**
   * Get current configuration
   */
  getConfig(): NucleiConfig {
    return { ...this.config };
  }

  /**
   * Execute a command and return the result
   */
  private executeCommand(
    command: string,
    args: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        shell: false,
        timeout: this.config.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });

      proc.on('error', () => {
        resolve({ exitCode: 1, stdout, stderr });
      });
    });
  }

  /**
   * Parse Nuclei JSON output line
   */
  private parseNucleiOutput(line: string): NucleiFinding | null {
    try {
      const output: NucleiOutput = JSON.parse(line);
      return {
        template_id: output['template-id'],
        template_name: output.info?.name,
        severity: (output.info?.severity?.toLowerCase() || 'info') as Severity,
        matched_at: output['matched-at'],
        matched_url: output.host,
        matcher_name: output['matcher-name'],
        extracted_data: output['extracted-results']
          ? { results: output['extracted-results'].join(', ') }
          : undefined,
        curl_command: output['curl-command'],
        timestamp: output.timestamp || new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Run mock scan for testing
   */
  private async runMockScan(
    target: string,
    templateIds: string[]
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: NucleiFinding[] = [];

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 50));

    for (const templateId of templateIds) {
      const mockFindings = MOCK_FINDINGS[templateId];
      if (mockFindings) {
        for (const finding of mockFindings) {
          findings.push({
            ...finding,
            matched_at: finding.matched_at.replace('{{target}}', target),
            matched_url: target,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return {
      success: true,
      target,
      templates: templateIds,
      findings,
      scan_time_ms: Date.now() - startTime,
      mock_mode: true,
    };
  }

  /**
   * Scan a single target with a specific template
   */
  async scanSingle(target: string, templateId: string): Promise<ScanResult> {
    const startTime = Date.now();

    // Validate target URL format
    try {
      new URL(target);
    } catch {
      return {
        success: false,
        target,
        template: templateId,
        findings: [],
        scan_time_ms: Date.now() - startTime,
        error: 'Invalid target URL format',
        mock_mode: await this.isMockMode(),
      };
    }

    // Check if mock mode
    if (await this.isMockMode()) {
      return this.runMockScan(target, [templateId]);
    }

    try {
      const args = [
        '-target', target,
        '-templates', templateId,
        '-json',
        '-rate-limit', this.config.rateLimit.toString(),
        '-timeout', Math.floor(this.config.timeout / 1000).toString(),
        '-silent',
      ];

      const result = await this.executeCommand(this.config.nucleiPath, args);
      const findings: NucleiFinding[] = [];

      // Parse JSON output lines
      const lines = result.stdout.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const finding = this.parseNucleiOutput(line);
        if (finding) {
          findings.push(finding);
        }
      }

      return {
        success: true,
        target,
        template: templateId,
        findings,
        scan_time_ms: Date.now() - startTime,
        mock_mode: false,
      };
    } catch (error) {
      return {
        success: false,
        target,
        template: templateId,
        findings: [],
        scan_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        mock_mode: false,
      };
    }
  }

  /**
   * Scan multiple targets with templates
   */
  async scanWithTemplates(
    targets: string[],
    options: {
      templateIds?: string[];
      tags?: string[];
      severity?: Severity[];
    } = {}
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    for (const target of targets) {
      // Validate target URL format
      try {
        new URL(target);
      } catch {
        results.push({
          success: false,
          target,
          templates: options.templateIds,
          findings: [],
          scan_time_ms: 0,
          error: 'Invalid target URL format',
          mock_mode: await this.isMockMode(),
        });
        continue;
      }

      // Check if mock mode
      if (await this.isMockMode()) {
        const mockResult = await this.runMockScan(
          target,
          options.templateIds || Object.keys(MOCK_FINDINGS)
        );
        results.push(mockResult);
        continue;
      }

      const startTime = Date.now();
      try {
        const args = [
          '-target', target,
          '-json',
          '-rate-limit', this.config.rateLimit.toString(),
          '-timeout', Math.floor(this.config.timeout / 1000).toString(),
          '-silent',
        ];

        if (options.templateIds && options.templateIds.length > 0) {
          args.push('-templates', options.templateIds.join(','));
        }

        if (options.tags && options.tags.length > 0) {
          args.push('-tags', options.tags.join(','));
        }

        if (options.severity && options.severity.length > 0) {
          args.push('-severity', options.severity.join(','));
        }

        const result = await this.executeCommand(this.config.nucleiPath, args);
        const findings: NucleiFinding[] = [];

        // Parse JSON output lines
        const lines = result.stdout.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const finding = this.parseNucleiOutput(line);
          if (finding) {
            findings.push(finding);
          }
        }

        results.push({
          success: true,
          target,
          templates: options.templateIds,
          findings,
          scan_time_ms: Date.now() - startTime,
          mock_mode: false,
        });
      } catch (error) {
        results.push({
          success: false,
          target,
          templates: options.templateIds,
          findings: [],
          scan_time_ms: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          mock_mode: false,
        });
      }
    }

    return results;
  }

  /**
   * Get nuclei version
   */
  async getVersion(): Promise<string | null> {
    if (await this.isMockMode()) {
      return 'mock-mode';
    }

    try {
      const result = await this.executeCommand(this.config.nucleiPath, ['-version']);
      const match = result.stdout.match(/v?(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}

// Export a default instance
export const nucleiRunner = new NucleiRunner();

// Export mock findings for testing
export { MOCK_FINDINGS };
