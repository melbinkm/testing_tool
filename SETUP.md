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
├── CLAUDE.md                              # AI agent guidelines
├── SETUP.md                               # This file
├── autonomous_pentest_engine_sandbox_dev_guide.md  # Development guide
└── AutoPentest/                           # Main CLI tool
    ├── packages/
    │   ├── cli/                           # CLI application
    │   ├── core/                          # Core library
    │   ├── a2a-server/                    # A2A server
    │   ├── test-utils/                    # Test utilities
    │   └── vscode-ide-companion/          # VS Code extension
    ├── bundle/                            # Bundled output
    └── package.json                       # Root package config
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
Create a `scope.json` file to define allowed targets:
```json
{
  "domains": ["example.com"],
  "ip_ranges": ["192.168.1.0/24"],
  "excluded": ["admin.example.com"]
}
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
| Recon MCP | Planned | DNS, subdomain enumeration |
| HTTP MCP | Planned | Request/response handling |
| Burp MCP | Planned | Burp Suite integration |
| Evidence MCP | Planned | Finding documentation |

## Development Phases Status

- [ ] Phase 1: Environment Setup
- [ ] Phase 2: MCP Server Framework
- [ ] Phase 3: Recon Tools
- [ ] Phase 4: HTTP Testing
- [ ] Phase 5: Burp Integration
- [ ] Phase 6: Evidence Collection
- [ ] Phase 7: Orchestration
- [ ] Phase 8: Testing & Validation

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
| 2026-02-05 | Renamed from gemini-cli to AutoPentest | AI Agent |
| 2026-02-05 | Initial SETUP.md created | AI Agent |

---
*This file should be updated after every major change to the project.*
