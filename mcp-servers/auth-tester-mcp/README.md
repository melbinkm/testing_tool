# Auth Tester MCP Server

An MCP (Model Context Protocol) server for authorization differential testing to detect BOLA (Broken Object Level Authorization) and IDOR (Insecure Direct Object Reference) vulnerabilities.

## Overview

This server enables security testing by replaying HTTP requests with different identities and analyzing the responses to detect authorization flaws. It helps identify cases where:

- Multiple users can access the same protected resource (BOLA)
- Users receive different data for the same resource without proper authorization checks (IDOR)

## Prerequisites

- Node.js >= 20.0.0
- npm or yarn

## Installation

```bash
cd mcp-servers/auth-tester-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IDENTITY_FILE` | Path to the YAML file containing test identities | `./scope/identities.yaml` |

### Identity File Format

Create a YAML file with your test identities:

```yaml
# scope/identities.yaml
identities:
  - identity_id: admin-user
    label: Admin User
    roles:
      - admin
      - user
    tenant_id: tenant-001
    auth_type: bearer
    auth_header: "Bearer eyJhbGciOiJIUzI1NiIs..."

  - identity_id: regular-user
    label: Regular User
    roles:
      - user
    tenant_id: tenant-001
    auth_type: bearer
    auth_header: "Bearer eyJhbGciOiJIUzI1NiIs..."

  - identity_id: other-tenant-user
    label: Other Tenant User
    roles:
      - user
    tenant_id: tenant-002
    auth_type: bearer
    auth_header: "Bearer eyJhbGciOiJIUzI1NiIs..."

  - identity_id: api-client
    label: API Client
    roles:
      - api
    auth_type: api_key
    auth_header: "sk-test-api-key-12345"

  - identity_id: session-user
    label: Session User
    roles:
      - user
    auth_type: cookie
    cookies:
      session_id: "abc123"
      csrf_token: "xyz789"
```

### Supported Auth Types

| Type | Header Generated |
|------|------------------|
| `bearer` | `Authorization: Bearer <token>` |
| `basic` | `Authorization: Basic <base64>` |
| `api_key` | `X-API-Key: <key>` |
| `cookie` | `Cookie: key1=val1; key2=val2` |

## Available Tools

### auth_get_identities

List all available test identities configured for authorization testing.

**Parameters:** None

**Example Response:**
```json
{
  "success": true,
  "count": 3,
  "identities": [
    {
      "identity_id": "admin-user",
      "label": "Admin User",
      "roles": ["admin", "user"],
      "tenant_id": "tenant-001",
      "auth_type": "bearer"
    }
  ]
}
```

### auth_diff_test

Test the same HTTP request with multiple identities to detect BOLA/IDOR vulnerabilities by comparing responses.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `method` | string | Yes | HTTP method (GET, POST, PUT, DELETE, etc.) |
| `url` | string | Yes | Full URL to test |
| `headers` | object | No | Additional HTTP headers |
| `body` | string | No | Request body for POST/PUT/PATCH |
| `identity_ids` | string[] | Yes | Array of identity IDs to test with |

**Example Request:**
```json
{
  "method": "GET",
  "url": "https://api.example.com/users/123/profile",
  "identity_ids": ["admin-user", "regular-user", "other-tenant-user"]
}
```

**Example Response:**
```json
{
  "success": true,
  "summary": {
    "request": {
      "method": "GET",
      "url": "https://api.example.com/users/123/profile"
    },
    "results": [
      {
        "identity_id": "admin-user",
        "status_code": 200,
        "response_length": 1500,
        "response_hash": "abc123...",
        "contains_target_data": true,
        "timing_ms": 45
      },
      {
        "identity_id": "regular-user",
        "status_code": 200,
        "response_length": 1500,
        "response_hash": "abc123...",
        "contains_target_data": true,
        "timing_ms": 52
      }
    ],
    "analysis": {
      "status_codes_differ": false,
      "response_lengths_differ": false,
      "potential_bola": true,
      "potential_idor": false,
      "recommendation": "CRITICAL: Potential BOLA vulnerability detected..."
    }
  }
}
```

### auth_replay_with_identity

Replay a single HTTP request with a specific identity for targeted testing.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `method` | string | Yes | HTTP method |
| `url` | string | Yes | Full URL to test |
| `headers` | object | No | Additional HTTP headers |
| `body` | string | No | Request body |
| `identity_id` | string | Yes | Identity ID to use |

**Example Request:**
```json
{
  "method": "GET",
  "url": "https://api.example.com/me",
  "identity_id": "admin-user"
}
```

**Example Response:**
```json
{
  "success": true,
  "request": {
    "method": "GET",
    "url": "https://api.example.com/me"
  },
  "identity": {
    "identity_id": "admin-user",
    "label": "Admin User",
    "roles": ["admin", "user"]
  },
  "result": {
    "identity_id": "admin-user",
    "status_code": 200,
    "response_length": 500,
    "response_hash": "def456...",
    "contains_target_data": true,
    "timing_ms": 38
  }
}
```

## MCP Server Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "auth-tester": {
      "command": "node",
      "args": ["/path/to/auth-tester-mcp/dist/server.js"],
      "env": {
        "IDENTITY_FILE": "/path/to/scope/identities.yaml"
      }
    }
  }
}
```

## Detection Logic

### BOLA Detection
A potential BOLA vulnerability is flagged when:
- Multiple identities receive HTTP 2xx responses
- All responses have the same hash (identical content)
- All responses contain target data

### IDOR Detection
A potential IDOR vulnerability is flagged when:
- Multiple identities receive HTTP 2xx responses
- Responses have different hashes (different content)
- All responses contain target data

### Response Length Variance
Response lengths are flagged as differing when any response length varies by more than 10% from the average.

## Correlation ID Support

For evidence tracking in automated testing, include these headers in your requests:
- `X-Engagement-ID`: Links to the engagement
- `X-Action-ID`: Links to a specific action
- `X-Identity-ID`: Links to the identity used

These headers are passed through in the `headers` parameter.

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Type check
npm run typecheck
```

## Development

```bash
# Build
npm run build

# Start server
npm start

# Or run directly with ts-node
npx ts-node src/server.ts
```

## Integration with World Model

The auth-tester-mcp server is designed to work with the world-model-mcp server for comprehensive security testing:

1. Use `auth_diff_test` to get differential results
2. Use `wm_add_observation` to record observations
3. Use `wm_add_finding` to record confirmed vulnerabilities
4. Use `wm_add_hypothesis` to track test hypotheses

This keeps MCP servers loosely coupled - they don't call each other directly.

## Security Considerations

- Never commit identity files with real credentials to version control
- Use environment-specific identity files
- The server sanitizes `auth_header` from `auth_get_identities` responses
- Test only against authorized targets
