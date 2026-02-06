# Nuclei MCP Server

MCP server for Nuclei vulnerability scanner integration with mock mode support.

## Overview

This MCP server provides tools for running Nuclei vulnerability scans against web targets. It includes:

- **nuclei_scan_single**: Scan a single URL with a specific template
- **nuclei_scan_template**: Run templates against multiple targets
- **nuclei_list_templates**: List available templates with filtering

## Features

- **Mock Mode**: Automatically activates when Nuclei binary is not found, enabling testing without actual scans
- **Template Management**: Browse and filter Nuclei templates by severity, tags, and search terms
- **Rate Limiting**: Respects configured rate limits for responsible scanning
- **Scope Validation**: Designed to integrate with scope-guard-mcp for target validation

## Installation

```bash
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NUCLEI_PATH` | `nuclei` | Path to nuclei binary |
| `TEMPLATES_DIR` | `./nuclei-templates` | Path to templates directory |
| `RATE_LIMIT` | `10` | Maximum requests per second |
| `TIMEOUT` | `30000` | Scan timeout in milliseconds |
| `MOCK_MODE` | `false` | Force mock mode even if binary exists |

## Usage

### Starting the Server

```bash
npm start
```

### MCP Tools

#### nuclei_scan_single

Scan a single URL with a specific Nuclei template.

**Input:**
```json
{
  "target": "https://example.com",
  "template_id": "cves/2021/CVE-2021-44228",
  "timeout": 30000
}
```

**Output:**
```json
{
  "success": true,
  "result": {
    "target": "https://example.com",
    "template": "cves/2021/CVE-2021-44228",
    "findings": [...],
    "scan_time_ms": 1234,
    "mock_mode": false
  }
}
```

#### nuclei_scan_template

Run Nuclei templates against a list of targets.

**Input:**
```json
{
  "targets": ["https://example1.com", "https://example2.com"],
  "template_ids": ["cves/2021/CVE-2021-44228"],
  "tags": ["cve", "critical"],
  "severity": ["critical", "high"],
  "timeout": 60000
}
```

**Output:**
```json
{
  "success": true,
  "results": [...],
  "summary": {
    "total_targets": 2,
    "successful_scans": 2,
    "failed_scans": 0,
    "total_findings": 3
  }
}
```

#### nuclei_list_templates

List available Nuclei templates with optional filtering.

**Input:**
```json
{
  "severity": ["critical", "high"],
  "tags": ["cve"],
  "author": "pdteam",
  "search": "log4j",
  "limit": 10
}
```

**Output:**
```json
{
  "success": true,
  "templates": [
    {
      "id": "CVE-2021-44228",
      "name": "Apache Log4j RCE (Log4Shell)",
      "severity": "critical",
      "author": "pdteam",
      "tags": ["cve", "cve2021", "rce", "log4j"],
      "description": "...",
      "file_path": "cves/2021/CVE-2021-44228.yaml"
    }
  ],
  "total_count": 1000,
  "filtered_count": 15,
  "returned_count": 10
}
```

## Risk Levels

| Tool | Risk Level | Notes |
|------|------------|-------|
| `nuclei_scan_single` | HIGH | Requires scope validation |
| `nuclei_scan_template` | HIGH | Requires scope validation |
| `nuclei_list_templates` | LOW | Read-only operation |

## Integration with Scope Guard

Before using scanning tools, validate targets with scope-guard-mcp:

```javascript
// 1. Validate target is in scope
const scopeResult = await scopeGuard.check_target({ target: "https://example.com" });

// 2. If in scope, proceed with scan
if (scopeResult.allowed) {
  const scanResult = await nuclei.nuclei_scan_single({
    target: "https://example.com",
    template_id: "cves/2021/CVE-2021-44228"
  });
}
```

## Testing

```bash
npm test
```

## Mock Mode

When the Nuclei binary is not available or `MOCK_MODE=true`, the server operates in mock mode:

- Scans return simulated findings for known template IDs
- Template listing returns a predefined set of templates
- All responses include a `warning` field indicating mock mode

This enables development and testing without requiring the actual Nuclei installation.

## License

MIT
