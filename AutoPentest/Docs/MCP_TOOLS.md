# MCP Tools Reference

Complete reference for all MCP tools available to AI clients.

---

## Overview

AIDA exposes tools through the Model Context Protocol (MCP). These tools give AI assistants the ability to:

- Execute commands in Exegol containers
- Document findings and observations
- Track reconnaissance data
- Manage credentials
- Run specialized security scans

---

## 📋 MCP Tools Cheatsheet

| Category | Tool | Signature | Description |
|----------|------|-----------|-------------|
| **Assessment** | `load_assessment` | `load_assessment(name="Target")` | Load assessment and get full context |
| | `update_phase` | `update_phase(phase_number=1.0, content="...")` | Document progress in a phase |
| **Cards** | `add_card` | `add_card(card_type="finding", title="...", severity="HIGH", ...)` | Create finding card |
| | | `add_card(card_type="observation", title="...", notes="...")` | Create observation card |
| | | `add_card(card_type="info", title="...", context="...")` | Create info card |
| | `list_cards` | `list_cards()` | List all cards |
| | | `list_cards(card_type="finding", severity="CRITICAL")` | Filter cards by type/severity |
| | `update_card` | `update_card(card_id=42, status="confirmed", proof="...")` | Update existing card |
| | `delete_card` | `delete_card(card_id=42)` | Delete card by ID |
| **Recon** | `add_recon_data` | `add_recon_data(data_type="endpoint", name="/api/users", details={...})` | Add single recon entry |
| | | `add_recon_data(entries=[{...}, {...}])` | Batch import recon data |
| | `list_recon` | `list_recon()` | List all recon data |
| | | `list_recon(data_type="subdomain", limit=100)` | Filter recon by type |
| **Execution** | `execute` | `execute(command="nmap -sV 10.0.0.1")` | Run command in Exegol |
| | | `execute(command="...", phase="recon")` | Run with phase context |
| **Pentesting** | `scan` | `scan(type="nmap_quick", target="10.0.0.1")` | Quick nmap scan |
| | | `scan(type="nmap_full", target="10.0.0.1", ports="1-65535")` | Full port scan |
| | | `scan(type="gobuster", target="https://...", wordlist="medium")` | Directory enumeration |
| | | `scan(type="ffuf", target="https://.../FUZZ", wordlist="common")` | Web fuzzing |
| | `subdomain_enum` | `subdomain_enum(domain="acme.com")` | Find subdomains |
| | `ssl_analysis` | `ssl_analysis(target="acme.com:443")` | Analyze SSL/TLS config |
| | `tech_detection` | `tech_detection(url="https://acme.com")` | Detect technology stack |
| | `tool_help` | `tool_help(tool="sqlmap")` | Get tool documentation |
| **Credentials** | `credentials_add` | `credentials_add(credential_type="bearer_token", name="...", token="...")` | Store bearer token |
| | | `credentials_add(credential_type="cookie", name="...", cookie_value="...")` | Store cookie |
| | | `credentials_add(credential_type="ssh", username="...", password="...")` | Store SSH credentials |
| | `credentials_list` | `credentials_list()` | List all stored credentials |
| | | `credentials_list(credential_type="bearer_token")` | Filter by credential type |

---

## Tool Categories

