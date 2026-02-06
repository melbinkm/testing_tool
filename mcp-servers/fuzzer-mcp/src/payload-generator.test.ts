import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PayloadGenerator,
  BOUNDARY_PAYLOADS,
  TYPE_CONFUSION_PAYLOADS,
  INJECTION_PAYLOADS,
  FORMAT_PAYLOADS,
  OVERFLOW_PAYLOADS,
  PAYLOADS_BY_TYPE,
} from './payload-generator.js';
import { PayloadType, ParameterDefinition } from './types.js';

// Suppress console.error during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('PayloadGenerator', () => {
  let generator: PayloadGenerator;

  beforeEach(() => {
    generator = new PayloadGenerator(100);
  });

  describe('Configuration', () => {
    it('should use provided max payloads', () => {
      const customGenerator = new PayloadGenerator(50);
      const payloads = customGenerator.getPayloads();
      expect(payloads.length).toBeLessThanOrEqual(50);
    });

    it('should use default max payloads', () => {
      const defaultGenerator = new PayloadGenerator();
      expect(defaultGenerator).toBeDefined();
    });
  });

  describe('getPayloadTypes', () => {
    it('should return all payload types', () => {
      const types = generator.getPayloadTypes();

      expect(types).toContain('boundary');
      expect(types).toContain('type_confusion');
      expect(types).toContain('injection');
      expect(types).toContain('format');
      expect(types).toContain('overflow');
    });

    it('should return exactly 5 payload types', () => {
      const types = generator.getPayloadTypes();
      expect(types).toHaveLength(5);
    });
  });

  describe('getPayloadsByType', () => {
    it('should return boundary payloads', () => {
      const payloads = generator.getPayloadsByType('boundary');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every(p => p.type === 'boundary')).toBe(true);
    });

    it('should return type confusion payloads', () => {
      const payloads = generator.getPayloadsByType('type_confusion');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every(p => p.type === 'type_confusion')).toBe(true);
    });

    it('should return injection payloads', () => {
      const payloads = generator.getPayloadsByType('injection');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every(p => p.type === 'injection')).toBe(true);
    });

    it('should return format payloads', () => {
      const payloads = generator.getPayloadsByType('format');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every(p => p.type === 'format')).toBe(true);
    });

    it('should return overflow payloads', () => {
      const payloads = generator.getPayloadsByType('overflow');
      expect(payloads.length).toBeGreaterThan(0);
      expect(payloads.every(p => p.type === 'overflow')).toBe(true);
    });

    it('should return empty array for unknown type', () => {
      const payloads = generator.getPayloadsByType('unknown' as PayloadType);
      expect(payloads).toHaveLength(0);
    });
  });

  describe('getPayloads', () => {
    it('should return all payloads when no types specified', () => {
      const payloads = generator.getPayloads();
      expect(payloads.length).toBeGreaterThan(0);
    });

    it('should return payloads for specified types', () => {
      const payloads = generator.getPayloads(['boundary', 'injection']);
      const types = new Set(payloads.map(p => p.type));

      expect(types.has('boundary')).toBe(true);
      expect(types.has('injection')).toBe(true);
      expect(types.has('overflow')).toBe(false);
    });

    it('should respect max payloads limit', () => {
      const limitedGenerator = new PayloadGenerator(10);
      const payloads = limitedGenerator.getPayloads();

      expect(payloads.length).toBeLessThanOrEqual(10);
    });
  });

  describe('generateForParameter', () => {
    it('should generate payloads for string parameter', () => {
      const param: ParameterDefinition = {
        name: 'query',
        location: 'query',
        type: 'string',
        required: true,
      };

      const payloads = generator.generateForParameter(param);
      expect(payloads.length).toBeGreaterThan(0);
    });

    it('should generate payloads for integer parameter', () => {
      const param: ParameterDefinition = {
        name: 'id',
        location: 'path',
        type: 'integer',
        required: true,
        minimum: 1,
        maximum: 100,
      };

      const payloads = generator.generateForParameter(param);
      expect(payloads.length).toBeGreaterThan(0);

      // Should include boundary payloads around min/max
      const descriptions = payloads.map(p => p.description);
      expect(descriptions.some(d => d.includes('minimum'))).toBe(true);
      expect(descriptions.some(d => d.includes('maximum'))).toBe(true);
    });

    it('should generate payloads for parameter with enum', () => {
      const param: ParameterDefinition = {
        name: 'status',
        location: 'query',
        type: 'string',
        required: false,
        enum: ['active', 'inactive', 'pending'],
      };

      const payloads = generator.generateForParameter(param);
      expect(payloads.length).toBeGreaterThan(0);

      // Should include invalid enum value
      const descriptions = payloads.map(p => p.description);
      expect(descriptions.some(d => d.includes('enum'))).toBe(true);
    });

    it('should generate payloads for parameter with length constraints', () => {
      const param: ParameterDefinition = {
        name: 'name',
        location: 'body',
        type: 'string',
        required: true,
        minLength: 3,
        maxLength: 50,
      };

      const payloads = generator.generateForParameter(param);
      expect(payloads.length).toBeGreaterThan(0);

      // Should include length boundary payloads
      const descriptions = payloads.map(p => p.description);
      expect(descriptions.some(d => d.includes('minLength'))).toBe(true);
      expect(descriptions.some(d => d.includes('maxLength'))).toBe(true);
    });

    it('should filter by payload types', () => {
      const param: ParameterDefinition = {
        name: 'query',
        location: 'query',
        type: 'string',
        required: true,
      };

      const payloads = generator.generateForParameter(param, ['boundary']);
      expect(payloads.every(p => p.type === 'boundary')).toBe(true);
    });

    it('should respect max payloads limit', () => {
      const limitedGenerator = new PayloadGenerator(5);
      const param: ParameterDefinition = {
        name: 'query',
        location: 'query',
        type: 'string',
        required: true,
      };

      const payloads = limitedGenerator.generateForParameter(param);
      expect(payloads.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getPayloadTypeDescriptions', () => {
    it('should return descriptions for all types', () => {
      const descriptions = generator.getPayloadTypeDescriptions();

      expect(descriptions.boundary).toBeDefined();
      expect(descriptions.type_confusion).toBeDefined();
      expect(descriptions.injection).toBeDefined();
      expect(descriptions.format).toBeDefined();
      expect(descriptions.overflow).toBeDefined();
    });

    it('should return non-empty descriptions', () => {
      const descriptions = generator.getPayloadTypeDescriptions();

      Object.values(descriptions).forEach(desc => {
        expect(desc.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getPayloadExamples', () => {
    it('should return examples for each type', () => {
      const types = generator.getPayloadTypes();

      types.forEach(type => {
        const examples = generator.getPayloadExamples(type);
        expect(Array.isArray(examples)).toBe(true);
        expect(examples.length).toBeGreaterThan(0);
        expect(examples.length).toBeLessThanOrEqual(5);
      });
    });

    it('should truncate long examples', () => {
      const examples = generator.getPayloadExamples('overflow');

      examples.forEach(example => {
        expect(example.length).toBeLessThanOrEqual(50);
      });
    });
  });

  describe('Payload Structure', () => {
    it('should have required properties in all payloads', () => {
      const allPayloads = [
        ...BOUNDARY_PAYLOADS,
        ...TYPE_CONFUSION_PAYLOADS,
        ...INJECTION_PAYLOADS,
        ...FORMAT_PAYLOADS,
        ...OVERFLOW_PAYLOADS,
      ];

      allPayloads.forEach(payload => {
        expect(payload).toHaveProperty('value');
        expect(payload).toHaveProperty('type');
        expect(payload).toHaveProperty('description');
      });
    });

    it('should have valid type values', () => {
      const validTypes: PayloadType[] = ['boundary', 'type_confusion', 'injection', 'format', 'overflow'];
      const allPayloads = [
        ...BOUNDARY_PAYLOADS,
        ...TYPE_CONFUSION_PAYLOADS,
        ...INJECTION_PAYLOADS,
        ...FORMAT_PAYLOADS,
        ...OVERFLOW_PAYLOADS,
      ];

      allPayloads.forEach(payload => {
        expect(validTypes).toContain(payload.type);
      });
    });
  });

  describe('Boundary Payloads', () => {
    it('should include null values', () => {
      expect(BOUNDARY_PAYLOADS.some(p => p.value === null)).toBe(true);
    });

    it('should include empty string', () => {
      expect(BOUNDARY_PAYLOADS.some(p => p.value === '')).toBe(true);
    });

    it('should include zero', () => {
      expect(BOUNDARY_PAYLOADS.some(p => p.value === 0)).toBe(true);
    });

    it('should include negative numbers', () => {
      expect(BOUNDARY_PAYLOADS.some(p => typeof p.value === 'number' && p.value < 0)).toBe(true);
    });

    it('should include large numbers', () => {
      expect(BOUNDARY_PAYLOADS.some(p => typeof p.value === 'number' && p.value > 1000000)).toBe(true);
    });
  });

  describe('Injection Payloads', () => {
    it('should include SQL injection payloads', () => {
      expect(INJECTION_PAYLOADS.some(p => p.risk_indicator === 'sqli')).toBe(true);
    });

    it('should include XSS payloads', () => {
      expect(INJECTION_PAYLOADS.some(p => p.risk_indicator === 'xss')).toBe(true);
    });

    it('should include command injection payloads', () => {
      expect(INJECTION_PAYLOADS.some(p => p.risk_indicator === 'cmdi')).toBe(true);
    });

    it('should include template injection payloads', () => {
      expect(INJECTION_PAYLOADS.some(p => p.risk_indicator === 'ssti')).toBe(true);
    });
  });

  describe('Format Payloads', () => {
    it('should include path traversal payloads', () => {
      expect(FORMAT_PAYLOADS.some(p => p.risk_indicator === 'lfi')).toBe(true);
    });

    it('should include SSRF payloads', () => {
      expect(FORMAT_PAYLOADS.some(p => p.risk_indicator === 'ssrf')).toBe(true);
    });

    it('should include XXE payloads', () => {
      expect(FORMAT_PAYLOADS.some(p => p.risk_indicator === 'xxe')).toBe(true);
    });

    it('should include malformed JSON', () => {
      expect(FORMAT_PAYLOADS.some(p => p.description.toLowerCase().includes('json'))).toBe(true);
    });
  });

  describe('Overflow Payloads', () => {
    it('should include long strings', () => {
      expect(OVERFLOW_PAYLOADS.some(p => typeof p.value === 'string' && p.value.length > 100)).toBe(true);
    });

    it('should include very long strings', () => {
      expect(OVERFLOW_PAYLOADS.some(p => typeof p.value === 'string' && p.value.length > 10000)).toBe(true);
    });

    it('should include format string payloads', () => {
      expect(OVERFLOW_PAYLOADS.some(p => typeof p.value === 'string' && p.value.includes('%s'))).toBe(true);
    });
  });

  describe('Type Confusion Payloads', () => {
    it('should include string versions of numbers', () => {
      expect(TYPE_CONFUSION_PAYLOADS.some(p => p.value === '1')).toBe(true);
      expect(TYPE_CONFUSION_PAYLOADS.some(p => p.value === '0')).toBe(true);
    });

    it('should include string versions of booleans', () => {
      expect(TYPE_CONFUSION_PAYLOADS.some(p => p.value === 'true')).toBe(true);
      expect(TYPE_CONFUSION_PAYLOADS.some(p => p.value === 'false')).toBe(true);
    });

    it('should include arrays and objects', () => {
      expect(TYPE_CONFUSION_PAYLOADS.some(p => Array.isArray(p.value))).toBe(true);
      expect(TYPE_CONFUSION_PAYLOADS.some(p => typeof p.value === 'object' && !Array.isArray(p.value) && p.value !== null)).toBe(true);
    });
  });
});
