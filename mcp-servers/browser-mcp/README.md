# Browser MCP Server

MCP server for browser automation with Stagehand integration, Burp proxy support, and XSS testing capabilities for penetration testing workflows.

## Features

- **Natural Language Actions**: Use Stagehand for AI-powered browser automation ("click the login button")
- **Burp Proxy Integration**: Route all traffic through Burp Suite for visibility
- **XSS Detection**: Test form fields for XSS vulnerabilities with multiple detection methods
- **Form Discovery**: Automatically discover and analyze forms on web pages
- **Correlation Headers**: Track requests with engagement/action/request IDs
- **Scope Validation**: Prevent navigation to out-of-scope targets
- **Evidence Capture**: Screenshot support for documenting findings

## Installation

```bash
cd mcp-servers/browser-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENGAGEMENT_ID` | Yes | - | Unique engagement identifier |
| `BURP_PROXY_URL` | No | `http://127.0.0.1:8080` | Burp Suite proxy URL |
| `HEADLESS` | No | `false` | Run browser in headless mode |
| `EVIDENCE_DIR` | No | `./evidence` | Directory for screenshots |
| `DEFAULT_TIMEOUT` | No | `30000` | Default timeout in ms |
| `MAX_SESSIONS` | No | `5` | Maximum concurrent browser sessions |
| `ENABLE_SCOPE_VALIDATION` | No | `false` | Enable URL scope checking |
| `GEMINI_API_KEY` | No | - | Gemini API key for Stagehand AI |
| `OPENAI_API_KEY` | No | - | OpenAI API key for Stagehand AI |

### MCP Server Configuration

Add to your `.autopentest/settings.json`:

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/path/to/browser-mcp/dist/index.js"],
      "env": {
        "ENGAGEMENT_ID": "${ENGAGEMENT_ID}",
        "BURP_PROXY_URL": "http://127.0.0.1:8080",
        "HEADLESS": "false",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```

## Available Tools

### Session Management

#### `browser_session_create`
Create a new browser session with optional Burp proxy integration.

```json
{
  "proxy_url": "http://127.0.0.1:8080",
  "headless": false,
  "viewport_width": 1280,
  "viewport_height": 720
}
```

#### `browser_session_close`
Close a browser session.

```json
{
  "session_id": "session-xxx" // Optional, closes active session if not provided
}
```

### Navigation

#### `browser_navigate`
Navigate to a URL. Validates scope before navigation if enabled.

```json
{
  "url": "https://target.example.com",
  "wait_until": "networkidle",
  "timeout": 30000
}
```

### Actions (Stagehand)

#### `browser_act`
Perform a natural language action in the browser.

```json
{
  "action": "click the login button",
  "timeout": 10000
}
```

#### `browser_extract`
Extract data from the current page using natural language.

```json
{
  "instruction": "get all product prices on the page",
  "schema": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "price": { "type": "number" }
      }
    }
  }
}
```

### Form Analysis & XSS Testing

#### `browser_discover_forms`
Discover all forms on the current page.

Returns:
```json
{
  "forms": [
    {
      "form_id": "form-1-abc123",
      "action": "/contact",
      "method": "POST",
      "fields": [
        { "name": "email", "type": "email", "required": true },
        { "name": "message", "type": "textarea", "required": false }
      ],
      "submit_button": { "text": "Send", "selector": "#submit" },
      "selector": "#contact-form"
    }
  ]
}
```

#### `browser_test_xss`
Test a form field for XSS vulnerabilities.

```json
{
  "form_selector": "#contact-form",
  "field_name": "message",
  "payloads": ["<script>alert('XSS')</script>"],
  "submit": true
}
```

Returns:
```json
{
  "vulnerable": true,
  "vulnerabilities": [
    {
      "field_name": "message",
      "payload": "<img src=x onerror=alert('XSS')>",
      "detection_method": "dialog",
      "screenshot_path": "./evidence/xss-evidence.png"
    }
  ],
  "payloads_tested": 7
}
```

### Evidence Capture

#### `browser_screenshot`
Capture a screenshot of the current page.

```json
{
  "full_page": true,
  "selector": "#specific-element",
  "format": "png",
  "quality": 80
}
```

#### `browser_get_state`
Get current browser state including URL, cookies, and storage.

## Example Workflow

```
User: "Load the about us page from homepage and test the contact form for XSS"

Agent execution:
1. browser_session_create({ proxy_url: "http://127.0.0.1:8080" })
2. browser_navigate({ url: "https://target.example.com" })
3. browser_act({ action: "click on About Us link" })
4. browser_discover_forms({})
5. browser_test_xss({ field_name: "message" })
6. browser_screenshot({ full_page: true })
```

## XSS Detection Methods

The XSS detector uses multiple detection methods:

1. **Dialog Detection**: Catches `alert()`, `confirm()`, `prompt()` dialogs
2. **DOM Reflection**: Checks if payload is reflected in page HTML
3. **Console Monitoring**: Watches for XSS markers in console output
4. **Attribute Injection**: Detects event handler injection

## Correlation Headers

All browser requests include correlation headers for Burp visibility:

- `X-Engagement-ID`: Engagement identifier
- `X-Session-ID`: Browser session ID
- `X-Action-ID`: Action identifier (increments per action)
- `X-Request-ID`: Unique request UUID
- `X-Browser-MCP`: Always "true" to identify browser-mcp traffic

## Development

### Run Tests

```bash
npm test
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AutoPentest CLI                       │
└────────────────────────────┬────────────────────────────┘
                             │
    ┌────────────────────────┼────────────────────────────┐
    │                        │                            │
┌───┴────┐  ┌───────────┐  ┌─┴──────────┐  ┌────────────┐
│browser │  │http-client│  │scope-guard │  │  fuzzer    │
│  -mcp  │  │   -mcp    │  │   -mcp     │  │   -mcp     │
└───┬────┘  └─────┬─────┘  └────────────┘  └────────────┘
    │             │
    │  ┌──────────┴──────────┐
    │  │   Burp Proxy        │
    │  │  (127.0.0.1:8080)   │
    │  └──────────┬──────────┘
    │             │
┌───┴─────────────┴───┐
│  Stagehand/Playwright│
│  (headed browser)    │
└─────────────────────┘
```

## Security Considerations

- Always validate scope before navigation when testing external targets
- Use correlation IDs for audit trail and request tracking
- Store evidence in a secure location
- Be aware that XSS testing may trigger security alerts on target systems

## License

MIT
