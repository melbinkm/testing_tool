/**
 * Form Analyzer
 * Discovers and analyzes forms on web pages
 */

import type { Page } from 'playwright';
import type { DiscoveredForm, FormField } from './types.js';
import { FormNotFoundError, FieldNotFoundError } from './errors.js';
import crypto from 'crypto';

/**
 * Form Analyzer class for discovering and analyzing forms
 */
export class FormAnalyzer {
  /**
   * Discover all forms on the current page
   */
  async discoverForms(page: Page): Promise<DiscoveredForm[]> {
    const forms = await page.evaluate(() => {
      const formElements = Array.from(document.querySelectorAll('form'));

      return formElements.map((form, index) => {
        // Generate a unique selector for the form
        let selector = 'form';
        if (form.id) {
          selector = `#${form.id}`;
        } else if (form.name) {
          selector = `form[name="${form.name}"]`;
        } else if (form.action) {
          selector = `form[action="${form.action}"]`;
        } else {
          selector = `form:nth-of-type(${index + 1})`;
        }

        // Get form fields
        const fieldElements = Array.from(
          form.querySelectorAll('input, textarea, select')
        ) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

        const fields = fieldElements
          .filter(field => {
            // Skip hidden, submit, and button types for XSS testing purposes
            const type = (field as HTMLInputElement).type?.toLowerCase() || '';
            return !['hidden', 'submit', 'button', 'image', 'reset'].includes(type);
          })
          .map(field => {
            const inputField = field as HTMLInputElement;
            const result: {
              name: string;
              type: string;
              id?: string;
              placeholder?: string;
              required: boolean;
              value?: string;
              options?: string[];
            } = {
              name: field.name || field.id || '',
              type: inputField.type || field.tagName.toLowerCase(),
              required: field.required,
            };

            if (field.id) {
              result.id = field.id;
            }

            if (inputField.placeholder) {
              result.placeholder = inputField.placeholder;
            }

            if (field.tagName === 'SELECT') {
              const selectField = field as HTMLSelectElement;
              result.options = Array.from(selectField.options).map(opt => opt.value);
            }

            return result;
          });

        // Find submit button
        let submitButton: { text?: string; selector: string } | undefined;
        const submitBtn =
          form.querySelector('button[type="submit"]') ||
          form.querySelector('input[type="submit"]') ||
          form.querySelector('button:not([type])');

        if (submitBtn) {
          submitButton = {
            text:
              submitBtn.textContent?.trim() ||
              (submitBtn as HTMLInputElement).value ||
              undefined,
            selector: submitBtn.id
              ? `#${submitBtn.id}`
              : submitBtn.className
                ? `.${submitBtn.className.split(' ')[0]}`
                : `${selector} button[type="submit"], ${selector} input[type="submit"]`,
          };
        }

        return {
          action: form.action || '',
          method: (form.method?.toUpperCase() as 'GET' | 'POST') || 'GET',
          fields,
          submit_button: submitButton,
          selector,
        };
      });
    });

    // Add unique IDs to forms
    return forms.map((form, index) => ({
      ...form,
      form_id: `form-${index + 1}-${crypto.randomUUID().slice(0, 8)}`,
    }));
  }

  /**
   * Get a specific form by selector
   */
  async getForm(page: Page, selector: string): Promise<DiscoveredForm | null> {
    const forms = await this.discoverForms(page);
    return forms.find(f => f.selector === selector) || null;
  }

  /**
   * Get form by ID
   */
  async getFormById(page: Page, formId: string): Promise<DiscoveredForm | null> {
    const forms = await this.discoverForms(page);
    return forms.find(f => f.form_id === formId) || null;
  }

  /**
   * Find a form containing a specific field
   */
  async findFormWithField(page: Page, fieldName: string): Promise<DiscoveredForm | null> {
    const forms = await this.discoverForms(page);
    return (
      forms.find(form => form.fields.some(f => f.name === fieldName || f.id === fieldName)) || null
    );
  }

