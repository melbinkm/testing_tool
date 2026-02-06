# Pentest Engine

A Human-in-the-Loop Autonomous Web/API Penetration Testing Engine powered by AI.

## Overview

Pentest Engine combines AI-powered analysis with specialized MCP (Model Context Protocol) servers to conduct authorized security assessments. It enforces strict scope boundaries, requires human approval for sensitive actions, and maintains comprehensive audit trails.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AutoPentest CLI                          │
│                    (AI-Powered Testing Agent)                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │    MCP Servers        │
    ┌───────────────┼───────────────────────┼───────────────┐
    │               │                       │               │
┌───┴───┐    ┌─────┴─────┐    ┌────────────┴──┐    ┌──────┴──────┐
│ Scope │    │   HTTP    │    │   OpenAPI     │    │   Nuclei    │
│ Guard │    │  Client   │    │   Parser      │    │   Scanner   │
└───────┘    └───────────┘    └───────────────┘    └─────────────┘
    │               │                       │               │
┌───┴───┐    ┌─────┴─────┐    ┌────────────┴──┐    ┌──────┴──────┐
│ Auth  │    │  Fuzzer   │    │   Validator   │    │  Evidence   │
│Tester │    │           │    │               │    │  Collector  │
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
- **Operating System**: Linux, macOS, or Windows (WSL)
- **API Access**: Google AI API key or OAuth credentials

## Installation

### 1. Clone and Install

```bash
cd /mnt/d/testing_tool

# Install root dependencies
npm install

# Install AutoPentest dependencies
cd AutoPentest
npm install

# Build the project
npm run build

# Create the bundle
npm run bundle
```

### 2. Configure Authentication

**Option A: Google OAuth (Recommended)**
```bash
# Run with Google login
GOOGLE_GENAI_USE_GCA=true npm start
```
This opens a browser for Google OAuth authentication.

**Option B: API Key**
```bash
# Set your Gemini API key
export GEMINI_API_KEY="your-api-key-here"
npm start
```

**Option C: Settings File**
```bash
mkdir -p ~/.autopentest
cat > ~/.autopentest/settings.json << 'EOF'
{
  "core": {
    "auth": {
      "selectedType": "oauth-personal"
    }
  }
}
EOF
```

## Quick Start

### 1. Define Your Scope

Create or edit `scope/engagement.yaml`:

```yaml
schema_version: "1.0"

engagement:
  id: "PENTEST-001"
  name: "My Security Assessment"
  start_date: "2025-01-01"
  end_date: "2025-12-31"

# Targets allowed for testing
allowlist:
  domains:
    - "*.target.example.com"
    - "api.target.example.com"
  ip_ranges:
    - "192.168.100.0/24"
  ports:
    - 80
    - 443
    - 8080

# Targets forbidden from testing
denylist:
  domains:
    - "production.example.com"
  ip_ranges:
    - "192.168.100.1/32"  # Gateway

# Rate limiting
constraints:
  rate_limits:
    requests_per_second: 10
    max_concurrent: 5
  budget:
    max_total_requests: 10000

# Actions requiring approval
actions:
  forbidden:
    - "denial_of_service"
    - "data_exfiltration"
  requires_approval:
    - "authentication_bypass"
    - "command_injection"
```

### 2. Start the Tool

```bash
cd AutoPentest
GOOGLE_GENAI_USE_GCA=true npm start
```

### 3. Run a Security Test

In the interactive CLI, you can:

```
> Analyze the API at https://api.target.example.com for security vulnerabilities

> Parse the OpenAPI spec and identify endpoints with potential IDOR vulnerabilities

> Fuzz the /users/{id} endpoint with boundary value payloads

> Test authentication mechanisms for bypass vulnerabilities
```

## MCP Servers

The engine includes specialized MCP servers for security testing:

| Server | Description | Tests |
|--------|-------------|-------|
| **scope-guard-mcp** | Enforces scope boundaries and validates targets | 131 |
| **http-client-mcp** | Rate-limited HTTP client with budget tracking | 91 |
| **openapi-mcp** | Parses OpenAPI 3.x specs for endpoint discovery | 72 |
| **auth-tester-mcp** | Tests authentication and authorization | 75 |
| **fuzzer-mcp** | Schema-based fuzzing with signal detection | 164 |
| **nuclei-mcp** | Vulnerability scanning with Nuclei templates | 111 |
| **validator-mcp** | Validates and confirms findings | 105 |
| **evidence-mcp** | Collects and bundles evidence | 196 |
| **world-model-mcp** | SQLite database for tracking assets/findings | 102 |

