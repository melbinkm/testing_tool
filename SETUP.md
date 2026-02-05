# Setup Guide - Autonomous Pentest Engine

## Prerequisites
- Node.js 20+
- npm or yarn
- Git
- Gemini API key
- Burp Suite Professional (optional, for proxy integration)

## Quick Start

### 1. Clone and Build Base Framework

```bash
# Clone gemini-cli (base framework)
cd /mnt/d/testing_tool
git clone https://github.com/anthropics/gemini-cli.git

# Install dependencies
cd gemini-cli
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
└── gemini-cli/                            # Base CLI framework
    ├── src/                               # Source code
    ├── tests/                             # Test files
    └── package.json                       # Dependencies
```

### 3. Configuration

**API Key Setup:**
```bash
export GEMINI_API_KEY="your-api-key-here"
```

**Scope Configuration:**
Create a `scope.json` file to define allowed targets:
```json
{
  "domains": ["example.com"],
  "ip_ranges": ["192.168.1.0/24"],
  "excluded": ["admin.example.com"]
}
```

### 4. Running the Engine

```bash
cd /mnt/d/testing_tool/gemini-cli
npm start
```

### 5. MCP Servers

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

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-02-05 | Initial SETUP.md created | AI Agent |

---
*This file should be updated after every major change to the project.*
