# Fuzzer MCP Server

MCP server for schema-based API fuzzing with intelligent payload generation and signal detection.

## Overview

This MCP server provides tools for fuzzing API endpoints with various payload types:

- **fuzz_endpoint**: Fuzz all parameters of an API endpoint
- **fuzz_parameter**: Fuzz a single parameter with specific payload types
- **fuzz_list_payloads**: List available payload types and examples

## Features

- **Schema-Aware Fuzzing**: Generates payloads based on parameter constraints (min/max, length limits, enums)
- **Multiple Payload Types**: Boundary values, type confusion, injection, format, overflow
- **Signal Detection**: Identifies errors, timing anomalies, reflections, and differential responses
- **Rate Limiting**: Respects configured rate limits for responsible fuzzing
- **Mock Mode**: Simulates fuzzing for development and testing

## Installation

```bash
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_PAYLOADS` | `100` | Maximum payloads per parameter |
| `MAX_REQUESTS_PER_ENDPOINT` | `500` | Budget per endpoint |
| `RATE_LIMIT` | `10` | Maximum requests per second |
| `TIMEOUT` | `30000` | Request timeout in milliseconds |

## Usage

### Starting the Server

```bash
npm start
```

### MCP Tools

#### fuzz_endpoint

Fuzz all parameters of an API endpoint.

**Input:**
```json
{
  "endpoint": "https://api.example.com/users",
  "method": "POST",
  "parameters": [
    {
      "name": "email",
      "location": "body",
      "type": "string",
      "format": "email",
      "required": true
    },
    {
      "name": "age",
      "location": "body",
      "type": "integer",
      "minimum": 0,
      "maximum": 150
    }
  ],
  "payload_types": ["boundary", "injection"],
  "headers": {
    "Authorization": "Bearer token123"
  }
}
```

**Output:**
```json
{
  "success": true,
  "result": {
    "endpoint": "https://api.example.com/users",
    "method": "POST",
    "parameters_fuzzed": 2,
    "total_payloads_sent": 150,
    "total_signals": 5,
    "parameter_results": [...],
    "duration_ms": 3500
  }
}
```

#### fuzz_parameter

Fuzz a single parameter with various payload types.

**Input:**
```json
{
  "endpoint": "https://api.example.com/search",
  "method": "GET",
  "parameter": {
    "name": "query",
    "location": "query",
    "type": "string",
    "maxLength": 100
  },
  "payload_types": ["injection"],
  "max_payloads": 50
}
```

**Output:**
```json
{
  "success": true,
  "result": {
    "endpoint": "https://api.example.com/search",
    "parameter": "query",
    "parameter_type": "string",
    "payloads_sent": 50,
    "signals": [
      {
        "payload": "' OR '1'='1",
        "payload_type": "injection",
        "response_status": 500,
        "response_time_ms": 100,
        "signal_type": "error",
        "severity": "high",
        "confidence": 0.9,
        "evidence": "SQL syntax error"
      }
    ],
    "baseline_response_time_ms": 50,
    "baseline_status": 200
  }
}
```

#### fuzz_list_payloads

List available payload types and examples.

**Input:**
```json
{
  "type": "injection"
}
```

**Output:**
```json
{
  "success": true,
  "payload_types": [
    {
      "type": "injection",
      "description": "SQL, XSS, command injection payloads",
      "examples": ["'", "' OR '1'='1", "<script>alert(1)</script>"],
      "risk_level": "high"
    }
  ],
  "total_types": 5
}
```

## Payload Types

| Type | Description | Risk Level |
|------|-------------|------------|
| `boundary` | Edge cases: empty, null, min/max values | Low |
| `type_confusion` | Wrong types to test type handling | Low |
| `injection` | SQL, XSS, command injection payloads | High |
| `format` | Malformed data, path traversal, protocols | Medium |
| `overflow` | Long strings, large numbers, format strings | Medium |

## Signal Types

| Signal | Description |
|--------|-------------|
| `error` | 5xx status codes, stack traces, SQL errors |
| `timing` | Response time significantly slower than baseline |
| `reflection` | Input payload reflected in response |
| `differential` | Response differs significantly from baseline |

## Risk Levels

| Tool | Risk Level | Notes |
|------|------------|-------|
| `fuzz_endpoint` | HIGH | Requires scope validation |
| `fuzz_parameter` | HIGH | Requires scope validation |
| `fuzz_list_payloads` | LOW | Read-only operation |

## Integration with Scope Guard

Before fuzzing, validate the target is in scope:

```javascript
// 1. Validate target is in scope
const scopeResult = await scopeGuard.check_target({ target: "https://api.example.com" });

// 2. If in scope, proceed with fuzzing
if (scopeResult.allowed) {
  const fuzzResult = await fuzzer.fuzz_endpoint({
    endpoint: "https://api.example.com/search",
    method: "GET"
  });
}
```

## Testing

```bash
npm test
```

## Mock Mode

In mock mode (default for safety), the server simulates fuzzing:

- SQL injection payloads trigger simulated SQL error responses
- XSS payloads trigger simulated reflection responses
- Overflow payloads trigger simulated server errors
- Time-based payloads simulate delayed responses

This enables testing and development without sending actual malicious requests.

## License

MIT
