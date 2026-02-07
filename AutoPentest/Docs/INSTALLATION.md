# AIDA Installation Guide

Get AIDA running in 5 minutes.

---

## Prerequisites

Before we start, make sure you have:

| Requirement | Version | Check |
|-------------|---------|-------|
| **Docker Desktop** | Latest | `docker --version` |
| **Python** | 3.10+ | `python3 --version` |
| **Node.js** | 18+ | `node --version` |
| **Git** | Any | `git --version` |

Also needed:
- **Exegol** container ([Install guide](https://docs.exegol.com/first-install/))
- **An AI client** that supports MCP (Claude, Gemini, Antigravity...)

---

## Platform Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/Vasco0x4/AIDA.git
cd AIDA
```

### Step 2: Start the Platform

The easiest way - Docker Compose handles everything:

```bash
./start.sh
```

This starts:
- **PostgreSQL** on port `5432` - The database
- **Backend API** on port `8000` - FastAPI server
- **Frontend** on port `5173` - React dashboard

### Step 3: Verify It Works

Open your browser to [http://localhost:5173](http://localhost:5173)

You should see the AIDA dashboard.

---

## Step 4: Install and Setup Exegol

**Install Exegol:** Follow the official guide → https://docs.exegol.com/first-install

**Start the container:**
```bash
exegol start aida
```

When it asks which image to use, select ```web``` or the ```full``` one

Yeah, I know 40GB is a lot. I'm working on a lighter alternative.

**Configure AIDA:**

1. Go to http://localhost:5173/settings 
2. Under **Tools**, check if your Exegol container is detected
3. Set your default container name to `exegol-aida` (or whatever you named it)

---

## Step 5: Connect Your AI Client

Now you need to hook up AIDA to your AI assistant via MCP.

### Which AI Client Should I Use?

| AI Client | Recommendation | Setup Method |
|-----------|-----------|--------------|
| **Claude Code** | recommended | Use `aida.py` CLI (automatic) |
| **Vertex AI** | Recommended | Use `aida.py` with flags |
| **Antigravity** | Works | Manual MCP import |
| **Gemini CLI** | Works | Manual MCP import |
| **Claude Desktop** | Works | Manual MCP import |

---

## Claude Code

**Claude Code is recommended** because the AIDA CLI does everything for you.

### Prerequisites

You MUST have Claude Code installed and logged in:

### Launch AIDA

```bash
# Interactive - select assessment from list
python3 aida.py

# Direct launch with assessment name
python3 aida.py --assessment "MyTarget"

# With custom model
python3 aida.py --assessment "MyTarget" --model claude-opus-4-5
```

The CLI automatically:
- Generates MCP config
- Sets working directory to assessment workspace
- Injects the pentesting methodology preprompt
- Configures all tools

You can verify if the MCP server is correctly loaded using `/mcp`

<img src="../assets/doc/mcp.png" alt="MCP Server" width="33%" />



**That's it. You're ready.**

---

## Vertex AI (External API)

If you're using Vertex AI or another external API:

```bash
python3 aida.py --assessment "MyTarget" \
  --base-url "https://YOUR-VERTEX-ENDPOINT" \
  --api-key "YOUR-API-KEY" \
  --model claude-sonnet-4-5
```

Same benefits as Claude Code, but with your own API.

---

## Other AI Clients (Manual MCP Import)

For Antigravity, Gemini CLI, Claude Desktop, or ChatGPT, you need to manually configure the MCP server.

**The process:**

1. Import the MCP server config (see examples below)
2. Copy the preprompt from `Docs/PrePrompt.txt`
3. Paste it into your AI client when starting an assessment

> Antigravity works great if you select Claude. Gemini is OK. Other AI clients should work too - you can import MCP config anywhere you want.

### Config Paths

**Antigravity:** MCP settings (UI)

**Gemini CLI:** `~/.gemini/settings.json`

**Claude Desktop:**
* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
* **Linux:** `~/.config/Claude/claude_desktop_config.json`

**ChatGPT Desktop:**
* **macOS:** `~/Library/Application Support/ChatGPT/mcp_config.json`

### MCP Configuration

Add this to your config file (replace `/absolute/path/to/AIDA/` with your actual path):

```json
{
  "mcpServers": {
    "aida-mcp": {
      "command": "/bin/bash",
      "args": [
        "/absolute/path/to/AIDA/start_mcp.sh"
      ]
    }
  }
}
```

⚠️ **Important:** Replace `/absolute/path/to/AIDA/` with your actual AIDA directory path.

**After MCP setup:**
- Restart your AI client
- Copy the preprompt from `Docs/PrePrompt.txt` and paste it into your AI client
- Say to the AI: `Load assessment "your-assessment-name" and start it`

---

## Verify Installation

Run through this checklist:

| Check | How | Expected |
|-------|-----|----------|
| Platform running | http://localhost:5173 | Dashboard loads |
| API healthy |http://localhost:8000/health | `{"status": "healthy"}` |
| Database connected | Check backend logs | No connection errors |
| Exegol container | `docker ps \| grep exegol` | Container running |
| MCP server | Check AI client | AIDA tools visible |


## Troubleshooting

TODO

---

## Next Steps

- [**User Guide**](USER_GUIDE.md) - Learn how to use the platform
- [**MCP Tools Reference**](MCP_TOOLS.md) - All available tools for your AI
- [**Architecture**](ARCHITECTURE.md) - Technical deep dive

---

## Need Help?

Need help? Contact **vasco0x4** on Discord.

- **GitHub Issues**: [Report bugs](https://github.com/Vasco0x4/AIDA/issues)
- **Email**: Vasco0x4@proton.me
