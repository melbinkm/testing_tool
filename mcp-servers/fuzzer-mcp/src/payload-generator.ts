/**
 * Payload Generator
 * Generates fuzz payloads for various attack types
 */

import {
  PayloadType,
  FuzzPayload,
  ParameterDefinition,
} from './types.js';

/**
 * Boundary value payloads - test edge cases
 */
const BOUNDARY_PAYLOADS: FuzzPayload[] = [
  { value: '', type: 'boundary', description: 'Empty string' },
  { value: null, type: 'boundary', description: 'Null value' },
  { value: undefined, type: 'boundary', description: 'Undefined value' },
  { value: 0, type: 'boundary', description: 'Zero' },
  { value: -1, type: 'boundary', description: 'Negative one' },
  { value: 1, type: 'boundary', description: 'One' },
  { value: -2147483648, type: 'boundary', description: 'INT32_MIN' },
  { value: 2147483647, type: 'boundary', description: 'INT32_MAX' },
  { value: -9007199254740991, type: 'boundary', description: 'JS MIN_SAFE_INTEGER' },
  { value: 9007199254740991, type: 'boundary', description: 'JS MAX_SAFE_INTEGER' },
  { value: Number.MAX_VALUE, type: 'boundary', description: 'MAX_VALUE' },
  { value: Number.MIN_VALUE, type: 'boundary', description: 'MIN_VALUE' },
  { value: Infinity, type: 'boundary', description: 'Infinity' },
  { value: -Infinity, type: 'boundary', description: 'Negative Infinity' },
  { value: NaN, type: 'boundary', description: 'NaN' },
  { value: ' ', type: 'boundary', description: 'Single space' },
  { value: '   ', type: 'boundary', description: 'Multiple spaces' },
  { value: '\t', type: 'boundary', description: 'Tab character' },
  { value: '\n', type: 'boundary', description: 'Newline character' },
  { value: '\r\n', type: 'boundary', description: 'CRLF' },
  { value: '\0', type: 'boundary', description: 'Null byte' },
  { value: [], type: 'boundary', description: 'Empty array' },
  { value: {}, type: 'boundary', description: 'Empty object' },
  { value: [null], type: 'boundary', description: 'Array with null' },
  { value: false, type: 'boundary', description: 'Boolean false' },
  { value: true, type: 'boundary', description: 'Boolean true' },
];

/**
 * Type confusion payloads - test type handling
 */
const TYPE_CONFUSION_PAYLOADS: FuzzPayload[] = [
  { value: '1', type: 'type_confusion', description: 'String one (for numeric)' },
  { value: '0', type: 'type_confusion', description: 'String zero (for numeric)' },
  { value: '-1', type: 'type_confusion', description: 'String negative one' },
  { value: 'true', type: 'type_confusion', description: 'String true' },
  { value: 'false', type: 'type_confusion', description: 'String false' },
  { value: 'null', type: 'type_confusion', description: 'String null' },
  { value: 'undefined', type: 'type_confusion', description: 'String undefined' },
  { value: 1, type: 'type_confusion', description: 'Number for string' },
  { value: true, type: 'type_confusion', description: 'Boolean for string' },
  { value: ['array'], type: 'type_confusion', description: 'Array for string' },
  { value: { key: 'value' }, type: 'type_confusion', description: 'Object for string' },
  { value: '{"json":"string"}', type: 'type_confusion', description: 'JSON string' },
  { value: '[1,2,3]', type: 'type_confusion', description: 'Array string' },
  { value: '1.5', type: 'type_confusion', description: 'Decimal string' },
  { value: '1e10', type: 'type_confusion', description: 'Scientific notation string' },
  { value: '0x10', type: 'type_confusion', description: 'Hex string' },
  { value: '0b10', type: 'type_confusion', description: 'Binary string' },
  { value: '0o10', type: 'type_confusion', description: 'Octal string' },
];

/**
 * Injection payloads - test for various injection vulnerabilities
 */
