<div align="center">

# 🛡️ AutoPentest

**AI-Powered Penetration Testing Platform with 118 MCP Tools**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)
[![Docker](https://img.shields.io/badge/Docker-Kali_Linux-orange.svg)](https://www.kali.org/)
[![Tools](https://img.shields.io/badge/Tools-118-purple.svg)](#mcp-tools-118-total)
[![Tests](https://img.shields.io/badge/Tests-377_passing-brightgreen.svg)](#testing)
[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)

[Quick Start](#-quick-start) • [Features](#-features) • [Architecture](#-architecture) • [Tools](#-mcp-tools-118-total) • [Docker Setup](#-docker-setup) • [Documentation](#-documentation)

</div>

---

## 📋 What is AutoPentest?

**AutoPentest** is a unified MCP (Model Context Protocol) server that provides AI assistants with comprehensive penetration testing capabilities. Born from merging 10 TypeScript MCP servers + 1 Python server into a single, state-sharing system.

### 🎯 Core Capabilities

- 🐧 **Kali Linux Container** - 400+ security tools (nmap, sqlmap, ffuf, nuclei, metasploit)
- 🔧 **118 MCP Tools** across 23 specialized modules
- 🎭 **Browser Automation** with Playwright for web app testing and XSS detection
- 🗄️ **PostgreSQL + pgvector** for world model and semantic search
- 🛡️ **Scope Guard** ensuring all testing stays within authorized boundaries
- 📊 **React Dashboard** to track assessments, findings, and evidence
- 🤖 **LLM-Friendly** with structured prompts, tool metadata, and workflow guides

---

## ✨ Features

### 🔍 Complete Finding Documentation
- **Structured Fields**: CVSS v3.1 vectors/scores, affected endpoints, descriptions, attack scenarios, recommendations
- **Evidence Storage**: JSON-structured HTTP request/response/payload evidence
- **Markdown Rendering**: Rich text formatting in UI (bold, code blocks, lists, tables)
- **Auto-Computation**: CVSS scores automatically computed from vectors
- **25 Risk Signals**: All auto-detected findings include CVSS vectors and detailed attack scenarios

### 🧪 Advanced Testing Capabilities
- **8 LLM-in-the-Loop Tools**: Manual security testing with full HTTP traffic visibility
- **Coverage Engine**: Matrix-based tracking of endpoint × vulnerability class testing
- **Automated Payloads**: 300+ payloads across 46 vulnerability classes
- **Differential Testing**: BOLA/IDOR detection with multi-identity comparison
- **Finding Validation**: 3-phase validation (repro, negative control, confidence scoring)

### 🎯 LLM Orchestration
- **5-Phase Methodology**: Reconnaissance → Mapping → Vulnerability Assessment → Exploitation → Reporting
- **Dynamic Guidance**: Phase-specific tool recommendations and sequencing
- **Tool Metadata**: Categories, dependencies, risk levels, budget impact
- **5 MCP Resources**: Workflow guides, attack patterns, error recovery, budget optimization
- **Phase Gates**: Requirements-based progression (coverage %, findings count)

### 🔐 Security & Compliance
- **Scope Validation**: Every HTTP request validated against engagement scope
- **Budget Tracking**: Rate limits and request budgets prevent runaway testing
- **Audit Trail**: Activity logging with correlation IDs for full traceability
- **Evidence Redaction**: Automatic credential/token redaction in exports
- **Approval Policy**: High-risk actions can require human confirmation

---

## 🚀 Recent Updates

### Latest Release (2024-02-10)
**Complete Finding Fields Implementation**
- ✅ Added `evidence` column for structured HTTP evidence storage (JSON format)
- ✅ CVSS auto-computation in both backend API and MCP tools
- ✅ Expanded risk signals from 5-tuple to 7-tuple (added CVSS vectors + attack scenarios)
- ✅ Markdown rendering for all finding text fields (description, attack scenario, recommendation)
- ✅ Evidence display with color-coded HTTP request/response panels
- ✅ Removed technical_analysis duplication (was duplicate of description field)
- ✅ All findings now explicitly marked as `status="confirmed"`
- ✅ 377 tests passing (100% coverage for new features)

### Previous Milestones
- **PostgreSQL Migration**: SQLite → PostgreSQL with pgvector for semantic search
- **Universal Exchange Analysis**: All HTTP-making tools run security analysis
- **Risk Signal Alignment**: Perfect mapping of 25 signal types to finding cards
- **Phase Filtering**: Tools filtered by current phase to reduce decision paralysis
- **Testing Engine Refactor**: Decision-maker → data provider pattern

---

## 🚀 Quick Start

### Prerequisites

- **Docker Desktop** (or Docker Engine + Compose)
- **Python 3.10+** for the MCP server
- **An AI Client** with MCP support (Claude Code, Claude Desktop, Gemini CLI, etc.)

```bash
# Clone
git clone <repo-url>
cd AutoPentest

# Start the full stack (postgres, backend, kali, frontend)
docker-compose up -d

# Or just start the MCP server standalone
./start_mcp.sh
```

### Connect Your AI Client

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "autopentest": {
      "command": "/bin/bash",
      "args": ["/absolute/path/to/AutoPentest/start_mcp.sh"]
    }
  }
}
```

---

## 🏗️ Architecture

AutoPentest consolidates what was previously 10 TypeScript MCP servers + 1 Python server into a **single unified Python MCP server** with shared state and PostgreSQL persistence.

```
AutoPentest/
├── backend/
│   ├── mcp/
│   │   ├── autopentest_server.py          # MCP entry point (registry dispatch)
│   │   └── modules/
│   │       ├── service.py                 # Core service (container mgmt, state)
│   │       ├── resources.py               # 9 MCP resources (workflow guides)
│   │       ├── tools_assessment.py        # 4 tools: assessments & orchestration
│   │       ├── tools_cards.py             # 4 tools: finding/observation cards
│   │       ├── tools_recon.py             # 2 tools: asset/discovery tracking
│   │       ├── tools_execution.py         # 1 tool: Kali command execution
│   │       ├── tools_scanning.py          # 5 tools: nmap, subdomain, SSL, tech
│   │       ├── tools_credentials.py       # 2 tools: credential storage
│   │       ├── tools_scope.py             # 6 tools: validation, budget, constraints
│   │       ├── tools_http.py              # 3 tools: rate-limited HTTP client
│   │       ├── tools_fuzzer.py            # 3 tools: API fuzzing (deprecated)
│   │       ├── tools_nuclei.py            # 3 tools: Nuclei scanner integration
│   │       ├── tools_openapi.py           # 6 tools: OpenAPI spec analysis
│   │       ├── tools_validator.py         # 4 tools: finding validation
│   │       ├── tools_evidence.py          # 4 tools: evidence bundling/export
│   │       ├── tools_auth_tester.py       # 3 tools: BOLA/IDOR testing
│   │       ├── tools_world_model.py       # 16 tools: PostgreSQL world model
│   │       ├── tools_browser.py           # 15 tools: Playwright automation
│   │       ├── tools_risk.py              # 3 tools: CVSS, risk scoring
│   │       ├── tools_coverage.py          # 6 tools: coverage matrix tracking
│   │       ├── tools_recon_pipeline.py    # 3 tools: automated recon workflows
│   │       ├── tools_endpoint_analysis.py # 3 tools: LLM endpoint probing
│   │       ├── tools_crawler.py           # 3 tools: web crawler
│   │       ├── tools_sequences.py         # 4 tools: business logic testing
│   │       ├── tools_testing_engine.py    # 7 tools: systematic vuln testing
│   │       ├── tools_pentest.py           # 8 tools: LLM-in-the-loop testing
│   │       └── lib/                       # 43 supporting library modules
│   ├── api/                               # FastAPI REST endpoints
│   ├── models/                            # SQLAlchemy ORM models
│   ├── schemas/                           # Pydantic validation schemas
│   ├── services/                          # Business logic layer
│   └── config.py                          # Pydantic settings
├── frontend/                              # React dashboard (Vite + Tailwind)
├── docker-compose.yml                     # 4 services orchestration
├── Dockerfile.kali                        # Kali Linux security container
├── start_mcp.sh                           # MCP server launcher
└── CLAUDE.md                              # LLM agent workflow guide
```

### 🗄️ Data Architecture

- **PostgreSQL 16** with **pgvector** extension for semantic search
- **World Model Tables**: 10 `wm_*` prefixed tables with per-assessment isolation
- **Cards Table**: Finding/observation storage with structured fields (CVSS, evidence, etc.)
- **Activity Log**: Full audit trail with correlation IDs
- **Assessment Metadata**: Engagement scope, phase tracking, budget

---

## 🔧 MCP Tools (118 Total)

### Tool Distribution Across 23 Modules

| Module | Count | Key Tools |
|--------|-------|-----------|
| 🎯 **Assessment** | 4 | `load_assessment`, `orchestration_status`, `orchestration_advance` |
| 📝 **Cards** | 4 | `add_card`, `list_cards`, `update_card`, `delete_card` |
| 🔍 **Recon** | 2 | `add_recon_data`, `list_recon` |
| ⚡ **Execution** | 1 | `execute` (Kali command runner) |
| 🔎 **Scanning** | 5 | `scan`, `subdomain_enum`, `ssl_analysis`, `tech_detection` |
| 🔑 **Credentials** | 2 | `credentials_add`, `credentials_list` |
| 🎯 **Scope** | 6 | `scope_validate_target`, `scope_check_budget`, `scope_get_allowlist` |
| 🌐 **HTTP** | 3 | `http_send`, `http_send_batch`, `http_get_stats` |
| 🎲 **Fuzzer** | 3 | `fuzz_endpoint`, `fuzz_parameter` (deprecated, use pentest tools) |
| ☢️ **Nuclei** | 3 | `nuclei_scan_single`, `nuclei_scan_template`, `nuclei_list_templates` |
| 📄 **OpenAPI** | 6 | `openapi_parse`, `openapi_list_endpoints`, `openapi_get_endpoint` |
| ✅ **Validator** | 4 | `validate_repro`, `validate_negative_control`, `validate_promote` |
| 📦 **Evidence** | 4 | `evidence_bundle`, `evidence_add_artifact`, `evidence_export` |
| 🔐 **Auth Tester** | 3 | `auth_diff_test`, `auth_get_identities`, `auth_replay_with_identity` |
| 🗃️ **World Model** | 16 | `wm_add_asset`, `wm_add_endpoint`, `wm_add_finding`, `wm_query` |
| 🌐 **Browser** | 15 | `browser_navigate`, `browser_test_xss`, `browser_screenshot` |
| ⚠️ **Risk** | 3 | `risk_calculate_cvss`, `risk_score_finding`, `risk_classify` |
| 📊 **Coverage** | 6 | `coverage_init`, `coverage_mark`, `coverage_get_matrix` |
| 🔄 **Recon Pipeline** | 3 | `recon_pipeline_run`, `recon_pipeline_status` |
| 🎯 **Endpoint Analysis** | 3 | `endpoint_probe`, `endpoint_analyze_batch`, `endpoint_get_insights` |
| 🕷️ **Crawler** | 3 | `crawler_start`, `crawler_status`, `crawler_get_results` |
| 🔗 **Sequences** | 4 | `sequence_record`, `sequence_data_ownership`, `sequence_replay` |
| 🧪 **Testing Engine** | 7 | `testing_build_matrix`, `testing_next`, `testing_status` |
| 🛡️ **Pentest** | 8 | `recon_endpoint`, `inject_payload`, `inject_batch`, `record_finding` |

### 🎭 Featured Tool Categories

#### LLM-in-the-Loop Testing (8 tools)
Manual security testing with full HTTP visibility and control:
- `recon_endpoint` - Send baseline requests, examine full responses (8KB+)
- `analyze_headers` - Check security headers and cookie configuration
- `get_test_payloads` - Retrieve payloads from 300+ payload library
- `inject_payload` - Single payload injection with full request/response
- `inject_batch` - Sweep multiple payloads, compare to baseline
- `discover_attack_surface` - View endpoints, parameters, known findings
- `record_finding` - Persist confirmed vulnerabilities with evidence
- `get_test_progress` - Track coverage, findings count, budget usage

#### Coverage & Orchestration (10 tools)
Systematic testing with phase-based methodology:
- `orchestration_status` - Current phase, gates, metrics
- `orchestration_advance` - Progress to next phase (with gate checks)
- `coverage_init` - Initialize endpoint × vuln_class matrix
- `coverage_mark` - Mark cell as tested/vulnerable/safe
- `coverage_get_matrix` - Get current coverage state
- `coverage_next` - Get next high-priority cell to test
- `testing_build_matrix` - Build test plan for endpoint
- `testing_next` - Get next test to execute
- `testing_status` - View testing progress and compliance

---

## 🐳 Docker Setup

The `docker-compose.yml` orchestrates four services:

| Service | Container | Image | Purpose | Ports |
|---------|-----------|-------|---------|-------|
| **postgres** | `autopentest_postgres` | `pgvector/pgvector:pg16` | PostgreSQL 16 + pgvector | 5433:5432 |
| **backend** | `autopentest_backend` | Custom (FastAPI) | REST API + MCP server | 8000:8000 |
| **kali** | `kali-autopentest` | Custom (Kali) | Security tools container | - |
| **frontend** | `autopentest_frontend` | Custom (React) | Web dashboard | 5173:5173 |

### 🚀 Quick Commands

```bash
# Start all services
docker compose up -d

# Check service health
docker compose ps

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Access Kali container
docker exec -it kali-autopentest bash

# Restart services after code changes
docker compose restart backend frontend

# Stop everything
docker compose down

# Full reset (WARNING: deletes data)
docker compose down -v
```

### 📊 Service Endpoints

- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs (Swagger UI)
- **Frontend Dashboard**: http://localhost:5173
- **PostgreSQL**: localhost:5433 (username: `autopentest`, database: `autopentest_db`)

---

## 🧪 Testing

Comprehensive test suite with 377 tests and 100% pass rate.

### Run Tests

```bash
# Run all tests
cd backend
venv/bin/python -m pytest tests/ -v

# Run specific test file
venv/bin/python -m pytest tests/test_finding_fields.py -v

# Run with coverage report
venv/bin/python -m pytest tests/ --cov=mcp --cov-report=html

# Fast run (stop on first failure)
venv/bin/python -m pytest tests/ -x -q
```

### Test Coverage

| Category | Tests | Status |
|----------|-------|--------|
| **Finding Fields** | 19 | ✅ All pass |
| **Risk Signals** | 12 | ✅ All pass |
| **Exchange Analysis** | 8 | ✅ All pass |
| **Coverage Engine** | 22 | ✅ All pass |
| **World Model** | 28 | ✅ All pass |
| **HTTP Tools** | 15 | ✅ All pass |
| **Orchestration** | 14 | ✅ All pass |
| **Pentest Tools** | 20 | ✅ All pass |
| **Other Modules** | 239 | ✅ All pass |
| **Total** | **377** | ✅ **100%** |

---

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp backend/.env.example backend/.env
```

**Key Settings:**

```bash
# Database
DATABASE_URL=postgresql+asyncpg://autopentest:autopentest@localhost:5433/autopentest_db

# MCP Server
BACKEND_API_URL=http://localhost:8000
DEFAULT_CONTAINER_NAME=kali-autopentest

# Scope & Security
SCOPE_FILE=/path/to/engagement-scope.yaml

# Optional: External Services
GOOGLE_API_KEY=your-key-here  # For AI browser features
```

### Engagement Scope File

Create a `scope.yaml` to define authorized targets:

```yaml
engagement:
  id: "ENG-2024-001"
  name: "Example Web App Assessment"
  client: "Example Corp"

allowed_targets:
  - "https://example.com/*"
  - "https://api.example.com/*"
  - "10.0.1.0/24"

constraints:
  max_requests_per_hour: 1000
  max_parallel_requests: 10
  respect_robots_txt: true

excluded_paths:
  - "/admin/delete/*"
  - "/api/users/*/delete"
```

---

## 📚 Documentation

### For LLM Agents

- **[CLAUDE.md](./CLAUDE.md)** - Complete workflow guide for AI assistants
  - 5-phase pentest methodology
  - 8-step LLM-in-the-loop testing workflow
  - Tool usage patterns and best practices
  - Phase gates and progression rules
  - Simple vulnerability checklist (8 mandatory tests)

### For Developers

- **[AGENTS.md](./AGENTS.md)** - Agent architecture and design patterns
- **Backend API**: http://localhost:8000/docs - Interactive Swagger documentation
- **Test Suite**: `backend/tests/` - 377 tests with examples

### MCP Resources (Loaded by LLM)

AutoPentest provides 9 MCP resources for in-context guidance:

1. `autopentest://pentest-workflow` - 8-step manual testing workflow
2. `autopentest://workflow-guide` - Dynamic per-phase recommendations
3. `autopentest://attack-patterns` - Multi-tool exploitation chains
4. `autopentest://error-recovery` - Common errors + recovery steps
5. `autopentest://budget-optimization` - Budget strategies per phase
6. `autopentest://tool-dependencies` - Tool sequencing and prerequisites
7. `autopentest://tool-metadata` - Machine-readable tool categories
8. `kali://status` - Current assessment status
9. `kali://containers` - List of Kali pentesting containers

---

## 📦 Dependencies

### Backend (`backend/requirements.txt`)

**Core Framework:**
- `fastapi>=0.109.0` - Modern async web framework
- `uvicorn>=0.27.0` - ASGI server
- `sqlalchemy>=2.0.25` - ORM with async support
- `asyncpg>=0.29.0` - PostgreSQL async driver
- `pgvector>=0.2.4` - Vector similarity search

**MCP & Integration:**
- `mcp>=1.0.0` - Model Context Protocol SDK
- `httpx>=0.26.0` - Async HTTP client with rate limiting
- `playwright>=1.41.0` - Browser automation

**Security & Validation:**
- `pydantic>=2.5.0` - Data validation and settings
- `pyyaml>=6.0.1` - Scope file parsing
- `cryptography>=41.0.0` - Encryption and hashing

**Testing & Utilities:**
- `pytest>=7.4.0` - Test framework
- `pytest-asyncio>=0.21.0` - Async test support
- `jinja2>=3.1.3` - Report templates
- `markdown>=3.5.0` - Markdown processing

**Optional:**
- `google-generativeai` - AI-powered browser features

### Frontend (`frontend/package.json`)

**Core:**
- `react@18.2.0` - UI framework
- `react-router-dom@6.21.3` - Routing
- `vite@5.0.11` - Build tool

**UI Components:**
- `antd@5.13.2` - Component library
- `lucide-react@0.309.0` - Icon library
- `react-markdown@9.0.1` - Markdown rendering
- `remark-gfm@4.0.0` - GitHub-flavored markdown

**Styling:**
- `tailwindcss@3.4.1` - Utility-first CSS
- `autoprefixer@10.4.17` - CSS vendor prefixes

---

## 🔒 Security & Compliance

### Built-in Safety Features

| Feature | Description |
|---------|-------------|
| 🎯 **Scope Enforcement** | Every HTTP request validated against engagement scope YAML |
| 💰 **Budget Tracking** | Rate limits (requests/hour) prevent runaway testing |
| 🔍 **Audit Trail** | Activity logging with correlation IDs (engagement, action, request) |
| 🔐 **Evidence Redaction** | Automatic credential/token redaction in exports (API keys, passwords, JWTs) |
| ✋ **Approval Policy** | High-risk actions can require human confirmation |
| 🚫 **Phase Gates** | Requirements-based progression prevents premature advancement |

### Responsible Use

⚠️ **IMPORTANT**: AutoPentest is designed for **authorized security testing only**.

- ✅ **DO**: Use with written authorization and defined scope
- ✅ **DO**: Configure `scope.yaml` with allowed targets
- ✅ **DO**: Review and adjust budget constraints
- ❌ **DON'T**: Test systems without explicit permission
- ❌ **DON'T**: Use for malicious purposes or unauthorized access
- ❌ **DON'T**: Disable safety features (scope validation, rate limiting)

**Legal Disclaimer**: Users are solely responsible for ensuring they have proper authorization before conducting any security testing. Unauthorized access to computer systems is illegal in most jurisdictions.

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

### Development Setup

```bash
# Clone and setup
git clone <repo-url>
cd AutoPentest

# Create virtual environment
cd backend
python3.12 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest tests/ -v

# Start services
cd ..
docker compose up -d
```

### Code Standards

- **Python**: Follow PEP 8, use type hints, add docstrings
- **Tests**: Write tests for new features (maintain 100% pass rate)
- **Commits**: Use descriptive commit messages with `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>` for AI-assisted development
- **Documentation**: Update README.md and CLAUDE.md for user-facing changes

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Run the test suite (`pytest tests/ -v`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request with a clear description

---

## 📊 Project Statistics

- **Lines of Code**: ~30,000 (Python + JavaScript)
- **MCP Tools**: 118 across 23 modules
- **Test Coverage**: 377 tests, 100% pass rate
- **Payload Library**: 300+ payloads, 46 vulnerability classes
- **Risk Signals**: 25 auto-detected finding types
- **World Model Tables**: 10 PostgreSQL tables
- **Supported Phases**: 5-phase pentest methodology
- **Active Development**: ✅ Maintained

---

## 📄 License

**GNU Affero General Public License v3.0 (AGPL-3.0)**

This project is free and open-source software licensed under AGPL-3.0. See [LICENSE](./LICENSE) for details.

**Key Points:**
- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ⚠️ Must disclose source code
- ⚠️ Must use same license for derivatives
- ⚠️ Network use is distribution (AGPL requirement)

---

## 🙏 Acknowledgments

**Built With:**
- 🧠 [Claude Sonnet 4.5](https://www.anthropic.com/claude) - AI pair programming
- 🔌 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) - AI integration standard
- 🐧 [Kali Linux](https://www.kali.org/) - Security tools distribution
- 🐘 [PostgreSQL](https://www.postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector) - Database and vector search
- ⚡ [FastAPI](https://fastapi.tiangolo.com/) - Python web framework
- ⚛️ [React](https://react.dev/) - Frontend framework

**Inspired By:**
- [AIDA](https://github.com/Vasco0x4/AIDA) by Vasco0x4 - Original Python MCP server
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/) - Methodology foundation
- [PortSwigger Web Security Academy](https://portswigger.net/web-security) - Attack patterns

---

## 📞 Support & Contact

- **Issues**: [GitHub Issues](https://github.com/melbinkm/testing_tool/issues)
- **Documentation**: [CLAUDE.md](./CLAUDE.md) for LLM workflow guide
- **API Docs**: http://localhost:8000/docs (when running)

---

<div align="center">

**Made with ❤️ by the AutoPentest team**

⭐ Star this repo if you find it useful!

</div>