  /**
   * Get the selector for a specific field within a form
   */
  getFieldSelector(form: DiscoveredForm, fieldName: string): string {
    const field = form.fields.find(f => f.name === fieldName || f.id === fieldName);

    if (!field) {
      throw new FieldNotFoundError(fieldName, form.selector);
    }

    // Prefer ID-based selector
    if (field.id) {
      return `#${field.id}`;
    }

    // Fall back to name-based selector within form
    if (field.name) {
      return `${form.selector} [name="${field.name}"]`;
    }

    // Last resort: type-based selector
    return `${form.selector} input[type="${field.type}"]`;
  }

  /**
   * Get all testable fields from a form (text-like inputs)
   */
  getTestableFields(form: DiscoveredForm): FormField[] {
    const testableTypes = [
      'text',
      'email',
      'search',
      'url',
      'tel',
      'password',
      'textarea',
      'number',
    ];

    return form.fields.filter(f => testableTypes.includes(f.type.toLowerCase()));
  }

  /**
   * Fill a form with test data
   */
  async fillForm(
    page: Page,
    form: DiscoveredForm,
    data: Record<string, string>
  ): Promise<void> {
    for (const [fieldName, value] of Object.entries(data)) {
      try {
        const selector = this.getFieldSelector(form, fieldName);
        await page.fill(selector, value);
      } catch (error) {
        if (error instanceof FieldNotFoundError) {
          console.warn(`[form-analyzer] Field not found: ${fieldName}`);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Submit a form
   */
  async submitForm(
    page: Page,
    form: DiscoveredForm,
    waitForNavigation: boolean = true
  ): Promise<void> {
    if (form.submit_button) {
      if (waitForNavigation) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
          page.click(form.submit_button.selector),
        ]);
      } else {
        await page.click(form.submit_button.selector);
      }
    } else {
      // Try to submit using keyboard
      const firstField = form.fields[0];
      if (firstField) {
        const selector = this.getFieldSelector(form, firstField.name || firstField.id || '');
        await page.focus(selector);
        await page.keyboard.press('Enter');
      }
    }
  }

  /**
   * Analyze form for potential security issues
   */
  async analyzeFormSecurity(
    page: Page,
    form: DiscoveredForm
  ): Promise<{
    hasCSRFToken: boolean;
    isHTTPS: boolean;
    hasAutocomplete: boolean;
    potentialIssues: string[];
  }> {
    const issues: string[] = [];

    // Check for CSRF token
    const hasCSRFToken = await page.evaluate((sel: string) => {
      const formEl = document.querySelector(sel) as HTMLFormElement;
      if (!formEl) return false;

      const csrfFields = formEl.querySelectorAll(
        'input[name*="csrf"], input[name*="token"], input[name*="_token"], input[name*="authenticity"]'
      );
      return csrfFields.length > 0;
    }, form.selector);

    if (!hasCSRFToken && form.method === 'POST') {
      issues.push('POST form may be missing CSRF protection');
    }

    // Check if form submits to HTTPS
    const isHTTPS = form.action.startsWith('https://') || form.action.startsWith('/');

    if (!isHTTPS && form.action.startsWith('http://')) {
      issues.push('Form submits over insecure HTTP');
    }

    // Check autocomplete on sensitive fields
    const hasAutocomplete = form.fields.some(
      f => f.type === 'password' && !f.name.includes('autocomplete')
    );

    if (hasAutocomplete) {
      issues.push('Password field may have autocomplete enabled');
    }

    return {
      hasCSRFToken,
      isHTTPS,
      hasAutocomplete,
      potentialIssues: issues,
    };
  }

  /**
   * Count total forms on page
   */
  async countForms(page: Page): Promise<number> {
    return page.evaluate(() => document.querySelectorAll('form').length);
  }

  /**
   * Check if a specific form exists
   */
  async formExists(page: Page, selector: string): Promise<boolean> {
    const element = await page.$(selector);
    return element !== null;
  }

  /**
   * Validate form selector exists, throw if not
   */
  async validateFormSelector(page: Page, selector: string): Promise<void> {
    const exists = await this.formExists(page, selector);
    if (!exists) {
      throw new FormNotFoundError(selector);
    }
  }
}
