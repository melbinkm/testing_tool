# Evidence MCP Server

MCP server for evidence bundling, sensitive data redaction, and security finding report generation.

## Overview

The Evidence MCP Server provides tools for:
- Creating evidence bundles for security findings
- Adding artifacts (requests, responses, screenshots, logs, configs) to bundles
- Automatic redaction of sensitive data (API keys, tokens, passwords, etc.)
- Exporting evidence as ZIP or JSON
- Generating security reports in Markdown or HTML formats

## Installation

```bash
cd mcp-servers/evidence-mcp
npm install
npm run build
```

## MCP Configuration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "evidence": {
      "command": "node",
      "args": ["/path/to/evidence-mcp/dist/server.js"],
      "env": {
        "EVIDENCE_DIR": "./evidence",
        "REDACT_SECRETS": "true"
      }
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EVIDENCE_DIR` | Directory for storing evidence files | `./evidence` |
| `REDACT_SECRETS` | Enable automatic secret redaction | `true` |

## Available Tools

### evidence_bundle

Create a new evidence bundle for a security finding.

**Parameters:**
- `finding_id` (required): The ID of the finding this evidence relates to
- `metadata` (optional): Object with additional info (title, severity, description, cvss_score, cwe_id, etc.)

**Example:**
```json
{
  "finding_id": "F-001",
  "metadata": {
    "title": "SQL Injection in Login",
    "severity": "high",
    "description": "The login endpoint is vulnerable to SQL injection attacks.",
    "cvss_score": 8.5,
    "cwe_id": "CWE-89"
  }
}
```

### evidence_add_artifact

Add an artifact to an existing evidence bundle.

**Parameters:**
- `bundle_id` (required): The evidence bundle ID
- `artifact` (required): Object containing:
  - `type`: One of `request`, `response`, `screenshot`, `log`, `config`, `other`
  - `name`: Name/label for the artifact
  - `content`: Content of the artifact
  - `content_type` (optional): MIME type (default: text/plain)

**Example:**
```json
{
  "bundle_id": "EB-ABC12345",
  "artifact": {
    "type": "request",
    "name": "malicious-login-request",
    "content": "POST /api/login HTTP/1.1\nContent-Type: application/json\n\n{\"username\": \"admin' OR 1=1--\", \"password\": \"x\"}",
    "content_type": "text/plain"
  }
}
```

### evidence_export

Export an evidence bundle as ZIP or JSON.

**Parameters:**
- `bundle_id` (required): The evidence bundle ID
- `format` (required): `zip` or `json`
- `include_redacted` (optional): If true, skip redaction (default: false)
- `output_path` (optional): File path to save the export

**Example:**
```json
{
  "bundle_id": "EB-ABC12345",
  "format": "zip",
  "include_redacted": false,
  "output_path": "/tmp/evidence-F001.zip"
}
```

### evidence_generate_report

Generate a security finding report from an evidence bundle.

**Parameters:**
- `bundle_id` (required): The evidence bundle ID
- `template` (required): `markdown` or `html`
- `title` (optional): Custom report title
- `include_artifacts` (optional): Include artifact contents (default: true)
- `custom_template` (optional): Path to a custom Handlebars template

**Example:**
```json
{
  "bundle_id": "EB-ABC12345",
  "template": "html",
  "title": "SQL Injection Finding Report"
}
```

## Redaction Patterns

The following sensitive data patterns are automatically redacted:

| Pattern | Description | Example |
|---------|-------------|---------|
| `api_key` | API keys | `api_key=abc123...` |
| `bearer_token` | Bearer tokens | `Bearer eyJhbG...` |
| `basic_auth` | Basic authentication | `Basic dXNlcm...` |
| `password` | Passwords | `password=secret` |
| `credit_card` | Credit card numbers | `4111-1111-1111-1111` |
| `ssn` | Social Security Numbers | `123-45-6789` |
| `email` | Email addresses | `user@example.com` |
| `private_ip` | Private IP addresses | `192.168.1.1`, `10.0.0.1` |
| `jwt_token` | JWT tokens | `eyJhbG...eyJzdW...` |
| `aws_key` | AWS access keys | `AKIAIOSFODNN7...` |
| `github_token` | GitHub tokens | `ghp_xxxx...`, `ghs_xxxx...` |

## Custom Templates

Create custom Handlebars templates for reports. Available variables:

```handlebars
{{finding_id}}       - Finding ID
{{bundle_id}}        - Bundle ID
{{created_at}}       - Bundle creation timestamp
{{generated_at}}     - Report generation timestamp
{{title}}            - Report title
{{metadata.title}}   - Finding title
{{metadata.severity}} - Severity level
{{metadata.description}} - Description
{{metadata.cvss_score}} - CVSS score
{{metadata.cwe_id}}  - CWE identifier

{{#each artifacts}}
  {{artifact_id}}    - Artifact ID
  {{type}}           - Artifact type
  {{name}}           - Artifact name
  {{content}}        - Artifact content
  {{content_type}}   - MIME type
  {{timestamp}}      - Artifact timestamp
  {{redacted}}       - Whether content was redacted
{{/each}}
```

## ZIP Export Structure

```
evidence-{bundle_id}/
├── manifest.json           # Bundle metadata and artifact index
├── artifacts/
│   ├── ART-001-request.txt
│   ├── ART-002-response.json
│   └── ...
└── report.md (or .html)    # Generated report (if included)
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck

# Start server
npm start
```

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## License

MIT
