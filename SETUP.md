# Setup Guide - AutoPentest

## Prerequisites
- Node.js 20+
- npm or yarn
- Git
- Gemini API key
- Burp Suite Professional (optional, for proxy integration)

## Quick Start

### 1. Build AutoPentest

```bash
# Navigate to AutoPentest directory
cd /mnt/d/testing_tool/AutoPentest

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Project Structure

```
/mnt/d/testing_tool/
├── .autopentest/                          # Configuration directory
│   ├── settings.json                      # MCP server and tool settings
│   ├── config.yaml                        # Project configuration
│   ├── skills/                            # Custom skills
│   └── commands/                          # Custom commands
├── AutoPentest/                           # Main CLI tool (base framework)
│   ├── packages/
│   │   ├── cli/                           # CLI application
│   │   ├── core/                          # Core library
│   │   ├── a2a-server/                    # A2A server
│   │   ├── test-utils/                    # Test utilities
│   │   └── vscode-ide-companion/          # VS Code extension
│   ├── bundle/                            # Bundled output
│   └── package.json                       # AutoPentest package config
├── mcp-servers/                           # MCP server projects (Phase 2+)
├── scope/                                 # Scope definitions
│   └── engagement.yaml                    # Engagement scope template
├── evidence/                              # Evidence storage
├── logs/                                  # Audit logs
├── data/                                  # Database files
├── tests/                                 # Project tests
│   └── phase1/                            # Phase 1 tests
├── CLAUDE.md                              # AI agent guidelines
├── SETUP.md                               # This file
├── package.json                           # Root workspace package.json
└── autonomous_pentest_engine_sandbox_dev_guide.md  # Development guide
```

### 3. Configuration

**API Key Setup:**
```bash
export GEMINI_API_KEY="your-api-key-here"
```

**Config Directory:**
AutoPentest uses `~/.autopentest/` for configuration:
- `settings.json` - User preferences
- `memory.md` - Persistent context

**Ignore File:**
Create `.autopentestignore` in your project root to exclude files from analysis.

**Scope Configuration:**
Define engagement scope in `scope/engagement.yaml`:
```yaml
allowlist:
  domains:
    - "*.example.com"
  ip_ranges:
    - "192.168.1.0/24"
denylist:
  domains:
    - "production.example.com"
constraints:
  rate_limits:
    requests_per_second: 10
    max_concurrent: 5
approval_policy:
  mode: "INTERACTIVE"  # INTERACTIVE, AUTO_APPROVE, DENY_ALL
```

### 4. Running AutoPentest

```bash
# Run from bundle (recommended for production)
cd /mnt/d/testing_tool/AutoPentest
node bundle/autopentest.js

# Or use npm start for development
npm start
```

### 5. Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | API key for Gemini models |
| `AUTOPENTEST_HOME` | Override home directory for config |
| `AUTOPENTEST_SANDBOX` | Sandbox mode (false/docker/podman) |
| `AUTOPENTEST_DEBUG` | Enable debug logging |

### 6. MCP Servers

| Server | Status | Description |
|--------|--------|-------------|
| scope-guard-mcp | Implemented | Scope validation and budget tracking |
| http-client-mcp | Implemented | Rate-limited HTTP client with correlation headers |
| auth-tester-mcp | Implemented | BOLA/IDOR differential testing with multiple identities |
| validator-mcp | Implemented | Finding validation with reproduction and confidence scoring |
| evidence-mcp | Implemented | Evidence bundling, redaction, report generation, audit trail |
| nuclei-mcp | Implemented | Nuclei vulnerability scanner wrapper with mock mode |
| fuzzer-mcp | Implemented | Schema-based API fuzzer with signal detection |
| Recon MCP | Planned | DNS, subdomain enumeration |
| Burp MCP | Planned | Burp Suite integration |
| ZAP MCP | Future | OWASP ZAP integration |

### 7. Custom Commands

| Command | Description |
|---------|-------------|
| `/scope` | Display current engagement scope and budget status |
| `/engage` | Start new pentest engagement with scope validation |
| `/killswitch` | Emergency stop - halt all testing operations |

### 8. Skills

| Skill | Description |
|-------|-------------|
| pentest-planner | Generate structured test hypotheses from attack surface |
| vulnerability-validator | Validate findings with reproduction and controls |

## Development Phases Status

- [x] Phase 1: Environment Setup (Completed 2026-02-05)
  - Created project directory structure
  - Created configuration files (settings.json, config.yaml)
  - Created engagement scope template
  - Set up npm workspaces
  - Phase 1 tests passing (38 tests)
- [x] Phase 2-9: Core MCP Servers (Completed 2026-02-05)
  - scope-guard-mcp, http-client-mcp, auth-tester-mcp
  - validator-mcp, evidence-mcp
  - 451+ tests passing
- [x] Phase 10: Advanced Tools (Completed 2026-02-05)
  - nuclei-mcp: Nuclei vulnerability scanner wrapper
  - fuzzer-mcp: Schema-based API fuzzer
  - Audit trail components (run manifest, action ledger)
  - Custom commands (/scope, /engage, /killswitch)
  - Skills (pentest-planner, vulnerability-validator)
  - 130+ new tests
- [ ] Phase 11: ZAP Integration (Future)
- [ ] Phase 12: Full Orchestration

## Troubleshooting

### Common Issues

**Node.js version mismatch:**
```bash
# Check version
node --version
# Should be 20.x or higher
```

**Build errors:**
```bash
# Clean and rebuild
rm -rf node_modules
npm install
npm run build
```

**API key not found:**
Ensure the environment variable is set in your current shell session.

**Bundle not found:**
Run `npm run bundle` to create the bundle.

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-02-05 | Phase 10: Added nuclei-mcp, fuzzer-mcp, audit trail, commands, skills | AI Agent |
| 2026-02-05 | Added evidence-mcp: Evidence bundling, redaction, report generation (135 tests) | AI Agent |
| 2026-02-05 | Added validator-mcp: Finding validation with confidence scoring (105 tests) | AI Agent |
| 2026-02-05 | Added auth-tester-mcp: BOLA/IDOR differential testing (75 tests) | AI Agent |
| 2026-02-05 | Phase 1 completed: directory structure, configs, scope template, tests | AI Agent |
| 2026-02-05 | Renamed from gemini-cli to AutoPentest | AI Agent |
| 2026-02-05 | Initial SETUP.md created | AI Agent |

---
*This file should be updated after every major change to the project.*
