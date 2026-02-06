import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Directory Structure', () => {
  const requiredDirectories = [
    '.autopentest',
    '.autopentest/skills',
    '.autopentest/commands',
    'mcp-servers',
    'scope',
    'evidence',
    'logs',
    'data',
    'tests',
    'tests/phase1',
  ];

  it.each(requiredDirectories)('should have %s directory', (dir) => {
    const fullPath = path.join(PROJECT_ROOT, dir);
    expect(fs.existsSync(fullPath)).toBe(true);
    const stats = fs.statSync(fullPath);
    expect(stats.isDirectory()).toBe(true);
  });

  it('should have AutoPentest directory (base framework)', () => {
    const autoPentestPath = path.join(PROJECT_ROOT, 'AutoPentest');
    expect(fs.existsSync(autoPentestPath)).toBe(true);
    const stats = fs.statSync(autoPentestPath);
    expect(stats.isDirectory()).toBe(true);
  });

  it('should have AutoPentest package.json', () => {
    const packageJsonPath = path.join(PROJECT_ROOT, 'AutoPentest', 'package.json');
    expect(fs.existsSync(packageJsonPath)).toBe(true);
  });
});
