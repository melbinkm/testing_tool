/**
 * Tests for Form Analyzer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FormAnalyzer } from './form-analyzer.js';
import { FormNotFoundError, FieldNotFoundError } from './errors.js';
import type { DiscoveredForm } from './types.js';

describe('FormAnalyzer', () => {
  let analyzer: FormAnalyzer;

  beforeEach(() => {
    analyzer = new FormAnalyzer();
  });

  describe('discoverForms', () => {
    it('should discover forms on page', async () => {
      const mockForms = [
        {
          action: '/login',
          method: 'POST',
          fields: [
            { name: 'username', type: 'text', required: true },
            { name: 'password', type: 'password', required: true },
          ],
          submit_button: { text: 'Login', selector: '#submit' },
          selector: '#login-form',
        },
      ];

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(mockForms),
      };

      const forms = await analyzer.discoverForms(mockPage as any);

      expect(forms.length).toBe(1);
      expect(forms[0].action).toBe('/login');
      expect(forms[0].method).toBe('POST');
      expect(forms[0].fields.length).toBe(2);
      expect(forms[0].form_id).toMatch(/^form-1-/);
    });

    it('should handle page with no forms', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue([]),
      };

      const forms = await analyzer.discoverForms(mockPage as any);

      expect(forms.length).toBe(0);
    });

    it('should assign unique form IDs', async () => {
      const mockForms = [
        { action: '/form1', method: 'POST', fields: [], selector: '#form1' },
        { action: '/form2', method: 'GET', fields: [], selector: '#form2' },
      ];

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(mockForms),
      };

      const forms = await analyzer.discoverForms(mockPage as any);

      expect(forms[0].form_id).toMatch(/^form-1-/);
      expect(forms[1].form_id).toMatch(/^form-2-/);
      expect(forms[0].form_id).not.toBe(forms[1].form_id);
    });
  });

  describe('getFieldSelector', () => {
    const mockForm: DiscoveredForm = {
      form_id: 'test-form',
      action: '/submit',
      method: 'POST',
      fields: [
        { name: 'email', type: 'email', id: 'email-input', required: true },
        { name: 'message', type: 'textarea', required: false },
        { name: '', type: 'text', required: false },
      ],
      selector: '#contact-form',
    };

    it('should prefer ID-based selector', () => {
      const selector = analyzer.getFieldSelector(mockForm, 'email');

      expect(selector).toBe('#email-input');
    });

    it('should fall back to name-based selector', () => {
      const selector = analyzer.getFieldSelector(mockForm, 'message');

      expect(selector).toBe('#contact-form [name="message"]');
    });

    it('should throw FieldNotFoundError for unknown field', () => {
      expect(() => analyzer.getFieldSelector(mockForm, 'unknown')).toThrow(FieldNotFoundError);
    });

    it('should include form selector in error', () => {
      try {
        analyzer.getFieldSelector(mockForm, 'unknown');
      } catch (error) {
        expect(error).toBeInstanceOf(FieldNotFoundError);
        expect((error as FieldNotFoundError).formSelector).toBe('#contact-form');
      }
    });
  });

  describe('getTestableFields', () => {
    const mockForm: DiscoveredForm = {
      form_id: 'test-form',
      action: '/submit',
      method: 'POST',
      fields: [
        { name: 'username', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'tel', required: false },
        { name: 'search', type: 'search', required: false },
        { name: 'password', type: 'password', required: true },
        { name: 'bio', type: 'textarea', required: false },
        { name: 'age', type: 'number', required: false },
        { name: 'remember', type: 'checkbox', required: false },
        { name: 'gender', type: 'radio', required: false },
        { name: 'avatar', type: 'file', required: false },
      ],
      selector: '#user-form',
    };

    it('should return text-like fields only', () => {
      const testable = analyzer.getTestableFields(mockForm);

      expect(testable.length).toBe(7);
      expect(testable.map(f => f.name)).toContain('username');
      expect(testable.map(f => f.name)).toContain('email');
      expect(testable.map(f => f.name)).toContain('phone');
      expect(testable.map(f => f.name)).toContain('search');
      expect(testable.map(f => f.name)).toContain('password');
      expect(testable.map(f => f.name)).toContain('bio');
      expect(testable.map(f => f.name)).toContain('age');
    });

    it('should exclude checkbox and radio fields', () => {
      const testable = analyzer.getTestableFields(mockForm);

      expect(testable.map(f => f.name)).not.toContain('remember');
      expect(testable.map(f => f.name)).not.toContain('gender');
    });

    it('should exclude file fields', () => {
      const testable = analyzer.getTestableFields(mockForm);

      expect(testable.map(f => f.name)).not.toContain('avatar');
    });
  });

  describe('fillForm', () => {
    it('should fill form fields', async () => {
      const mockForm: DiscoveredForm = {
        form_id: 'test-form',
        action: '/submit',
        method: 'POST',
        fields: [
          { name: 'username', type: 'text', id: 'username', required: true },
          { name: 'email', type: 'email', id: 'email', required: true },
        ],
        selector: '#form',
      };

      const mockPage = {
        fill: vi.fn().mockResolvedValue(undefined),
      };

      await analyzer.fillForm(mockPage as any, mockForm, {
        username: 'testuser',
        email: 'test@example.com',
      });

      expect(mockPage.fill).toHaveBeenCalledTimes(2);
      expect(mockPage.fill).toHaveBeenCalledWith('#username', 'testuser');
      expect(mockPage.fill).toHaveBeenCalledWith('#email', 'test@example.com');
    });

    it('should handle missing fields gracefully', async () => {
      const mockForm: DiscoveredForm = {
        form_id: 'test-form',
        action: '/submit',
        method: 'POST',
        fields: [{ name: 'username', type: 'text', id: 'username', required: true }],
        selector: '#form',
      };

      const mockPage = {
        fill: vi.fn().mockResolvedValue(undefined),
      };

      // Should not throw even with unknown field
      await analyzer.fillForm(mockPage as any, mockForm, {
        username: 'testuser',
        nonexistent: 'value',
      });

      expect(mockPage.fill).toHaveBeenCalledTimes(1);
    });
  });

  describe('submitForm', () => {
    it('should click submit button', async () => {
      const mockForm: DiscoveredForm = {
        form_id: 'test-form',
        action: '/submit',
        method: 'POST',
        fields: [],
        submit_button: { text: 'Submit', selector: '#submit-btn' },
        selector: '#form',
      };

      const mockPage = {
        waitForNavigation: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
      };

      await analyzer.submitForm(mockPage as any, mockForm);

      expect(mockPage.click).toHaveBeenCalledWith('#submit-btn');
    });

    it('should handle form without submit button', async () => {
      const mockForm: DiscoveredForm = {
        form_id: 'test-form',
        action: '/submit',
        method: 'POST',
        fields: [{ name: 'query', type: 'text', id: 'query', required: true }],
        selector: '#form',
      };

      const mockPage = {
        focus: vi.fn().mockResolvedValue(undefined),
        keyboard: {
          press: vi.fn().mockResolvedValue(undefined),
        },
      };

      await analyzer.submitForm(mockPage as any, mockForm, false);

      expect(mockPage.focus).toHaveBeenCalledWith('#query');
      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Enter');
    });
  });

  describe('countForms', () => {
    it('should return form count', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(3),
      };

      const count = await analyzer.countForms(mockPage as any);

      expect(count).toBe(3);
    });
  });

  describe('formExists', () => {
    it('should return true for existing form', async () => {
      const mockPage = {
        $: vi.fn().mockResolvedValue({}),
      };

      const exists = await analyzer.formExists(mockPage as any, '#my-form');

      expect(exists).toBe(true);
    });

    it('should return false for non-existing form', async () => {
      const mockPage = {
        $: vi.fn().mockResolvedValue(null),
      };

      const exists = await analyzer.formExists(mockPage as any, '#unknown-form');

      expect(exists).toBe(false);
    });
  });

  describe('validateFormSelector', () => {
    it('should not throw for existing form', async () => {
      const mockPage = {
        $: vi.fn().mockResolvedValue({}),
      };

      await expect(analyzer.validateFormSelector(mockPage as any, '#my-form')).resolves.toBeUndefined();
    });

    it('should throw FormNotFoundError for non-existing form', async () => {
      const mockPage = {
        $: vi.fn().mockResolvedValue(null),
      };

      await expect(analyzer.validateFormSelector(mockPage as any, '#unknown-form')).rejects.toThrow(
        FormNotFoundError
      );
    });
  });

  describe('findFormWithField', () => {
    it('should find form containing field', async () => {
      const mockForms = [
        {
          action: '/search',
          method: 'GET',
          fields: [{ name: 'q', type: 'text', required: false }],
          selector: '#search-form',
        },
        {
          action: '/contact',
          method: 'POST',
          fields: [{ name: 'email', type: 'email', required: true }],
          selector: '#contact-form',
        },
      ];

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(mockForms),
      };

      const form = await analyzer.findFormWithField(mockPage as any, 'email');

      expect(form).not.toBeNull();
      expect(form?.selector).toBe('#contact-form');
    });

    it('should return null if field not found', async () => {
      const mockForms = [
        {
          action: '/search',
          method: 'GET',
          fields: [{ name: 'q', type: 'text', required: false }],
          selector: '#search-form',
        },
      ];

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(mockForms),
      };

      const form = await analyzer.findFormWithField(mockPage as any, 'nonexistent');

      expect(form).toBeNull();
    });
  });

  describe('analyzeFormSecurity', () => {
    const mockForm: DiscoveredForm = {
      form_id: 'test-form',
      action: '/login',
      method: 'POST',
      fields: [
        { name: 'username', type: 'text', required: true },
        { name: 'password', type: 'password', required: true },
      ],
      selector: '#login-form',
    };

    it('should detect missing CSRF token', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(false),
      };

      const analysis = await analyzer.analyzeFormSecurity(mockPage as any, mockForm);

      expect(analysis.hasCSRFToken).toBe(false);
      expect(analysis.potentialIssues).toContain('POST form may be missing CSRF protection');
    });

    it('should detect CSRF token', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(true),
      };

      const analysis = await analyzer.analyzeFormSecurity(mockPage as any, mockForm);

      expect(analysis.hasCSRFToken).toBe(true);
    });

    it('should detect insecure HTTP form action', async () => {
      const insecureForm: DiscoveredForm = {
        ...mockForm,
        action: 'http://example.com/login',
      };

      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(true),
      };

      const analysis = await analyzer.analyzeFormSecurity(mockPage as any, insecureForm);

      expect(analysis.isHTTPS).toBe(false);
      expect(analysis.potentialIssues).toContain('Form submits over insecure HTTP');
    });
  });
});
