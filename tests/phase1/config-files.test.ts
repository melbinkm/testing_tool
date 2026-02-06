import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Configuration Files', () => {
  describe('.autopentest/settings.json', () => {
    const settingsPath = path.join(PROJECT_ROOT, '.autopentest/settings.json');

    it('should exist', () => {
      expect(fs.existsSync(settingsPath)).toBe(true);
    });

    it('should be valid JSON', () => {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should have required fields', () => {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);

      expect(settings).toHaveProperty('mcpServers');
      expect(settings).toHaveProperty('coreTools');
      expect(settings).toHaveProperty('approvalMode');
    });

    it('should have valid approvalMode', () => {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);

      const validModes = ['INTERACTIVE', 'AUTO_APPROVE', 'DENY_ALL'];
      expect(validModes).toContain(settings.approvalMode);
    });

    it('should have coreTools as an array', () => {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);

      expect(Array.isArray(settings.coreTools)).toBe(true);
    });
  });

  describe('.autopentest/config.yaml', () => {
    const configPath = path.join(PROJECT_ROOT, '.autopentest/config.yaml');

    it('should exist', () => {
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should be valid YAML', () => {
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(() => yaml.load(content)).not.toThrow();
    });

    it('should have project section', () => {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.load(content) as Record<string, unknown>;

      expect(config).toHaveProperty('project');
      expect(config.project).toHaveProperty('name');
      expect(config.project).toHaveProperty('version');
      expect(config.project).toHaveProperty('environment');
    });

    it('should have defaults section with rate limits', () => {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.load(content) as Record<string, unknown>;

      expect(config).toHaveProperty('defaults');
      expect(config.defaults).toHaveProperty('max_rps');
      expect(config.defaults).toHaveProperty('max_concurrency');
      expect(config.defaults).toHaveProperty('max_total_requests');
    });

    it('should have logging section', () => {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.load(content) as Record<string, unknown>;

      expect(config).toHaveProperty('logging');
      expect(config.logging).toHaveProperty('level');
      expect(config.logging).toHaveProperty('directory');
    });

    it('should have SANDBOX environment by default', () => {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.load(content) as Record<string, unknown>;

      expect((config.project as Record<string, unknown>).environment).toBe('SANDBOX');
    });
  });
});