const INJECTION_PAYLOADS: FuzzPayload[] = [
  // SQL Injection
  { value: "'", type: 'injection', description: 'Single quote (SQL)', risk_indicator: 'sqli' },
  { value: "''", type: 'injection', description: 'Double single quote (SQL)', risk_indicator: 'sqli' },
  { value: "' OR '1'='1", type: 'injection', description: 'SQL OR injection', risk_indicator: 'sqli' },
  { value: "' OR 1=1--", type: 'injection', description: 'SQL comment injection', risk_indicator: 'sqli' },
  { value: "'; DROP TABLE users;--", type: 'injection', description: 'SQL DROP injection', risk_indicator: 'sqli' },
  { value: "1' AND '1'='1", type: 'injection', description: 'SQL AND injection', risk_indicator: 'sqli' },
  { value: "1; SELECT * FROM users", type: 'injection', description: 'SQL UNION injection', risk_indicator: 'sqli' },
  { value: "/**/", type: 'injection', description: 'SQL comment', risk_indicator: 'sqli' },
  { value: "1/**/OR/**/1=1", type: 'injection', description: 'SQL comment bypass', risk_indicator: 'sqli' },

  // XSS
  { value: '<script>alert(1)</script>', type: 'injection', description: 'XSS script tag', risk_indicator: 'xss' },
  { value: '"><script>alert(1)</script>', type: 'injection', description: 'XSS attribute break', risk_indicator: 'xss' },
  { value: "javascript:alert(1)", type: 'injection', description: 'XSS javascript URI', risk_indicator: 'xss' },
  { value: '<img src=x onerror=alert(1)>', type: 'injection', description: 'XSS img onerror', risk_indicator: 'xss' },
  { value: '<svg onload=alert(1)>', type: 'injection', description: 'XSS svg onload', risk_indicator: 'xss' },
  { value: "'+alert(1)+'", type: 'injection', description: 'XSS string context', risk_indicator: 'xss' },
  { value: '</title><script>alert(1)</script>', type: 'injection', description: 'XSS title break', risk_indicator: 'xss' },

  // Command Injection
  { value: '; ls', type: 'injection', description: 'Command injection semicolon', risk_indicator: 'cmdi' },
  { value: '| ls', type: 'injection', description: 'Command injection pipe', risk_indicator: 'cmdi' },
  { value: '`ls`', type: 'injection', description: 'Command injection backtick', risk_indicator: 'cmdi' },
  { value: '$(ls)', type: 'injection', description: 'Command injection subshell', risk_indicator: 'cmdi' },
  { value: '& ls', type: 'injection', description: 'Command injection ampersand', risk_indicator: 'cmdi' },
  { value: '\n ls', type: 'injection', description: 'Command injection newline', risk_indicator: 'cmdi' },

  // LDAP Injection
  { value: '*', type: 'injection', description: 'LDAP wildcard', risk_indicator: 'ldapi' },
  { value: '*)(&', type: 'injection', description: 'LDAP filter injection', risk_indicator: 'ldapi' },

  // XPath Injection
  { value: "' or '1'='1", type: 'injection', description: 'XPath injection', risk_indicator: 'xpathi' },

  // Template Injection
  { value: '{{7*7}}', type: 'injection', description: 'Template injection (Jinja/Django)', risk_indicator: 'ssti' },
  { value: '${7*7}', type: 'injection', description: 'Template injection (Spring/Freemarker)', risk_indicator: 'ssti' },
  { value: '#{7*7}', type: 'injection', description: 'Template injection (Ruby/ERB)', risk_indicator: 'ssti' },
  { value: '<%= 7*7 %>', type: 'injection', description: 'Template injection (ASP/EJS)', risk_indicator: 'ssti' },
];

/**
 * Format payloads - test input format handling
 */