| Category | Tools | Purpose |
|----------|-------|---------|
| [Assessment](#assessment-management) | 2 | Load and update assessments |
| [Cards](#cards-management) | 4 | Findings, observations, info |
| [Recon](#reconnaissance) | 2 | Track discovered assets |
| [Execution](#command-execution) | 1 | Run commands in Exegol |
| [Pentesting](#pentesting-tools) | 5 | Specialized security tools |
| [Credentials](#credentials-management) | 2 | Store and retrieve creds |

---

## Assessment Management

### `load_assessment`

Load an existing assessment to begin work.

> Assessments are created via the web interface, not by the AI.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Assessment name |
| `skip_data` | boolean | No | If true, only sets context without returning data |

**Returns:**
- Assessment metadata (name, target, container)
- Existing findings and observations
- Recon data collected so far
- Recent command history
- Stored credentials (placeholders only)

---

### `update_phase`

Document progress in a phase section.

**Example:**

```python
update_phase(
    phase_number=1.0,
    content="## Initial Reconnaissance\n\nCompleted nmap scan of 10.0.0.1\nFound 3 open ports: 22, 80, 443\nIdentified nginx 1.18.0 on port 80"
)
```

---

## Cards Management

Cards are the primary way to document findings.

### `add_card`

Create a finding, observation, or info card.

**Examples:**

```python
# Critical finding
add_card(
    card_type="finding",
    title="SQL Injection in Login Form",
    severity="CRITICAL",
    status="confirmed",
    target_service="https://app.acme.com/login",
    technical_analysis="The login form is vulnerable to SQL injection via the username parameter.",
    proof="sqlmap -u 'https://app.acme.com/login' --data='user=admin&pass=test' -p user --dbs"
)

# Observation
add_card(
    card_type="observation",
    title="Missing Rate Limiting",
    target_service="https://app.acme.com/api",
    notes="The API does not implement rate limiting. This could allow brute force attacks."
)

# Info
add_card(
    card_type="info",
    title="Technology Stack",
    context="Frontend: React 18\nBackend: Node.js/Express\nDatabase: PostgreSQL 14"
)
```

**Returns:** Card ID

---

### `list_cards`

List all cards with optional filters.

**Examples:**

```python
# All cards
list_cards()

# Only critical findings
list_cards(card_type="finding", severity="CRITICAL")

# All observations
list_cards(card_type="observation")
```

---

### `update_card`

Update an existing card by ID.

**Example:**

```python
update_card(
    card_id=42,
    status="confirmed",
    proof="Additional exploitation proof:\n$ curl -X POST..."
)
```

---

### `delete_card`

Delete a card by ID.

**Example:**

```python
delete_card(card_id=42)
```

---

## Reconnaissance

Track discovered assets automatically.

### `add_recon_data`

Add reconnaissance data (single or batch).

**Examples:**

```python
# Single entry
add_recon_data(
    data_type="subdomain",
    name="api.acme.com",
    details={"ip": "10.0.0.5", "source": "subfinder"}
)

# Batch entry
add_recon_data(entries=[
    {"data_type": "endpoint", "name": "/api/v1/users"},
    {"data_type": "endpoint", "name": "/api/v1/admin"},
    {"data_type": "endpoint", "name": "/api/v1/config"},
])
```

---

### `list_recon`

List reconnaissance data with filters.

**Examples:**

```python
# All recon data
list_recon()

# Just endpoints
list_recon(data_type="endpoint")

# Just subdomains
list_recon(data_type="subdomain", limit=100)
```

---

## Command Execution

### `execute`

Execute any command in the Exegol container.

**Examples:**

```python
# Simple command
execute(command="whoami")

# With phase context
execute(
    command="nmap -sV -sC 10.0.0.1",
    phase="reconnaissance"
)

# Complex command
execute(command="sqlmap -u 'https://target.com/api?id=1' --dbs --batch")
```

**Returns:**
- Command output (stdout/stderr)
- Exit code
- Execution time

**Notes:**
- Commands may require approval based on settings
- Output is truncated to configured max length
- Credential placeholders (`{{TOKEN}}`) are auto-substituted

---

## Pentesting Tools

Specialized wrappers for common security tools.

### `scan`

Run security scans with common tools.

**Scan Types:**

| Type | Tool | Purpose |
|------|------|---------|
| `nmap_quick` | nmap | Fast scan of top ports |
| `nmap_full` | nmap | All ports + version detection |
| `nmap_vuln` | nmap | Vulnerability scripts |
| `gobuster` | gobuster | Directory enumeration |
| `ffuf` | ffuf | Web fuzzing |
| `dirb` | dirb | Directory bruteforce |
| `nikto` | nikto | Web server scanner |

**Wordlist Options:**

| Option | Description |
|--------|-------------|
| `common` | Fast, common paths |
| `medium` | Balanced |
| `large` | Thorough |
| `dirb` | dirb default list |
| `raft-small` | Raft small words |
| `raft-medium` | Raft medium words |

**Examples:**

```python
# Quick nmap scan
scan(type="nmap_quick", target="10.0.0.1")

# Full port scan with version detection
scan(type="nmap_full", target="10.0.0.1", ports="1-65535")

# Directory enumeration
scan(
    type="gobuster",
    target="https://app.acme.com",
    wordlist="medium",
    extensions="php,html,js"
)

# Web fuzzing with custom flags
scan(
    type="ffuf",
    target="https://app.acme.com/FUZZ",
    wordlist="common",
    extra_flags="-mc 200,301,302"
)
```

---

### `subdomain_enum`

Enumerate subdomains for a domain.

**Example:**

```python
subdomain_enum(domain="acme.com")
```

---

### `ssl_analysis`

Analyze SSL/TLS certificate and configuration.

**Examples:**

```python
ssl_analysis(target="acme.com")
ssl_analysis(target="10.0.0.1:8443")
```

**Checks:**
- Certificate validity
- Cipher suites
- Protocol versions
- Known vulnerabilities

---

### `tech_detection`

Detect technology stack of a website.

**Example:**

```python
tech_detection(url="https://app.acme.com")
```

Uses: whatweb, wappalyzer (if available)

---

### `tool_help`

Get help documentation for a tool.

**Example:**

```python
tool_help(tool="sqlmap")
```

Returns: Tool availability and help output

---

## Credentials Management

Store and retrieve discovered credentials.

### `credentials_add`

Add authentication credentials.

**Credential Types:**

| Type | Fields | Use |
|------|--------|-----|
| `bearer_token` | `token` | API bearer tokens |
| `api_key` | `token` | API keys |
| `basic_auth` | `username`, `password` | HTTP basic auth |
| `cookie` | `cookie_value` | Session cookies |
| `ssh` | `username`, `password` | SSH credentials |
| `custom` | `custom_data` | Other formats |

**Examples:**

```python
# Bearer token
credentials_add(
    credential_type="bearer_token",
    name="Admin API Token",
    token="eyJhbGciOiJIUzI1NiIs...",
    service="API",
    target="https://api.acme.com"
)
# Creates placeholder: {{ADMIN_API_TOKEN}}

# SSH credentials
credentials_add(
    credential_type="ssh",
    name="Web Server Root",
    username="root",
    password="admin123",
    target="10.0.0.5"
)
# Creates placeholder: {{WEB_SERVER_ROOT}}

# Cookie
credentials_add(
    credential_type="cookie",
    name="Admin Session",
    cookie_value="session=abc123; admin=true",
    notes="Expires in 24 hours"
)
```

**Placeholder Substitution:**

Once stored, use placeholders in commands:

```python
execute(command="curl -H 'Authorization: Bearer {{ADMIN_API_TOKEN}}' https://api.acme.com/admin")
```

The placeholder is automatically replaced with the actual token.

---

### `credentials_list`

List all stored credentials.

---

## Related Documentation

- [User Guide](USER_GUIDE.md) - How to use the platform
- [Architecture](ARCHITECTURE.md) - Technical deep dive
- [Installation](INSTALLATION.md) - Setup guide