**Total: 1,047 tests passing**

## Example Workflows

### API Security Assessment

```
1. Load the OpenAPI specification
   > Parse the OpenAPI spec at https://api.example.com/openapi.json

2. Review discovered endpoints
   > List all endpoints that accept user input

3. Test for IDOR vulnerabilities
   > Test the GET /users/{id} endpoint for IDOR using IDs 1-100

4. Fuzz parameters
   > Fuzz the limit and offset parameters on /users for injection

5. Generate report
   > Create a security assessment report with all findings
```

### Authentication Testing

```
1. Load test credentials
   > Load authentication identities from the engagement scope

2. Test access controls
   > Perform differential testing between admin and user roles

3. Check for privilege escalation
   > Test if user role can access admin endpoints

4. Document findings
   > Create evidence bundle for authentication bypass finding
```

## Configuration

### MCP Server Configuration

Add MCP servers to `~/.autopentest/settings.json`:

```json
{
  "mcpServers": {
    "scope-guard": {
      "command": "node",
      "args": ["/mnt/d/testing_tool/mcp-servers/scope-guard-mcp/dist/server.js"],
      "env": {
        "SCOPE_FILE": "/mnt/d/testing_tool/scope/engagement.yaml"
      }
    },
    "http-client": {
      "command": "node",
      "args": ["/mnt/d/testing_tool/mcp-servers/http-client-mcp/dist/server.js"]
    },
    "openapi": {
      "command": "node",
      "args": ["/mnt/d/testing_tool/mcp-servers/openapi-mcp/dist/server.js"]
    }
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | API key for Gemini models |
| `GOOGLE_GENAI_USE_GCA` | Set to `true` for Google OAuth |
| `SCOPE_FILE` | Path to engagement scope YAML |
| `EVIDENCE_PATH` | Path for storing evidence files |

## Safety Features

1. **Scope Enforcement**: All targets validated against allowlist/denylist
2. **Rate Limiting**: Configurable request limits per second
3. **Budget Tracking**: Maximum requests per target/total
4. **Human Approval**: Sensitive actions require explicit approval
5. **Audit Trail**: All actions logged with correlation IDs
6. **Evidence Collection**: Automatic capture with PII redaction

## Running Tests

```bash
# Run all MCP server tests
cd /mnt/d/testing_tool/mcp-servers
for dir in */; do (cd "$dir" && npm test); done

# Run specific server tests
cd /mnt/d/testing_tool/mcp-servers/scope-guard-mcp
npm test
```

## Project Structure

```
/mnt/d/testing_tool/
├── AutoPentest/           # Main CLI application
│   ├── packages/
│   │   ├── cli/           # CLI interface
│   │   ├── core/          # Core functionality
│   │   └── a2a-server/    # Agent-to-agent server
│   ├── bundle/            # Bundled application
│   └── .gemini/           # Commands and skills
├── mcp-servers/           # MCP server implementations
│   ├── scope-guard-mcp/   # Scope enforcement
│   ├── http-client-mcp/   # HTTP requests
│   ├── openapi-mcp/       # OpenAPI parsing
│   ├── auth-tester-mcp/   # Auth testing
│   ├── fuzzer-mcp/        # Parameter fuzzing
│   ├── nuclei-mcp/        # Vulnerability scanning
│   ├── validator-mcp/     # Finding validation
│   ├── evidence-mcp/      # Evidence collection
│   └── world-model-mcp/   # State management
└── scope/                 # Engagement definitions
    └── engagement.yaml    # Scope configuration
```

## Troubleshooting

### Build Errors

```bash
# Clean and rebuild
cd AutoPentest
rm -rf node_modules packages/*/dist
npm install
npm run build
```

### Authentication Issues

```bash
# Clear stored credentials
rm -rf ~/.autopentest/oauth*

# Re-authenticate
GOOGLE_GENAI_USE_GCA=true npm start
```

### MCP Server Issues

```bash
# Test individual server
cd mcp-servers/scope-guard-mcp
npm test

# Check server builds
npm run build
```

## Security Notice

This tool is designed for **authorized security testing only**. Always:

1. Obtain written authorization before testing
2. Define clear scope boundaries
3. Follow responsible disclosure practices
4. Comply with applicable laws and regulations

## License

Apache License 2.0
