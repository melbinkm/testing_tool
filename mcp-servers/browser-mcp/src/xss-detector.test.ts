/**
 * Tests for XSS Detector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  XSSDetector,
  generateXSSMarker,
  createMarkedPayloads,
  DEFAULT_XSS_PAYLOADS,
} from './xss-detector.js';

describe('XSSDetector', () => {
  let detector: XSSDetector;

  beforeEach(() => {
    detector = new XSSDetector();
  });

  describe('generateXSSMarker', () => {
    it('should generate unique markers', () => {
      const marker1 = generateXSSMarker();
      const marker2 = generateXSSMarker();

      expect(marker1).not.toBe(marker2);
    });

    it('should include XSS_MARKER prefix', () => {
      const marker = generateXSSMarker();
      expect(marker).toMatch(/^XSS_MARKER_/);
    });

    it('should include timestamp', () => {
      const marker = generateXSSMarker();
      expect(marker).toMatch(/_\d+$/);
    });
  });

  describe('createMarkedPayloads', () => {
    it('should create payloads with the given marker', () => {
      const marker = 'TEST_MARKER';
      const payloads = createMarkedPayloads(marker);

      expect(payloads.length).toBeGreaterThan(0);
      payloads.forEach(payload => {
        expect(payload).toContain(marker);
      });
    });

    it('should include script-based payload', () => {
      const marker = 'TEST';
      const payloads = createMarkedPayloads(marker);

      expect(payloads.some(p => p.includes('<script>'))).toBe(true);
    });

    it('should include img-based payload', () => {
      const marker = 'TEST';
      const payloads = createMarkedPayloads(marker);

      expect(payloads.some(p => p.includes('<img'))).toBe(true);
    });

    it('should include svg-based payload', () => {
      const marker = 'TEST';
      const payloads = createMarkedPayloads(marker);

      expect(payloads.some(p => p.includes('<svg'))).toBe(true);
    });
  });

  describe('DEFAULT_XSS_PAYLOADS', () => {
    it('should have multiple payloads', () => {
      expect(DEFAULT_XSS_PAYLOADS.length).toBeGreaterThan(5);
    });

    it('should include script type payloads', () => {
      expect(DEFAULT_XSS_PAYLOADS.some(p => p.type === 'script')).toBe(true);
    });

    it('should include img type payloads', () => {
      expect(DEFAULT_XSS_PAYLOADS.some(p => p.type === 'img')).toBe(true);
    });

    it('should include svg type payloads', () => {
      expect(DEFAULT_XSS_PAYLOADS.some(p => p.type === 'svg')).toBe(true);
    });

    it('should include event type payloads', () => {
      expect(DEFAULT_XSS_PAYLOADS.some(p => p.type === 'event')).toBe(true);
    });

    it('should include javascript_uri type payloads', () => {
      expect(DEFAULT_XSS_PAYLOADS.some(p => p.type === 'javascript_uri')).toBe(true);
    });

    it('should have payloads for different contexts', () => {
      const contexts = new Set(DEFAULT_XSS_PAYLOADS.map(p => p.context));
      expect(contexts.has('html')).toBe(true);
      expect(contexts.has('attribute')).toBe(true);
      expect(contexts.has('javascript')).toBe(true);
      expect(contexts.has('url')).toBe(true);
    });
  });

  describe('XSSDetector class', () => {
    describe('constructor', () => {
      it('should generate marker if not provided', () => {
        const detector = new XSSDetector();
        expect(detector.getMarker()).toMatch(/^XSS_MARKER_/);
      });

      it('should use provided marker', () => {
        const detector = new XSSDetector('custom-marker');
        expect(detector.getMarker()).toBe('custom-marker');
      });
    });

    describe('getDefaultPayloadStrings', () => {
      it('should return array of payload strings', () => {
        const payloads = XSSDetector.getDefaultPayloadStrings();

        expect(Array.isArray(payloads)).toBe(true);
        expect(payloads.length).toBe(DEFAULT_XSS_PAYLOADS.length);
        payloads.forEach(p => {
          expect(typeof p).toBe('string');
        });
      });
    });

    describe('reset', () => {
      it('should generate new marker', () => {
        const oldMarker = detector.getMarker();
        detector.reset();
        const newMarker = detector.getMarker();

        expect(newMarker).not.toBe(oldMarker);
      });

      it('should reset dialog detection state', () => {
        // Initial state
        expect(detector.wasDialogDetected()).toBe(false);
        expect(detector.getDialogContent()).toBeNull();
      });

      it('should clear console messages', () => {
        expect(detector.getConsoleMessages()).toEqual([]);
      });
    });

    describe('wasDialogDetected', () => {
      it('should return false initially', () => {
        expect(detector.wasDialogDetected()).toBe(false);
      });
    });

    describe('getDialogContent', () => {
      it('should return null initially', () => {
        expect(detector.getDialogContent()).toBeNull();
      });
    });

    describe('getConsoleMessages', () => {
      it('should return empty array initially', () => {
        expect(detector.getConsoleMessages()).toEqual([]);
      });

      it('should return copy of messages', () => {
        const messages = detector.getConsoleMessages();
        messages.push('should not affect internal state');
        expect(detector.getConsoleMessages()).toEqual([]);
      });
    });
  });

  describe('payload coverage', () => {
    it('should have payloads for common XSS vectors', () => {
      const payloads = XSSDetector.getDefaultPayloadStrings();

      // Basic script tag
      expect(payloads.some(p => p.includes('<script>'))).toBe(true);

      // Event handlers
      expect(payloads.some(p => p.includes('onerror='))).toBe(true);
      expect(payloads.some(p => p.includes('onload='))).toBe(true);
      expect(payloads.some(p => p.includes('onmouseover='))).toBe(true);

      // SVG
      expect(payloads.some(p => p.includes('<svg'))).toBe(true);

      // JavaScript URI
      expect(payloads.some(p => p.includes('javascript:'))).toBe(true);

      // Attribute escape
      expect(payloads.some(p => p.includes('">'))).toBe(true);
    });

    it('should have payloads that work in different contexts', () => {
      const payloads = XSSDetector.getDefaultPayloadStrings();

      // HTML context escapes
      expect(payloads.some(p => p.startsWith('<'))).toBe(true);

      // Attribute context escapes
      expect(payloads.some(p => p.startsWith('"'))).toBe(true);
      expect(payloads.some(p => p.startsWith("'"))).toBe(true);

      // Script context escapes
      expect(payloads.some(p => p.includes("'-"))).toBe(true);
    });
  });
});

describe('XSSDetector with mock page', () => {
  it('should handle DOM reflection check', async () => {
    const detector = new XSSDetector('TEST_MARKER');

    // Create a mock page
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue(true),
    };

    const result = await detector.checkDOMReflection(mockPage as any, 'TEST_MARKER');
    expect(result).toBe(true);
    expect(mockPage.evaluate).toHaveBeenCalled();
  });

  it('should handle DOM reflection check failure', async () => {
    const detector = new XSSDetector('TEST_MARKER');

    const mockPage = {
      evaluate: vi.fn().mockRejectedValue(new Error('Page error')),
    };

    const result = await detector.checkDOMReflection(mockPage as any, 'TEST_MARKER');
    expect(result).toBe(false);
  });

  it('should handle element reflection check', async () => {
    const detector = new XSSDetector('TEST_MARKER');

    const mockPage = {
      evaluate: vi.fn().mockResolvedValue({ reflected: true, location: 'div#content' }),
    };

    const result = await detector.checkElementReflection(mockPage as any, 'TEST_MARKER');
    expect(result.reflected).toBe(true);
    expect(result.location).toBe('div#content');
  });

  it('should handle attribute injection check', async () => {
    const detector = new XSSDetector('TEST_MARKER');

    const mockPage = {
      evaluate: vi.fn().mockResolvedValue(true),
    };

    const result = await detector.checkAttributeInjection(mockPage as any, 'TEST_MARKER');
    expect(result).toBe(true);
  });
});
