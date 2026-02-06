# Validator MCP Server

An MCP (Model Context Protocol) server for finding validation with reproduction, negative controls, and cross-identity verification.

## Overview

This server validates security findings through multiple validation strategies:

- **Reproduction**: Run the same test N times to confirm consistency
- **Negative Control**: Verify the vulnerability doesn't exist in control scenarios
- **Cross-Identity**: Confirm authorization is properly enforced across different users
- **Confidence Scoring**: Calculate confidence based on validation results and recommend promotion

## Prerequisites

- Node.js >= 20.0.0
- npm or yarn

## Installation

```bash
cd mcp-servers/validator-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REPRO_COUNT` | Default number of reproduction attempts | `3` |
| `REQUIRE_NEGATIVE_CONTROL` | Require negative control before promotion | `true` |

## Available Tools

### validate_repro

Reproduce a finding N times to confirm it is consistent and reproducible.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `finding` | object | Yes | The finding to reproduce |
| `finding.finding_id` | string | Yes | Unique identifier |
| `finding.title` | string | Yes | Finding title |
| `finding.request` | object | Yes | HTTP request config |
| `finding.request.method` | string | Yes | HTTP method |
| `finding.request.url` | string | Yes | Request URL |
| `finding.request.headers` | object | No | Request headers |
| `finding.request.body` | string | No | Request body |
| `finding.expected` | object | No | Expected response characteristics |
| `count` | number | No | Number of attempts (default: REPRO_COUNT) |

**Example:**
```json
{
  "finding": {
    "finding_id": "F-001",
    "title": "SQL Injection in login",
    "request": {
      "method": "POST",
      "url": "https://api.example.com/login",
      "headers": {"Content-Type": "application/json"},
      "body": "{\"username\": \"admin' OR 1=1--\"}"
    },
    "expected": {
      "status_code": 200,
      "body_contains": ["token"]
    }
  },
  "count": 5
}
```

### validate_negative_control

Run a negative control test to verify the vulnerability does not exist in control scenarios.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `finding` | object | Yes | The finding to test |
| `control_config` | object | Yes | Control configuration |
| `control_config.control_type` | string | Yes | Type: `unauthenticated`, `invalid_token`, `different_user`, `modified_request` |
| `control_config.modified_headers` | object | No | Headers to use instead |
| `control_config.modified_body` | string | No | Body to use instead |
| `control_config.remove_auth` | boolean | No | Remove authentication headers |
| `control_config.expected_status` | number | No | Expected status code |

**Control Types:**
- `unauthenticated`: Remove authentication, expect 401/403
- `invalid_token`: Use invalid token, expect 401/403
- `different_user`: Use different user's credentials, expect 403/404
- `modified_request`: Modify the request, expect 4xx

**Example:**
```json
{
  "finding": {
    "finding_id": "F-001",
    "title": "Auth Bypass",
    "request": {
      "method": "GET",
      "url": "https://api.example.com/admin/users",
      "headers": {"Authorization": "Bearer valid-token"}
    }
  },
  "control_config": {
    "control_type": "unauthenticated",
    "remove_auth": true
  }
}
```

### validate_cross_identity

Test a finding with multiple identities to verify authorization is enforced.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `finding` | object | Yes | The finding to test |
| `identities` | array | Yes | Identities to test with |
| `identities[].identity_id` | string | Yes | Identity identifier |
| `identities[].auth_header` | string | No | Auth header value |
| `identities[].auth_type` | string | No | `bearer`, `basic`, `api_key`, `cookie` |
| `identities[].cookies` | object | No | Cookies for cookie auth |
| `identities[].should_have_access` | boolean | Yes | Expected access |

**Example:**
```json
{
  "finding": {
    "finding_id": "F-001",
    "title": "BOLA on user data",
    "request": {
      "method": "GET",
      "url": "https://api.example.com/users/123/data"
    }
  },
  "identities": [
    {
      "identity_id": "user-123",
      "auth_header": "Bearer user123-token",
      "auth_type": "bearer",
      "should_have_access": true
    },
    {
      "identity_id": "user-456",
      "auth_header": "Bearer user456-token",
      "auth_type": "bearer",
      "should_have_access": false
    }
  ]
}
```

### validate_promote

Calculate confidence score and determine if finding should be promoted to confirmed.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `finding_id` | string | Yes | The finding ID to evaluate |
| `repro_result` | object | No | Result from validate_repro |
| `negative_control_result` | object | No | Result from validate_negative_control |
| `cross_identity_result` | object | No | Result from validate_cross_identity |

At least one validation result is required.

**Response includes:**
- `confidence.overall_score`: 0.0 - 1.0
- `confidence.recommendation`: `promote`, `investigate`, or `dismiss`
- `confidence.factors`: Explanation of scoring factors
- `promoted`: Boolean indicating if finding meets promotion threshold

## Confidence Scoring

### Weights
- Reproduction: 40%
- Negative Control: 35%
- Cross-Identity: 25%

### Thresholds
- **Promote**: >= 0.8 (80%)
- **Investigate**: >= 0.5 (50%)
- **Dismiss**: < 0.5 (50%)

### Score Factors

**Reproduction Score:**
- Based on success rate
- Bonus for consistent responses
- Penalty for few attempts (<3)
- Bonus for many successful attempts (>=5)

**Negative Control Score:**
- 1.0 if passed
- Low score if failed (varies by control type)
- `unauthenticated` failure: 0.1
- `invalid_token` failure: 0.2
- `different_user` failure: 0.15
- `modified_request` failure: 0.3

**Cross-Identity Score:**
- 1.0 if authorization enforced
- Lower based on violation ratio
- Unauthorized access more severe than denied access

## MCP Server Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "validator": {
      "command": "node",
      "args": ["/path/to/validator-mcp/dist/server.js"],
      "env": {
        "REPRO_COUNT": "3",
        "REQUIRE_NEGATIVE_CONTROL": "true"
      }
    }
  }
}
```

## Validation Workflow

Typical validation workflow:

1. **Reproduce** the finding with `validate_repro`
2. **Test negative control** with `validate_negative_control`
3. **Test cross-identity** with `validate_cross_identity` (if applicable)
4. **Promote** with `validate_promote` to get confidence score

```
Finding → validate_repro → validate_negative_control → validate_cross_identity → validate_promote
                                                                                      ↓
                                                                              confidence score
                                                                                      ↓
                                                              promote / investigate / dismiss
```

## Integration with World Model

The validator-mcp server is designed to work with world-model-mcp:

1. Use `validate_repro` to confirm finding reproducibility
2. Use `validate_negative_control` to verify authorization works
3. Use `validate_cross_identity` for BOLA/IDOR findings
4. Use `validate_promote` to get confidence score
5. Use `wm_update_finding` to update finding status based on recommendation

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
```

## Security Considerations

- Validate only against authorized targets
- Use test credentials, not production credentials
- Review validation results before promoting findings
- Consider false positive rates when setting thresholds
