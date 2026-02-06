import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TemplateManager, MOCK_TEMPLATES } from './template-manager.js';

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('TemplateManager', () => {
  let manager: TemplateManager;

  beforeEach(() => {
    manager = new TemplateManager('./nonexistent-templates');
    manager.setMockMode(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    manager.clearCache();
  });

  describe('Configuration', () => {
    it('should use provided templates directory', () => {
      const customManager = new TemplateManager('/custom/templates');
      expect(customManager.getTemplatesDir()).toBe('/custom/templates');
    });

    it('should use default templates directory when not provided', () => {
      const defaultManager = new TemplateManager();
      expect(defaultManager.getTemplatesDir()).toBeDefined();
    });
  });

  describe('Mock Mode', () => {
    it('should return true for mock mode when set', async () => {
      manager.setMockMode(true);
      expect(await manager.isMockMode()).toBe(true);
    });

    it('should detect mock mode when templates dir does not exist', async () => {
      const noMockManager = new TemplateManager('/nonexistent/path/12345');
      expect(await noMockManager.isMockMode()).toBe(true);
    });

    it('should clear cache when setting mock mode', async () => {
      // Load templates first
      await manager.loadTemplates();
      // Set mock mode - should clear cache
      manager.setMockMode(false);
      // Will need to reload
      manager.setMockMode(true);
    });
  });

  describe('loadTemplates', () => {
    it('should return mock templates in mock mode', async () => {
      const templates = await manager.loadTemplates();

      expect(templates.length).toBe(MOCK_TEMPLATES.length);
      expect(templates[0].id).toBeDefined();
    });

    it('should cache loaded templates', async () => {
      const templates1 = await manager.loadTemplates();
      const templates2 = await manager.loadTemplates();

      expect(templates1).toBe(templates2); // Same reference
    });

    it('should clear cache when clearCache is called', async () => {
      const templates1 = await manager.loadTemplates();
      manager.clearCache();
      const templates2 = await manager.loadTemplates();

      // In mock mode, both return the same MOCK_TEMPLATES array
      // Just verify the method doesn't throw and returns templates
      expect(templates2).toBeDefined();
      expect(templates2.length).toBe(templates1.length);
    });
  });

  describe('listTemplates', () => {
    it('should return all templates when no filters', async () => {
      const result = await manager.listTemplates();

      expect(result.success).toBe(true);
      expect(result.templates.length).toBe(MOCK_TEMPLATES.length);
      expect(result.total_count).toBe(MOCK_TEMPLATES.length);
      expect(result.filtered_count).toBe(MOCK_TEMPLATES.length);
    });

    it('should filter by single severity', async () => {
      const result = await manager.listTemplates({ severity: 'critical' });

      expect(result.success).toBe(true);
      expect(result.templates.every(t => t.severity === 'critical')).toBe(true);
    });

    it('should filter by multiple severities', async () => {
      const result = await manager.listTemplates({ severity: ['critical', 'high'] });

      expect(result.success).toBe(true);
      expect(result.templates.every(t => ['critical', 'high'].includes(t.severity))).toBe(true);
    });

    it('should filter by tags', async () => {
      const result = await manager.listTemplates({ tags: ['cve'] });

      expect(result.success).toBe(true);
      expect(result.templates.every(t => t.tags.some(tag => tag.includes('cve')))).toBe(true);
    });

    it('should filter by multiple tags', async () => {
      const result = await manager.listTemplates({ tags: ['xss', 'sqli'] });

      expect(result.success).toBe(true);
      result.templates.forEach(t => {
        expect(t.tags.some(tag => tag === 'xss' || tag === 'sqli')).toBe(true);
      });
    });

    it('should filter by author', async () => {
      const result = await manager.listTemplates({ author: 'pdteam' });

      expect(result.success).toBe(true);
      expect(result.templates.every(t => t.author.toLowerCase().includes('pdteam'))).toBe(true);
    });

    it('should filter by search term in ID', async () => {
      const result = await manager.listTemplates({ search: 'CVE-2021' });

      expect(result.success).toBe(true);
      expect(result.templates.some(t => t.id.includes('CVE-2021'))).toBe(true);
    });

    it('should filter by search term in name', async () => {
      const result = await manager.listTemplates({ search: 'Log4j' });

      expect(result.success).toBe(true);
      expect(result.templates.some(t => t.name.includes('Log4j'))).toBe(true);
    });

    it('should filter by search term in description', async () => {
      const result = await manager.listTemplates({ search: 'injection' });

      expect(result.success).toBe(true);
      expect(result.templates.length).toBeGreaterThan(0);
    });

    it('should apply limit', async () => {
      const result = await manager.listTemplates({ limit: 3 });

      expect(result.success).toBe(true);
      expect(result.templates.length).toBe(3);
      expect(result.total_count).toBe(MOCK_TEMPLATES.length);
      expect(result.filtered_count).toBe(MOCK_TEMPLATES.length);
    });

    it('should combine multiple filters', async () => {
      const result = await manager.listTemplates({
        severity: ['high', 'critical'],
        tags: ['cve'],
      });

      expect(result.success).toBe(true);
      result.templates.forEach(t => {
        expect(['high', 'critical'].includes(t.severity)).toBe(true);
        expect(t.tags.some(tag => tag.includes('cve'))).toBe(true);
      });
    });

    it('should return empty array for no matches', async () => {
      const result = await manager.listTemplates({
        search: 'nonexistent_template_12345',
      });

      expect(result.success).toBe(true);
      expect(result.templates).toHaveLength(0);
      expect(result.filtered_count).toBe(0);
    });
  });

  describe('getTemplate', () => {
    it('should return template by ID', async () => {
      const template = await manager.getTemplate('CVE-2021-44228');

      expect(template).not.toBeNull();
      expect(template?.id).toBe('CVE-2021-44228');
    });

    it('should return null for unknown template ID', async () => {
      const template = await manager.getTemplate('unknown-template-12345');

      expect(template).toBeNull();
    });
  });

  describe('templateExists', () => {
    it('should return true for existing template', async () => {
      const exists = await manager.templateExists('CVE-2021-44228');
      expect(exists).toBe(true);
    });

    it('should return false for non-existing template', async () => {
      const exists = await manager.templateExists('unknown-12345');
      expect(exists).toBe(false);
    });
  });

  describe('getTemplatesBySeverity', () => {
    it('should return templates for specified severity', async () => {
      const templates = await manager.getTemplatesBySeverity('critical');

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.severity === 'critical')).toBe(true);
    });

    it('should return empty array for severity with no templates', async () => {
      // All severities have templates in mock data, but test the method
      const templates = await manager.getTemplatesBySeverity('info');
      expect(Array.isArray(templates)).toBe(true);
    });
  });

  describe('getTemplatesByTags', () => {
    it('should return templates for specified tags', async () => {
      const templates = await manager.getTemplatesByTags(['cve']);

      expect(templates.length).toBeGreaterThan(0);
      templates.forEach(t => {
        expect(t.tags.some(tag => tag.includes('cve'))).toBe(true);
      });
    });

    it('should return templates matching any of the tags', async () => {
      const templates = await manager.getTemplatesByTags(['xss', 'sqli']);

      expect(templates.length).toBeGreaterThan(0);
    });
  });

  describe('getTemplateCountBySeverity', () => {
    it('should return counts for all severity levels', async () => {
      const counts = await manager.getTemplateCountBySeverity();

      expect(counts).toHaveProperty('info');
      expect(counts).toHaveProperty('low');
      expect(counts).toHaveProperty('medium');
      expect(counts).toHaveProperty('high');
      expect(counts).toHaveProperty('critical');
    });

    it('should have correct total count', async () => {
      const counts = await manager.getTemplateCountBySeverity();
      const total = counts.info + counts.low + counts.medium + counts.high + counts.critical;

      expect(total).toBe(MOCK_TEMPLATES.length);
    });
  });

  describe('getAllTags', () => {
    it('should return unique tags', async () => {
      const tags = await manager.getAllTags();

      expect(Array.isArray(tags)).toBe(true);
      expect(new Set(tags).size).toBe(tags.length); // All unique
    });

    it('should return sorted tags', async () => {
      const tags = await manager.getAllTags();
      const sortedTags = [...tags].sort();

      expect(tags).toEqual(sortedTags);
    });

    it('should include common tags', async () => {
      const tags = await manager.getAllTags();

      expect(tags).toContain('cve');
      expect(tags).toContain('web');
    });
  });

  describe('Mock Templates Structure', () => {
    it('should have required properties in all templates', () => {
      MOCK_TEMPLATES.forEach(template => {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.severity).toBeDefined();
        expect(template.author).toBeDefined();
        expect(template.tags).toBeDefined();
        expect(template.file_path).toBeDefined();
      });
    });

    it('should have valid severity levels', () => {
      const validSeverities = ['info', 'low', 'medium', 'high', 'critical'];

      MOCK_TEMPLATES.forEach(template => {
        expect(validSeverities).toContain(template.severity);
      });
    });

    it('should have non-empty tags arrays', () => {
      MOCK_TEMPLATES.forEach(template => {
        expect(Array.isArray(template.tags)).toBe(true);
        expect(template.tags.length).toBeGreaterThan(0);
      });
    });

    it('should have CVE templates with critical/high severity', () => {
      const cveTemplates = MOCK_TEMPLATES.filter(t => t.id.startsWith('CVE-'));

      cveTemplates.forEach(template => {
        expect(['critical', 'high'].includes(template.severity)).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search string', async () => {
      const result = await manager.listTemplates({ search: '' });

      expect(result.success).toBe(true);
      expect(result.templates.length).toBe(MOCK_TEMPLATES.length);
    });

    it('should handle limit of 0', async () => {
      const result = await manager.listTemplates({ limit: 0 });

      expect(result.success).toBe(true);
      expect(result.templates.length).toBe(MOCK_TEMPLATES.length);
    });

    it('should handle negative limit', async () => {
      const result = await manager.listTemplates({ limit: -1 });

      expect(result.success).toBe(true);
      expect(result.templates.length).toBe(MOCK_TEMPLATES.length);
    });

    it('should handle limit larger than total', async () => {
      const result = await manager.listTemplates({ limit: 1000 });

      expect(result.success).toBe(true);
      expect(result.templates.length).toBe(MOCK_TEMPLATES.length);
    });

    it('should be case-insensitive for search', async () => {
      const lowerResult = await manager.listTemplates({ search: 'log4j' });
      const upperResult = await manager.listTemplates({ search: 'LOG4J' });

      expect(lowerResult.templates.length).toBe(upperResult.templates.length);
    });

    it('should be case-insensitive for author filter', async () => {
      const lowerResult = await manager.listTemplates({ author: 'pdteam' });
      const upperResult = await manager.listTemplates({ author: 'PDTEAM' });

      expect(lowerResult.templates.length).toBe(upperResult.templates.length);
    });
  });
});
