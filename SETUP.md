# Setup Guide - Pentest MCP Servers

## Prerequisites
- Node.js 20+
- npm
- Git
- Gemini CLI (or any MCP-compatible client)
- Google Cloud Auth (for AI features): `gcloud auth application-default login`
- Burp Suite Professional (optional, for proxy integration)

## Quick Start

### 1. Install Dependencies

```bash
cd /mnt/d/testing_tool

# Install all MCP servers
npm install

# Build all servers
npm run build
```

### 2. Project Structure

```
/mnt/d/testing_tool/
├── mcp-servers/              # MCP server implementations
│   ├── scope-guard-mcp/      # Scope validation
│   ├── browser-mcp/          # Browser automation
│   ├── http-client-mcp/      # HTTP requests
│   ├── openapi-mcp/          # OpenAPI parsing
│   ├── auth-tester-mcp/      # Auth testing
│   ├── fuzzer-mcp/           # Parameter fuzzing
│   ├── nuclei-mcp/           # Vulnerability scanning
│   ├── validator-mcp/        # Finding validation
│   ├── evidence-mcp/         # Evidence collection
│   └── world-model-mcp/      # State management
├── scope/                    # Engagement definitions
│   └── engagement.yaml       # Scope configuration
├── evidence/                 # Captured evidence
├── logs/                     # Audit logs
├── CLAUDE.md                 # AI agent guidelines
├── SETUP.md                  # This file
└── package.json              # Workspace configuration
```

### 3. Configure MCP Client

**For Gemini CLI** (`~/.gemini/settings.json`):
```json
{
  "mcpServers": {
    "scope-guard": {
      "command": "node",
      "args": ["/mnt/d/testing_tool/mcp-servers/scope-guard-mcp/dist/index.js"],
      "env": {
        "SCOPE_FILE": "/mnt/d/testing_tool/scope/engagement.yaml",
        "FAIL_CLOSED": "true"
      }
    },
    "browser": {
      "command": "node",
      "args": ["/mnt/d/testing_tool/mcp-servers/browser-mcp/dist/index.js"],
      "env": {
        "ENGAGEMENT_ID": "PENTEST-001",
        "HEADLESS": "false",
        "BURP_PROXY_URL": "http://127.0.0.1:8080"
      }
    },
    "http-client": {
      "command": "node",
      "args": ["/mnt/d/testing_tool/mcp-servers/http-client-mcp/dist/index.js"],
      "env": {
        "ENGAGEMENT_ID": "PENTEST-001",
        "MAX_RPS": "10"
      }
    }
  }
}
```

**For Claude Code** (`.claude/settings.json` or `CLAUDE.md`).

### 4. Configure Engagement Scope

Edit `scope/engagement.yaml`:
```yaml
schema_version: "1.0"

engagement:
  id: "PENTEST-001"
  name: "My Security Assessment"

allowlist:
  domains:
    - "*.example.com"
  ip_ranges:
    - "192.168.1.0/24"
  ports:
    - 80
    - 443

denylist:
  domains:
    - "production.example.com"

constraints:
  rate_limits:
    requests_per_second: 10
    max_concurrent: 5
```

### 5. Start Testing

```bash
# Start Gemini CLI
gemini

# In the CLI, you can now use:
> Navigate to https://target.com and test the search form for XSS
> Parse the OpenAPI spec at https://api.target.com/docs
> Fuzz the login endpoint for SQL injection
```

## MCP Servers

| Server | Description | Key Tools |
|--------|-------------|-----------|
| **scope-guard-mcp** | Scope enforcement | `validate_target`, `check_scope` |
| **browser-mcp** | Browser automation | `browser_navigate`, `browser_act`, `browser_test_xss` |
| **http-client-mcp** | HTTP requests | `http_request`, `http_get`, `http_post` |
| **openapi-mcp** | OpenAPI parsing | `parse_openapi`, `list_endpoints` |
| **auth-tester-mcp** | Auth testing | `test_auth`, `differential_test` |
| **fuzzer-mcp** | Fuzzing | `fuzz_parameter`, `generate_payloads` |
| **nuclei-mcp** | Vulnerability scanning | `nuclei_scan` |
| **validator-mcp** | Finding validation | `validate_finding` |
| **evidence-mcp** | Evidence capture | `capture_evidence`, `create_bundle` |
| **world-model-mcp** | State tracking | `add_asset`, `add_finding` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | API key for Gemini (optional if using ADC) |
| `SCOPE_FILE` | Path to engagement.yaml |
| `BURP_PROXY_URL` | Burp Suite proxy URL (e.g., `http://127.0.0.1:8080`) |
| `HEADLESS` | Browser headless mode (`true`/`false`) |
| `ENGAGEMENT_ID` | Current engagement ID |
| `MAX_RPS` | Rate limit (requests per second) |

## Running Tests

```bash
# Run all MCP server tests
npm test

# Run specific server tests
cd mcp-servers/browser-mcp && npm test

# Run with coverage
npm test -- --coverage
```

## Troubleshooting

### Build errors
```bash
rm -rf node_modules
npm install
npm run build
```

### Google auth not working
```bash
gcloud auth application-default login
```

### Browser not opening
Check `HEADLESS` is set to `false` in your MCP config.

### Requests not appearing in Burp
1. Ensure Burp is running on the configured port
2. Check `BURP_PROXY_URL` matches Burp's listener
3. Verify the browser session was created with proxy enabled

## Changelog

| Date | Change |
|------|--------|
| 2026-02-06 | Simplified to MCP-only architecture (removed AutoPentest CLI wrapper) |
| 2026-02-06 | Added browser-mcp with Gemini ADC auth, XSS testing, direct DOM tools |
| 2026-02-05 | Added nuclei-mcp, fuzzer-mcp, evidence-mcp, validator-mcp |
| 2026-02-05 | Initial MCP servers: scope-guard, http-client, auth-tester |

---
*Update this file after every major change.*