const FORMAT_PAYLOADS: FuzzPayload[] = [
  // JSON
  { value: '{', type: 'format', description: 'Incomplete JSON object' },
  { value: '[', type: 'format', description: 'Incomplete JSON array' },
  { value: '{"key": }', type: 'format', description: 'Invalid JSON value' },
  { value: '{"key": undefined}', type: 'format', description: 'JSON with undefined' },
  { value: "{'key': 'value'}", type: 'format', description: 'JSON with single quotes' },

  // XML
  { value: '<?xml version="1.0"?>', type: 'format', description: 'XML declaration' },
  { value: '<!DOCTYPE foo>', type: 'format', description: 'DOCTYPE declaration' },
  { value: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>', type: 'format', description: 'XXE payload', risk_indicator: 'xxe' },
  { value: '<![CDATA[<script>alert(1)</script>]]>', type: 'format', description: 'CDATA with script' },
  { value: '&lt;script&gt;', type: 'format', description: 'HTML entities' },

  // Path traversal
  { value: '../', type: 'format', description: 'Path traversal', risk_indicator: 'lfi' },
  { value: '..\\', type: 'format', description: 'Path traversal (Windows)', risk_indicator: 'lfi' },
  { value: '....//....//etc/passwd', type: 'format', description: 'Nested path traversal', risk_indicator: 'lfi' },
  { value: '/etc/passwd', type: 'format', description: 'Absolute path', risk_indicator: 'lfi' },
  { value: 'file:///etc/passwd', type: 'format', description: 'File URI', risk_indicator: 'lfi' },

  // URL/Protocol
  { value: 'http://127.0.0.1', type: 'format', description: 'SSRF localhost', risk_indicator: 'ssrf' },
  { value: 'http://169.254.169.254', type: 'format', description: 'SSRF AWS metadata', risk_indicator: 'ssrf' },
  { value: 'gopher://localhost', type: 'format', description: 'Gopher protocol', risk_indicator: 'ssrf' },
  { value: 'dict://localhost:11211', type: 'format', description: 'Dict protocol', risk_indicator: 'ssrf' },

  // Unicode
  { value: '\u0000', type: 'format', description: 'Unicode null' },
  { value: '\uFFFD', type: 'format', description: 'Unicode replacement char' },
  { value: '\uD800', type: 'format', description: 'Unicode surrogate' },
  { value: '™®©', type: 'format', description: 'Unicode symbols' },
  { value: '你好', type: 'format', description: 'Chinese characters' },
  { value: '🔥', type: 'format', description: 'Emoji' },
];

/**
 * Overflow payloads - test buffer/size limits
 */
const OVERFLOW_PAYLOADS: FuzzPayload[] = [
  { value: 'A'.repeat(256), type: 'overflow', description: 'Long string (256)' },
  { value: 'A'.repeat(1024), type: 'overflow', description: 'Long string (1024)' },
  { value: 'A'.repeat(4096), type: 'overflow', description: 'Long string (4096)' },
  { value: 'A'.repeat(65536), type: 'overflow', description: 'Long string (65536)' },
  { value: 'A'.repeat(1000000), type: 'overflow', description: 'Long string (1M)' },
  { value: '%s'.repeat(100), type: 'overflow', description: 'Format string attack' },
  { value: '%n'.repeat(100), type: 'overflow', description: 'Format string write' },
  { value: '%x'.repeat(100), type: 'overflow', description: 'Format string hex' },
  { value: Array(100).fill('a').join(','), type: 'overflow', description: 'Many array elements' },
  { value: Array(1000).fill('a').join(','), type: 'overflow', description: 'Many array elements (1000)' },
  { value: '0'.repeat(1000), type: 'overflow', description: 'Large number string' },
  { value: '9'.repeat(1000), type: 'overflow', description: 'Large decimal string' },
];

/**
 * All payloads by type
 */
const PAYLOADS_BY_TYPE: Record<PayloadType, FuzzPayload[]> = {
  boundary: BOUNDARY_PAYLOADS,
  type_confusion: TYPE_CONFUSION_PAYLOADS,
  injection: INJECTION_PAYLOADS,
  format: FORMAT_PAYLOADS,
  overflow: OVERFLOW_PAYLOADS,
};

export class PayloadGenerator {
  private maxPayloads: number;

  constructor(maxPayloads: number = 100) {
    this.maxPayloads = maxPayloads;
  }

  /**
   * Get all payloads of a specific type
   */
  getPayloadsByType(type: PayloadType): FuzzPayload[] {
    return PAYLOADS_BY_TYPE[type] || [];
  }

  /**
   * Get all available payload types
   */
  getPayloadTypes(): PayloadType[] {
    return Object.keys(PAYLOADS_BY_TYPE) as PayloadType[];
  }

  /**
   * Get payloads for multiple types
   */
  getPayloads(types?: PayloadType[]): FuzzPayload[] {
    const targetTypes = types || this.getPayloadTypes();
    const payloads: FuzzPayload[] = [];

    for (const type of targetTypes) {
      payloads.push(...this.getPayloadsByType(type));
    }

    return payloads.slice(0, this.maxPayloads);
  }

  /**
   * Generate payloads based on parameter definition (schema-aware)
   */
  generateForParameter(param: ParameterDefinition, types?: PayloadType[]): FuzzPayload[] {
    const payloads: FuzzPayload[] = [];
    const targetTypes = types || this.getPayloadTypes();

    // Add boundary payloads if requested
    if (targetTypes.includes('boundary')) {
      payloads.push(...this.generateBoundaryPayloads(param));
    }

    // Add type confusion payloads if requested
    if (targetTypes.includes('type_confusion')) {
      payloads.push(...this.generateTypeConfusionPayloads(param));
    }

    // Add injection payloads if requested (for string types)
    if (targetTypes.includes('injection') && this.isStringType(param.type)) {
      payloads.push(...INJECTION_PAYLOADS);
    }

    // Add format payloads if requested
    if (targetTypes.includes('format')) {
      payloads.push(...this.generateFormatPayloads(param));
    }

    // Add overflow payloads if requested (for string types)
    if (targetTypes.includes('overflow') && this.isStringType(param.type)) {
      payloads.push(...this.generateOverflowPayloads(param));
    }

    return payloads.slice(0, this.maxPayloads);
  }

  /**
   * Check if type is string-like
   */
  private isStringType(type: string): boolean {
    return ['string', 'text', 'varchar', 'char'].includes(type.toLowerCase());
  }

  /**
   * Generate boundary payloads based on parameter constraints
   */
  private generateBoundaryPayloads(param: ParameterDefinition): FuzzPayload[] {
    const payloads: FuzzPayload[] = [...BOUNDARY_PAYLOADS];

    // Add enum boundaries if available
    if (param.enum && param.enum.length > 0) {
      payloads.push({
        value: 'invalid_enum_value_12345',
        type: 'boundary',
        description: 'Invalid enum value',
      });
    }

    // Add numeric boundaries based on constraints
    if (param.minimum !== undefined) {
      payloads.push({
        value: param.minimum - 1,
        type: 'boundary',
        description: `Below minimum (${param.minimum})`,
      });
      payloads.push({
        value: param.minimum,
        type: 'boundary',
        description: `At minimum (${param.minimum})`,
      });
    }

    if (param.maximum !== undefined) {
      payloads.push({
        value: param.maximum + 1,
        type: 'boundary',
        description: `Above maximum (${param.maximum})`,
      });
      payloads.push({
        value: param.maximum,
        type: 'boundary',
        description: `At maximum (${param.maximum})`,
      });
    }

    // Add string length boundaries
    if (param.minLength !== undefined) {
      if (param.minLength > 0) {
        payloads.push({
          value: 'x'.repeat(param.minLength - 1),
          type: 'boundary',
          description: `Below minLength (${param.minLength})`,
        });
      }
      payloads.push({
        value: 'x'.repeat(param.minLength),
        type: 'boundary',
        description: `At minLength (${param.minLength})`,
      });
    }

    if (param.maxLength !== undefined) {
      payloads.push({
        value: 'x'.repeat(param.maxLength),
        type: 'boundary',
        description: `At maxLength (${param.maxLength})`,
      });
      payloads.push({
        value: 'x'.repeat(param.maxLength + 1),
        type: 'boundary',
        description: `Above maxLength (${param.maxLength})`,
      });
    }

    return payloads;
  }

  /**
   * Generate type confusion payloads based on parameter type
   */
  private generateTypeConfusionPayloads(param: ParameterDefinition): FuzzPayload[] {
    const payloads: FuzzPayload[] = [...TYPE_CONFUSION_PAYLOADS];
    const type = param.type.toLowerCase();

    // Add specific confusions based on type
    switch (type) {
      case 'integer':
      case 'number':
        payloads.push(
          { value: '1.5', type: 'type_confusion', description: 'Float for integer' },
          { value: 'one', type: 'type_confusion', description: 'Word for number' }
        );
        break;
      case 'boolean':
        payloads.push(
          { value: '1', type: 'type_confusion', description: 'String 1 for boolean' },
          { value: '0', type: 'type_confusion', description: 'String 0 for boolean' },
          { value: 'yes', type: 'type_confusion', description: 'String yes for boolean' },
          { value: 'no', type: 'type_confusion', description: 'String no for boolean' }
        );
        break;
      case 'array':
        payloads.push(
          { value: 'not_an_array', type: 'type_confusion', description: 'String for array' },
          { value: '[]', type: 'type_confusion', description: 'Empty array string' }
        );
        break;
      case 'object':
        payloads.push(
          { value: 'not_an_object', type: 'type_confusion', description: 'String for object' },
          { value: '{}', type: 'type_confusion', description: 'Empty object string' }
        );
        break;
    }

    return payloads;
  }

  /**
   * Generate format payloads based on parameter format
   */
  private generateFormatPayloads(param: ParameterDefinition): FuzzPayload[] {
    const payloads: FuzzPayload[] = [...FORMAT_PAYLOADS];
    const format = (param.format || '').toLowerCase();

    switch (format) {
      case 'email':
        payloads.push(
          { value: 'invalid@', type: 'format', description: 'Incomplete email' },
          { value: '@invalid.com', type: 'format', description: 'Email without user' },
          { value: 'test@test@test.com', type: 'format', description: 'Double @ in email' }
        );
        break;
      case 'uri':
      case 'url':
        payloads.push(
          { value: 'not-a-url', type: 'format', description: 'Invalid URL' },
          { value: 'javascript:alert(1)', type: 'format', description: 'JavaScript URL', risk_indicator: 'xss' }
        );
        break;
      case 'date':
      case 'date-time':
        payloads.push(
          { value: 'not-a-date', type: 'format', description: 'Invalid date' },
          { value: '9999-99-99', type: 'format', description: 'Invalid date values' },
          { value: '0000-00-00', type: 'format', description: 'Zero date' }
        );
        break;
      case 'uuid':
        payloads.push(
          { value: 'not-a-uuid', type: 'format', description: 'Invalid UUID' },
          { value: '00000000-0000-0000-0000-000000000000', type: 'format', description: 'Nil UUID' }
        );
        break;
    }

    return payloads;
  }

  /**
   * Generate overflow payloads based on parameter constraints
   */
  private generateOverflowPayloads(param: ParameterDefinition): FuzzPayload[] {
    const payloads: FuzzPayload[] = [...OVERFLOW_PAYLOADS];

    // If maxLength is defined, create specific overflow payloads
    if (param.maxLength !== undefined) {
      const sizes = [
        param.maxLength * 2,
        param.maxLength * 10,
        param.maxLength * 100,
      ];

      for (const size of sizes) {
        if (size <= 1000000) { // Limit to 1MB
          payloads.push({
            value: 'A'.repeat(size),
            type: 'overflow',
            description: `${size} chars (${Math.round(size / param.maxLength)}x maxLength)`,
          });
        }
      }
    }

    return payloads;
  }

  /**
   * Get payload type descriptions
   */
  getPayloadTypeDescriptions(): Record<PayloadType, string> {
    return {
      boundary: 'Edge cases like empty, null, min/max values',
      type_confusion: 'Wrong types to test type handling',
      injection: 'SQL, XSS, command injection payloads',
      format: 'Malformed data, path traversal, protocol handlers',
      overflow: 'Long strings, large numbers, format strings',
    };
  }

  /**
   * Get examples for each payload type
   */
  getPayloadExamples(type: PayloadType): string[] {
    const payloads = this.getPayloadsByType(type);
    return payloads.slice(0, 5).map(p => {
      let val: string;
      if (p.value === null) {
        val = 'null';
      } else if (p.value === undefined) {
        val = 'undefined';
      } else if (typeof p.value === 'string') {
        val = p.value;
      } else {
        val = JSON.stringify(p.value);
      }
      return val.length > 50 ? val.substring(0, 47) + '...' : val;
    });
  }
}

// Export a default instance
export const payloadGenerator = new PayloadGenerator();

// Export payload collections for testing
export {
  BOUNDARY_PAYLOADS,
  TYPE_CONFUSION_PAYLOADS,
  INJECTION_PAYLOADS,
  FORMAT_PAYLOADS,
  OVERFLOW_PAYLOADS,
  PAYLOADS_BY_TYPE,
};
