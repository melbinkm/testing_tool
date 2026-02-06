# Pentest MCP Servers

A collection of MCP (Model Context Protocol) servers for AI-powered penetration testing. Works with **Gemini CLI**, **Claude Code**, or any MCP-compatible client.

## Overview

These MCP servers provide security testing capabilities that integrate with any AI assistant supporting the MCP protocol. The servers handle scope enforcement, rate limiting, evidence collection, and specialized pentest workflows.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              Gemini CLI / Claude Code / Any MCP Client          │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │    MCP Servers        │
    ┌───────────────┼───────────────────────┼───────────────┐
    │               │                       │               │
┌───┴───┐    ┌─────┴─────┐    ┌────────────┴──┐    ┌──────┴──────┐
│ Scope │    │  Browser  │    │     HTTP      │    │   Nuclei    │
│ Guard │    │   MCP     │    │    Client     │    │   Scanner   │
└───────┘    └───────────┘    └───────────────┘    └─────────────┘
    │               │                       │               │
┌───┴───┐    ┌─────┴─────┐    ┌────────────┴──┐    ┌──────┴──────┐
│ Auth  │    │  Fuzzer   │    │   OpenAPI     │    │  Evidence   │
│Tester │    │           │    │   Parser      │    │  Collector  │
└───────┘    └───────────┘    └───────────────┘    └─────────────┘
                                │
                    ┌───────────┴───────────┐
                    │     World Model       │
                    │  (SQLite Database)    │
                    └───────────────────────┘
```

## Prerequisites

- **Node.js** version 20 or higher
- **npm** version 9 or higher
- **Gemini CLI** or any MCP-compatible client
- **Google Cloud Auth** (for browser AI features): `gcloud auth application-default login`

## Installation

```bash
# Clone the repository
git clone <repo-url> pentest-mcp
cd pentest-mcp

# Install all MCP servers
npm install

# Build all servers
npm run build
```

## Configuration

### For Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "scope-guard": {
      "command": "node",
      "args": ["/path/to/pentest-mcp/mcp-servers/scope-guard-mcp/dist/index.js"],
      "env": {
        "SCOPE_FILE": "/path/to/pentest-mcp/scope/engagement.yaml",
        "FAIL_CLOSED": "true"
      }
    },
    "browser": {
      "command": "node",
      "args": ["/path/to/pentest-mcp/mcp-servers/browser-mcp/dist/index.js"],
      "env": {
        "ENGAGEMENT_ID": "PENTEST-001",
        "HEADLESS": "false",
        "BURP_PROXY_URL": "http://127.0.0.1:8080"
      }
    },
    "http-client": {
      "command": "node",
      "args": ["/path/to/pentest-mcp/mcp-servers/http-client-mcp/dist/index.js"],
      "env": {
        "ENGAGEMENT_ID": "PENTEST-001",
        "MAX_RPS": "10"
      }
    }
  }
}
```

### For Claude Code

Add to `.claude/settings.json` or project's `CLAUDE.md`.

## MCP Servers

| Server | Description | Key Tools |
|--------|-------------|-----------|
| **scope-guard-mcp** | Enforces scope boundaries | `validate_target`, `check_scope` |
| **browser-mcp** | Browser automation with Burp proxy | `browser_navigate`, `browser_act`, `browser_test_xss` |
| **http-client-mcp** | Rate-limited HTTP requests | `http_request`, `http_get`, `http_post` |
| **openapi-mcp** | OpenAPI spec parsing | `parse_openapi`, `list_endpoints` |
| **auth-tester-mcp** | Authentication testing | `test_auth`, `differential_test` |
| **fuzzer-mcp** | Parameter fuzzing | `fuzz_parameter`, `generate_payloads` |
| **nuclei-mcp** | Vulnerability scanning | `nuclei_scan`, `list_templates` |
| **validator-mcp** | Finding validation | `validate_finding`, `confirm_vuln` |
| **evidence-mcp** | Evidence collection | `capture_evidence`, `create_bundle` |
| **world-model-mcp** | State tracking (SQLite) | `add_asset`, `add_finding`, `query` |

## Quick Start

### 1. Define Your Scope

Edit `scope/engagement.yaml`:

```yaml
schema_version: "1.0"

engagement:
  id: "PENTEST-001"
  name: "My Security Assessment"

allowlist:
  domains:
    - "*.target.example.com"
  ports:
    - 80
    - 443

denylist:
  domains:
    - "production.example.com"

constraints:
  rate_limits:
    requests_per_second: 10
```

### 2. Start Gemini CLI

```bash
gemini
```

### 3. Run Security Tests

```
> Navigate to https://target.example.com and test the login form for XSS

> Parse the OpenAPI spec and find endpoints with user input

> Fuzz the search parameter for SQL injection
```

## Browser MCP Tools

The browser MCP provides both AI-powered and direct DOM tools:

### AI-Powered (requires Google auth)
- `browser_act` - Natural language actions ("click the login button")
- `browser_extract` - AI data extraction

### Direct DOM (no AI needed)
- `browser_click` - Click by CSS selector
- `browser_fill` - Fill input by selector
- `browser_press_key` - Keyboard input
- `browser_dismiss_popups` - Close common overlays

### Security Testing
- `browser_discover_forms` - Find all forms
- `browser_test_xss` - Test fields for XSS
- `browser_screenshot` - Capture evidence

## Example Workflows

### XSS Testing
```
1. browser_navigate to https://target.com
2. browser_dismiss_popups (if needed)
3. browser_discover_forms
4. browser_test_xss on each form field
5. browser_screenshot for evidence
```

### API Security Assessment
```
1. parse_openapi https://api.target.com/openapi.json
2. list_endpoints
3. fuzz_parameter on user-input fields
4. validate_finding for any anomalies
5. capture_evidence for confirmed issues
```

## Safety Features

1. **Scope Enforcement** - All targets validated before requests
2. **Rate Limiting** - Configurable requests per second
3. **Budget Tracking** - Maximum request limits
4. **Correlation IDs** - Full request traceability in Burp
5. **Evidence Collection** - Automatic capture with PII redaction

## Running Tests

```bash
# Run all tests
npm test

# Run specific server tests
cd mcp-servers/browser-mcp && npm test
```

## Project Structure

```
pentest-mcp/
├── mcp-servers/           # MCP server implementations
│   ├── scope-guard-mcp/   # Scope enforcement
│   ├── browser-mcp/       # Browser automation
│   ├── http-client-mcp/   # HTTP requests
│   ├── openapi-mcp/       # OpenAPI parsing
│   ├── auth-tester-mcp/   # Auth testing
│   ├── fuzzer-mcp/        # Parameter fuzzing
│   ├── nuclei-mcp/        # Vulnerability scanning
│   ├── validator-mcp/     # Finding validation
│   ├── evidence-mcp/      # Evidence collection
│   └── world-model-mcp/   # State management
├── scope/                 # Engagement definitions
│   └── engagement.yaml    # Scope configuration
├── evidence/              # Captured evidence
└── README.md
```

## Security Notice

This tool is designed for **authorized security testing only**. Always:

1. Obtain written authorization before testing
2. Define clear scope boundaries
3. Follow responsible disclosure practices
4. Comply with applicable laws and regulations

## License

Apache License 2.0
