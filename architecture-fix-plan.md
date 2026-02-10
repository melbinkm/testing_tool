# Architecture Fix Plan: LLM-in-the-Loop Security Testing

## Problem Statement

The current architecture puts intelligence (payload selection, response analysis, signal detection) **inside MCP tools** with hardcoded logic, and returns only pre-digested summaries to the LLM. The LLM never sees raw HTTP request/response pairs during automated testing, so it cannot reason about application behavior, craft context-aware payloads, or detect subtle vulnerabilities.

Additionally, the fuzzer runs in **hardcoded mock mode** (`mockMode: true` in `fuzzer-mcp/src/server.ts:350`), meaning no real HTTP requests are ever made during fuzzing.

When prompted manually, Claude can analyze responses and find vulnerabilities because it sees raw traffic. The MCP tools prevent this by design.

## Root Cause

```
CURRENT (broken):                           NEEDED:

LLM calls fuzz_parameter()                  LLM sees request + response
    │                                           │
    ▼                                           ▼
Tool generates payloads internally          LLM reasons about context
Tool sends requests internally              LLM decides what to test
Tool analyzes responses internally          LLM crafts targeted payloads
Tool returns summary                        LLM analyzes raw response
    │                                           │
    ▼                                           ▼
LLM sees only signals[]                     LLM decides: continue or move on
LLM has NO context to reason                LLM has FULL context
```

## Design Principles

1. **LLM sees every request/response pair** — full headers, full body, status code, timing
2. **LLM decides what tests to run** based on endpoint functionality, parameter names, response patterns
3. **Hardcoded payloads run first** as a fast baseline sweep
4. **LLM generates intelligent payloads** based on what it learned from the baseline responses
5. **LLM decides when to stop** testing a vulnerability class on an endpoint
6. **Tools handle transport + safety** — rate limiting, scope checks, budget tracking, evidence capture
7. **Tools do NOT make decisions** — no signal detection, no payload selection, no "is this a vulnerability" logic
8. **Preserve existing infrastructure** — scope-guard, rate limiting, correlation IDs, evidence collection, world model

---

## New Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR (New)                         │
│         Single MCP server that drives the entire flow        │
│                                                              │
│  Responsibilities:                                           │
│  - Endpoint discovery & enumeration                          │
│  - Request/response capture & presentation to LLM            │
│  - Payload library management (hardcoded + LLM-generated)    │
│  - Test execution loop                                       │
│  - Progress tracking across endpoints                        │
│                                                              │
│  Does NOT:                                                   │
│  - Analyze responses (LLM does this)                         │
│  - Decide what's vulnerable (LLM does this)                  │
│  - Select payloads (LLM does this)                           │
│  - Decide when to stop (LLM does this)                       │
└────────────────────┬─────────────────────────────────────────┘
                     │
        Uses existing infrastructure:
        ├── http-client-mcp (transport + rate limiting)
        ├── scope-guard-mcp (scope enforcement)
        ├── browser-mcp (browser-based testing)
        ├── world-model-mcp (state tracking)
        ├── evidence-mcp (evidence collection)
        └── validator-mcp (finding validation)
```

---

## Detailed Tool Design: `pentest-orchestrator-mcp`

This is a **single new MCP server** that replaces `fuzzer-mcp` and adds the missing orchestration layer. All other MCP servers remain as-is.

### Tool 1: `recon_endpoint`

**Purpose**: Make a baseline request to an endpoint and return the FULL request/response pair to the LLM for analysis. This is the LLM's "eyes" into the application.

```typescript
// Input
{
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
  url: string,
  headers?: Record<string, string>,
  body?: string,
  identity_id?: string
}

// Output — EVERYTHING goes to the LLM
{
  request: {
    method: string,
    url: string,
    headers: Record<string, string>,   // ALL headers sent
    body: string | null                 // Full request body
  },
  response: {
    status: number,
    status_text: string,
    headers: Record<string, string>,   // ALL response headers (Server, X-Powered-By, CSP, etc.)
    body: string,                      // FULL response body (HTML/JSON/XML/etc.)
    timing_ms: number
  },
  // Metadata for LLM context (NOT analysis — just facts)
  metadata: {
    content_type: string,              // Parsed from Content-Type header
    body_length: number,
    is_json: boolean,
    is_html: boolean,
    is_xml: boolean,
    correlation_id: string
  }
}
```

**Why**: The LLM needs to see the raw response to understand the application. From a single response, the LLM can identify:
- Technology stack (from `Server`, `X-Powered-By`, `X-AspNet-Version` headers)
- Template engine (from HTML patterns, error messages)
- Input fields and their purposes (from form HTML, JSON schema)
- Security headers present/missing (CSP, HSTS, X-Frame-Options, etc.)
- Error handling behavior
- Session management approach

### Tool 2: `get_test_payloads`

**Purpose**: Return the hardcoded payload library for a specific vulnerability class. The LLM requests payloads by category, reviews them, and decides which to send.

```typescript
// Input
{
  category: 'sqli' | 'xss' | 'ssti' | 'cmdi' | 'ssrf' | 'lfi' | 'xxe' |
            'idor' | 'header_injection' | 'open_redirect' | 'cors' |
            'type_confusion' | 'boundary' | 'overflow' | 'format_string'
}

// Output
{
  category: string,
  description: string,
  payloads: [
    {
      id: string,                // e.g., "sqli_01"
      value: string,             // e.g., "' OR '1'='1"
      description: string,       // e.g., "Basic OR-based tautology"
      context: string,           // e.g., "Inject into string parameter in WHERE clause"
      detection_hint: string     // e.g., "Look for different response body/status vs baseline"
    }
  ],
  total: number,
  usage_note: string             // e.g., "Send these via inject_payload. Compare responses to baseline."
}
```

**Payload library** (migrated from existing `payload-generator.ts` + expanded):

| Category | Source | Count | Notes |
|----------|--------|-------|-------|
| `sqli` | Existing injection payloads (SQL subset) | 9 existing + expand to ~25 | Add blind SQLi, time-based, UNION-based, different DB dialects |
| `xss` | Existing injection payloads (XSS subset) + xss-detector payloads | 7+13 = ~20 existing + expand to ~35 | Add DOM XSS, CSP bypass, encoding bypasses |
| `ssti` | Existing injection payloads (template subset) | 4 existing + expand to ~20 | Add Jinja2, Freemarker, Twig, Pebble, Velocity, Mako, Smarty specific |
| `cmdi` | Existing injection payloads (command subset) | 6 existing + expand to ~15 | Add blind (sleep/ping), different shells, Windows-specific |
| `ssrf` | Existing format payloads (protocol subset) | 4 existing + expand to ~15 | Add cloud metadata, internal ranges, DNS rebinding payloads |
| `lfi` | Existing format payloads (path traversal subset) | 5 existing + expand to ~15 | Add null byte, encoding, wrapper payloads |
| `xxe` | Existing format payloads (XML subset) | 4 existing + expand to ~15 | Add OOB XXE, parameter entities, blind XXE |
| `idor` | New | ~10 | ID manipulation patterns (±1, UUID guess, etc.) |
| `header_injection` | New | ~15 | CRLF injection, host header injection, X-Forwarded-For |
| `open_redirect` | New | ~10 | URL manipulation, protocol-relative, javascript: URI |
| `cors` | New | ~10 | Origin header variations for CORS misconfiguration |
| `type_confusion` | Existing type_confusion payloads | 16 existing | Keep as-is |
| `boundary` | Existing boundary payloads | 26 existing | Keep as-is |
| `overflow` | Existing overflow payloads | 12 existing | Keep as-is |
| `format_string` | Existing format payloads (format string subset) | 3 existing + expand to ~10 | Add Python, C, Ruby format strings |

### Tool 3: `inject_payload`

**Purpose**: Send a single payload to a specific injection point and return the FULL request/response pair to the LLM. This is the core testing primitive.

```typescript
// Input
{
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  injection_point: {
    location: 'query' | 'body_field' | 'body_raw' | 'header' | 'path' | 'cookie',
    field_name: string,         // Which parameter/field to inject into
    payload: string,            // The actual payload string
    original_value?: string     // What value was there before (for context)
  },
  // Rest of the request stays normal
  other_params?: Record<string, string>,    // Other query/body params at normal values
  headers?: Record<string, string>,
  body_template?: string,                   // For body_field: JSON/form template with {{INJECT}} placeholder
  content_type?: string,                    // application/json, application/x-www-form-urlencoded, etc.
  identity_id?: string
}

// Output — FULL request/response for LLM analysis
{
  request: {
    method: string,
    url: string,                // URL with payload injected (if query/path)
    headers: Record<string, string>,
    body: string | null         // Body with payload injected (if body)
  },
  response: {
    status: number,
    status_text: string,
    headers: Record<string, string>,
    body: string,               // FULL response body
    timing_ms: number
  },
  injection: {
    location: string,
    field_name: string,
    payload: string,
    payload_reflected_in_body: boolean,     // Simple fact: does the payload appear in response?
    correlation_id: string
  }
}
```

**Key design decisions**:
- Returns **full response body** — the LLM decides what matters
- `payload_reflected_in_body` is the ONLY analysis done by the tool (it's a simple string check, not intelligence)
- No signal detection, no severity scoring, no "is this vulnerable" logic
- The LLM compares this response to the baseline it received from `recon_endpoint`

### Tool 4: `inject_batch`

**Purpose**: Send multiple payloads in sequence (for hardcoded payload sweep) and return ALL request/response pairs. This lets the LLM run through the entire hardcoded payload list efficiently.

```typescript
// Input
{
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  injection_point: {
    location: 'query' | 'body_field' | 'body_raw' | 'header' | 'path' | 'cookie',
    field_name: string
  },
  payloads: string[],                       // List of payloads to try
  other_params?: Record<string, string>,
  headers?: Record<string, string>,
  body_template?: string,
  content_type?: string,
  identity_id?: string,
  stop_on_status?: number[],                // Optional: stop early on specific status codes
  max_concurrent?: number                   // How many to run in parallel (default: 1 = sequential)
}

// Output — ALL responses for LLM analysis
{
  baseline: { ... },           // Same as recon_endpoint output (auto-captured with original value)
  results: [
    {
      index: number,
      payload: string,
      response: {
        status: number,
        status_text: string,
        headers: Record<string, string>,
        body: string,           // FULL body — but truncated to first 5000 chars if very large
        body_truncated: boolean,
        body_full_length: number,
        timing_ms: number
      },
      payload_reflected: boolean,
      status_differs_from_baseline: boolean,
      body_length_differs: boolean,
      timing_differs_significantly: boolean   // >3x baseline (simple math, not intelligence)
    }
  ],
  summary: {
    total_sent: number,
    unique_status_codes: number[],
    requests_with_reflection: number,
    requests_with_status_change: number,
    requests_with_timing_anomaly: number,
    stopped_early: boolean,
    stopped_reason?: string
  }
}
```

**Key design decisions**:
- Returns EVERY response (truncated to 5000 chars for very large bodies to stay within token limits)
- `summary` contains only **factual statistics** (counts, not analysis)
- `status_differs_from_baseline`, `body_length_differs`, `timing_differs_significantly` are simple boolean facts, not vulnerability assessments
- The LLM reads the summary to quickly spot interesting payloads, then reads full responses for those
- `stop_on_status` lets the LLM define early-exit criteria (e.g., stop if we get a 500)

### Tool 5: `analyze_headers`

**Purpose**: Extract and present ALL security-relevant headers from a response for LLM analysis. This is a convenience tool — the data is already in `recon_endpoint` responses, but this presents it in a focused way.

```typescript
// Input
{
  url: string,
  method?: string,       // Default: GET
  identity_id?: string
}

// Output — raw header data, NO assessment
{
  request_url: string,
  response_status: number,
  headers: Record<string, string>,    // ALL response headers
  security_headers_present: {
    // Simply reports which headers exist and their values. Does NOT assess correctness.
    'Strict-Transport-Security'?: string,
    'Content-Security-Policy'?: string,
    'X-Content-Type-Options'?: string,
    'X-Frame-Options'?: string,
    'X-XSS-Protection'?: string,
    'Referrer-Policy'?: string,
    'Permissions-Policy'?: string,
    'Cross-Origin-Opener-Policy'?: string,
    'Cross-Origin-Resource-Policy'?: string,
    'Cross-Origin-Embedder-Policy'?: string,
    'Cache-Control'?: string,
    'Set-Cookie'?: string[]            // All Set-Cookie headers with flags visible
  },
  security_headers_missing: string[],  // Which of the above are NOT present
  server_info: {
    // Technology fingerprinting data (just facts)
    server?: string,                   // Server header value
    x_powered_by?: string,             // X-Powered-By value
    x_aspnet_version?: string,
    x_runtime?: string,
    via?: string
  },
  cors_headers: {
    'Access-Control-Allow-Origin'?: string,
    'Access-Control-Allow-Methods'?: string,
    'Access-Control-Allow-Headers'?: string,
    'Access-Control-Allow-Credentials'?: string,
    'Access-Control-Expose-Headers'?: string,
    'Access-Control-Max-Age'?: string
  },
  cookie_analysis: [
    {
      name: string,
      flags: {
        httpOnly: boolean,
        secure: boolean,
        sameSite: string | null,
        path: string,
        domain: string,
        expires: string | null
      }
    }
  ]
}
```

**Why a separate tool**: Headers are critical for security assessment but easily lost in a large HTML response. This focuses the LLM's attention. The LLM then decides what's misconfigured (e.g., "CSP is present but allows unsafe-inline — that's weak").

### Tool 6: `discover_attack_surface`

**Purpose**: Crawl/parse a target and return all discovered endpoints, forms, input fields, and parameters. Gives the LLM the full attack surface to plan its testing strategy.

```typescript
// Input
{
  target_url: string,
  discovery_method: 'crawl' | 'openapi' | 'html_forms',
  openapi_spec?: string,          // Raw YAML/JSON if method is 'openapi'
  crawl_depth?: number,           // Default: 2
  identity_id?: string
}

// Output — structured attack surface
{
  target: string,
  discovery_method: string,
  endpoints: [
    {
      endpoint_id: string,         // Auto-generated for tracking
      url: string,
      method: string,
      source: string,              // 'openapi' | 'crawl' | 'html_form' | 'link'
      parameters: [
        {
          name: string,
          location: 'query' | 'body' | 'header' | 'path' | 'cookie',
          type: string,            // 'string' | 'number' | 'boolean' | 'file' | 'hidden' | etc.
          required: boolean,
          sample_value?: string,   // Value found in the form/spec
          html_input_type?: string,// For forms: 'text' | 'password' | 'email' | 'hidden' | etc.
          description?: string     // From OpenAPI spec
        }
      ],
      request_body?: {
        content_type: string,
        schema?: object,           // From OpenAPI
        sample?: string            // Example body if available
      },
      authentication_required: boolean | null,  // null = unknown
      response_content_type?: string
    }
  ],
  forms: [
    {
      form_id: string,
      page_url: string,
      action: string,
      method: string,
      fields: [
        {
          name: string,
          type: string,            // input type attribute
          id?: string,
          placeholder?: string,
          value?: string,          // default/hidden value
          required: boolean,
          options?: string[]       // for select/radio
        }
      ],
      submit_button?: {
        text: string,
        selector: string
      }
    }
  ],
  links: [
    {
      url: string,
      text: string,
      same_origin: boolean
    }
  ],
  technology_hints: {
    // Raw observations — NOT conclusions
    server_header?: string,
    powered_by?: string,
    meta_generator?: string,       // From <meta name="generator">
    framework_indicators: string[] // e.g., ["__csrftoken (Django)", "laravel_session cookie"]
  },
  total_endpoints: number,
  total_parameters: number,
  total_forms: number
}
```

**Implementation**: Combines:
- `openapi-mcp` (if OpenAPI spec available) — reuse existing parser
- `browser-mcp` `browser_discover_forms` — reuse existing form discovery
- Simple HTML link extraction via `browser_eval`
- HTTP header analysis

### Tool 7: `record_finding`

**Purpose**: Record a confirmed or suspected vulnerability that the LLM has identified. This wraps `world-model-mcp` and `evidence-mcp`.

```typescript
// Input
{
  title: string,
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical',
  vulnerability_type: string,     // 'sqli' | 'xss' | 'ssti' | etc.
  endpoint: {
    method: string,
    url: string,
    parameter: string,
    injection_point: string       // 'query' | 'body' | 'header' | etc.
  },
  evidence: {
    payload: string,              // The payload that triggered it
    request: string,              // Full request (copy from inject_payload response)
    response_status: number,
    response_body_excerpt: string, // Relevant part of response
    baseline_status?: number,
    baseline_response_excerpt?: string,
    explanation: string           // LLM's reasoning for why this is a vulnerability
  },
  confidence: 'confirmed' | 'likely' | 'possible',
  needs_validation: boolean       // Should validator-mcp re-test this?
}

// Output
{
  finding_id: string,
  bundle_id: string,              // Evidence bundle auto-created
  recorded: boolean,
  message: string
}
```

### Tool 8: `get_test_progress`

**Purpose**: Show what has been tested so far across all endpoints. Prevents re-testing and helps the LLM track progress.

```typescript
// Input
{
  endpoint_url?: string    // Optional: filter to specific endpoint
}

// Output
{
  overall: {
    total_endpoints: number,
    endpoints_tested: number,
    endpoints_remaining: number,
    total_findings: number,
    by_severity: Record<string, number>,
    budget_remaining: number,
    budget_used: number
  },
  endpoints: [
    {
      url: string,
      method: string,
      status: 'not_started' | 'in_progress' | 'completed',
      tests_run: [
        {
          vulnerability_type: string,     // 'sqli', 'xss', etc.
          parameter: string,
          payloads_sent: number,
          findings_count: number,
          status: 'not_started' | 'hardcoded_done' | 'llm_payloads_done' | 'completed'
        }
      ],
      findings: [
        {
          finding_id: string,
          title: string,
          severity: string,
          vulnerability_type: string,
          confidence: string
        }
      ]
    }
  ]
}
```

---

## The Testing Flow: How the LLM Drives Everything

### Phase 1: Reconnaissance & Attack Surface Mapping

```
Step 1: LLM calls discover_attack_surface(target_url, 'crawl')
        → Receives full list of endpoints, forms, parameters

Step 2: LLM calls discover_attack_surface(target_url, 'openapi', spec)
        → (if OpenAPI spec available) Merges with crawl results

Step 3: LLM calls recon_endpoint() for each discovered endpoint
        → Sees full response HTML/JSON for each endpoint
        → LLM notes: "This endpoint uses Jinja2 templates" (from response patterns)
        → LLM notes: "This endpoint returns user data in JSON" (IDOR candidate)
        → LLM notes: "This endpoint has a file upload form" (multiple test types)

Step 4: LLM calls analyze_headers() for each endpoint
        → LLM notes: "Missing CSP header", "Cookie without HttpOnly flag"
        → LLM records header-level findings via record_finding()

Step 5: LLM builds its testing plan (this is the LLM reasoning, not a tool):
        "Endpoints to test:
         1. POST /search?q=... → XSS, SSTI (has template rendering)
         2. GET /api/users/{id} → IDOR, SQLi (has user ID in path)
         3. POST /login → SQLi (auth bypass), brute force
         4. POST /upload → File upload, XSS via filename
         5. GET /api/config → SSRF (has 'url' parameter)"
```

### Phase 2: Hardcoded Payload Sweep (Fast Baseline)

For each endpoint + parameter combination:

```
Step 6: LLM calls get_test_payloads('sqli')
        → Gets 25 hardcoded SQL injection payloads

Step 7: LLM calls inject_batch(
          method: 'POST',
          url: '/search',
          injection_point: { location: 'body_field', field_name: 'q' },
          payloads: [all 25 sqli payloads],
          body_template: '{"q": "{{INJECT}}"}',
          content_type: 'application/json'
        )
        → Receives ALL 25 request/response pairs
        → LLM scans summary: "3 payloads caused status 500, 1 caused timing anomaly"
        → LLM reads the 4 interesting responses in detail

Step 8: LLM calls get_test_payloads('xss')
        → Repeats inject_batch for XSS payloads
        → LLM scans results: "5 payloads reflected in response body"
        → LLM reads those 5 responses to check reflection context

Step 9: LLM calls get_test_payloads('ssti')
        → Repeats for SSTI
        → LLM sees: "{{7*7}} caused response to contain '49' — SSTI confirmed!"

Step 10: LLM records findings from hardcoded sweep:
         record_finding({ title: 'SSTI in /search q parameter', ... })
```

### Phase 3: LLM-Guided Intelligent Testing

This is where the architecture shines — the LLM now uses what it learned:

```
Step 11: LLM reasons about the SSTI finding:
         "The application evaluated {{7*7}} as 49. This is likely Jinja2
          based on the Flask indicators I saw in recon. Let me try
          Jinja2-specific payloads to determine exploitability."

Step 12: LLM calls inject_payload(
           payload: '{{ config.items() }}'
         )
         → Response body contains Flask config dump
         → LLM: "Config disclosure confirmed. Let me try RCE."

Step 13: LLM calls inject_payload(
           payload: '{{ self.__init__.__globals__.__builtins__.__import__("os").popen("id").read() }}'
         )
         → Response contains "uid=1000(www-data)..."
         → LLM: "RCE confirmed via Jinja2 SSTI. Critical finding."

Step 14: LLM records the escalated finding:
         record_finding({
           title: 'RCE via Jinja2 SSTI in /search q parameter',
           severity: 'critical',
           evidence: {
             explanation: 'Application uses Jinja2 template engine and renders
                          user input directly in template context. Initial {{7*7}}
                          returned 49, config disclosure via config.items(), and
                          full RCE via __import__("os").popen().'
           }
         })

Step 15: LLM decides: "SSTI is fully confirmed on this parameter. No need to
         send more SSTI payloads. Moving to XSS testing on same parameter."
```

### Phase 4: Context-Aware Testing Across Endpoints

```
Step 16: LLM tests IDOR on /api/users/{id}:
         → recon_endpoint(GET /api/users/1) with admin identity → sees full user object
         → recon_endpoint(GET /api/users/1) with regular user identity → sees... full user object!
         → LLM: "IDOR — regular user can access other users' data"
         → inject_payload(GET /api/users/2) with regular user → sees different user's data
         → Confirmed IDOR

Step 17: LLM tests SQLi on /api/users/{id}:
         → inject_payload with ' OR 1=1-- in path → 500 error with SQL error in body
         → LLM reads error: "PostgreSQL syntax error near 'OR'"
         → LLM: "This is PostgreSQL. Let me try PG-specific payloads."
         → inject_payload with ' UNION SELECT version()-- → "PostgreSQL 14.2"
         → LLM crafts data exfiltration query specific to PG

Step 18: LLM checks for header injection:
         → inject_payload with CRLF in header values
         → Checks if response headers are polluted

Step 19: LLM decides for each endpoint + vuln combination:
         "SQLi on /api/users/{id}: CONFIRMED, severity critical, stop testing SQLi here"
         "XSS on /api/users/{id}: NOT FOUND after 35 payloads + 5 custom, stop"
         "SSTI on /api/users/{id}: NOT APPLICABLE (API returns JSON, no template), skip"
```

### Phase 5: Validation & Reporting

```
Step 20: For each finding, LLM calls validator-mcp tools:
         → validate_repro (can we reproduce it reliably?)
         → validate_negative_control (does it fail when it should?)
         → validate_cross_identity (does auth affect it?)

Step 21: LLM bundles evidence via evidence-mcp:
         → evidence_bundle + evidence_add_artifact for each finding
         → evidence_generate_report

Step 22: LLM calls get_test_progress() to verify completeness:
         → "All 15 endpoints tested, 7 findings confirmed, 0 endpoints remaining"
```

---

## What the LLM Analyzes at Each Request/Response Pair

When the LLM receives a request/response pair, it should look for:

### Response Body Analysis
- **Reflection**: Does the payload appear in the response? In what context? (HTML tag, attribute, script, JSON value, comment?)
- **Evaluation**: Did a math expression get evaluated? (`{{7*7}}` → `49`)
- **Error disclosure**: Database errors, stack traces, internal paths, debug info
- **Data leakage**: User data in API responses, config values, internal IPs
- **Behavioral change**: Different content, redirects, new elements appearing
- **WAF/filter signatures**: Generic error pages, blocked messages, modified payloads

### Response Header Analysis
- **Security headers**: Missing or misconfigured CSP, HSTS, X-Frame-Options, etc.
- **Technology disclosure**: Server, X-Powered-By, X-AspNet-Version
- **Cookie flags**: Missing HttpOnly, Secure, SameSite
- **CORS**: Permissive origins, credentials allowed
- **Cache**: Sensitive data being cached (Cache-Control, Pragma)

### Response Timing Analysis
- **Time-based blind injection**: Significantly slower response → possible blind SQLi/SSTI
- **Consistent timing anomalies**: Multiple payloads with sleep/waitfor cause delays

### Status Code Analysis
- **200 → 500**: Server error triggered by payload (possible injection)
- **200 → 302**: Redirect caused by payload (possible open redirect)
- **403/401 → 200**: Authorization bypass
- **Different responses for different users**: IDOR/BOLA

---

## Vulnerability Test Matrix

The LLM selects which tests to run per endpoint based on what it observes:

| Condition Observed | Tests to Run |
|---|---|
| HTML form with text input | XSS, SSTI, SQLi, CMDI |
| JSON API with ID parameter | IDOR, SQLi, type confusion |
| URL/file path parameter | SSRF, LFI, open redirect |
| File upload form | Unrestricted upload, XSS via filename, path traversal |
| Authentication endpoint | SQLi (auth bypass), brute force, credential stuffing |
| XML content type accepted | XXE, XSS via CDATA |
| Template-rendered content | SSTI (Jinja2, Freemarker, Twig, etc.) |
| API with user-controlled headers | Header injection, CRLF, host header attacks |
| Endpoint returning other users' data | IDOR, broken access control |
| Any endpoint | Security headers, CORS, cookie flags |
| GraphQL endpoint | Introspection, injection in variables, DoS via deep nesting |
| WebSocket endpoint | Injection in messages, CSWSH |

The LLM applies this matrix dynamically — it's not hardcoded in a tool. The LLM reasons:
"This endpoint accepts XML → I should test XXE" rather than the tool deciding.

---

## Implementation Plan

### Step 1: Create `pentest-orchestrator-mcp` server (New)

**Files to create**:
```
mcp-servers/pentest-orchestrator-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts              # MCP server setup, tool registration
│   ├── tools/
│   │   ├── recon.ts           # recon_endpoint implementation
│   │   ├── payloads.ts        # get_test_payloads + payload library
│   │   ├── inject.ts          # inject_payload + inject_batch
│   │   ├── headers.ts         # analyze_headers
│   │   ├── discovery.ts       # discover_attack_surface
│   │   ├── findings.ts        # record_finding
│   │   └── progress.ts        # get_test_progress
│   ├── payload-library/
│   │   ├── sqli.ts            # SQL injection payloads (migrate + expand)
│   │   ├── xss.ts             # XSS payloads (migrate + expand)
│   │   ├── ssti.ts            # SSTI payloads (migrate + expand)
│   │   ├── cmdi.ts            # Command injection payloads
│   │   ├── ssrf.ts            # SSRF payloads
│   │   ├── lfi.ts             # LFI/path traversal payloads
│   │   ├── xxe.ts             # XXE payloads
│   │   ├── idor.ts            # IDOR test patterns
│   │   ├── header-injection.ts
│   │   ├── open-redirect.ts
│   │   ├── cors.ts
│   │   └── index.ts           # Payload registry
│   ├── http-transport.ts      # Wraps http-client-mcp for actual requests
│   ├── scope-check.ts         # Wraps scope-guard-mcp validation
│   ├── progress-tracker.ts    # SQLite-backed test progress
│   └── types.ts               # All type definitions
└── tests/
    ├── recon.test.ts
    ├── inject.test.ts
    ├── payloads.test.ts
    ├── headers.test.ts
    ├── discovery.test.ts
    └── progress.test.ts
```

### Step 2: Migrate Payload Library

- Copy all payloads from `fuzzer-mcp/src/payload-generator.ts` (115 payloads across 5 categories)
- Copy XSS payloads from `browser-mcp/src/xss-detector.ts` (13 payloads)
- Reorganize by vulnerability class instead of generic "injection"
- Add missing payload categories: IDOR, header injection, open redirect, CORS
- Expand each category with additional payloads
- Add metadata to each payload: description, context, detection_hint

### Step 3: Implement HTTP Transport Layer

- Reuse `http-client-mcp` for actual HTTP transport (rate limiting, correlation IDs, budget)
- The orchestrator calls `http_send` internally or the LLM calls it — either way, transport goes through the rate-limited client
- **Two implementation options**:
  - **Option A (Recommended)**: Orchestrator makes HTTP calls directly using the same `undici` + `RateLimiter` + `ConcurrencyLimiter` code from http-client-mcp (copy/import the transport layer)
  - **Option B**: Orchestrator calls http-client-mcp as a sub-process via MCP client — more decoupled but adds latency

### Step 4: Implement Progress Tracking

- SQLite database tracking what has been tested
- Schema:
  ```sql
  CREATE TABLE test_progress (
    id TEXT PRIMARY KEY,
    endpoint_url TEXT,
    endpoint_method TEXT,
    parameter_name TEXT,
    vulnerability_type TEXT,
    phase TEXT,           -- 'hardcoded' | 'llm_generated'
    payloads_sent INTEGER,
    findings_count INTEGER,
    status TEXT,          -- 'not_started' | 'in_progress' | 'completed'
    started_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE findings (
    finding_id TEXT PRIMARY KEY,
    endpoint_url TEXT,
    endpoint_method TEXT,
    parameter_name TEXT,
    vulnerability_type TEXT,
    severity TEXT,
    confidence TEXT,
    title TEXT,
    payload TEXT,
    evidence_bundle_id TEXT,
    created_at TEXT
  );
  ```

### Step 5: Integrate with Existing Servers

- **scope-guard-mcp**: Call `scope_validate_target` before any request in `recon_endpoint`, `inject_payload`, `inject_batch`, `discover_attack_surface`
- **world-model-mcp**: `record_finding` writes to world model via `wm_add_finding`
- **evidence-mcp**: `record_finding` creates evidence bundle via `evidence_bundle` + `evidence_add_artifact`
- **validator-mcp**: LLM calls validator tools directly (no change needed)
- **browser-mcp**: `discover_attack_surface` with method='crawl' uses browser tools
- **openapi-mcp**: `discover_attack_surface` with method='openapi' uses openapi tools

### Step 6: Update MCP Configuration

Update the Claude Code MCP config to include the new server:

```json
{
  "mcpServers": {
    "pentest-orchestrator": {
      "command": "node",
      "args": ["mcp-servers/pentest-orchestrator-mcp/dist/server.js"],
      "env": {
        "ENGAGEMENT_FILE": "./scope/engagement.yaml",
        "EVIDENCE_DIR": "./evidence",
        "PROXY_URL": "http://127.0.0.1:8080"
      }
    },
    "scope-guard": { "...": "keep as-is" },
    "http-client": { "...": "keep as-is" },
    "browser": { "...": "keep as-is" },
    "world-model": { "...": "keep as-is" },
    "evidence": { "...": "keep as-is" },
    "validator": { "...": "keep as-is" },
    "auth-tester": { "...": "keep as-is" }
  }
}
```

### Step 7: Deprecate Fuzzer-MCP

- `fuzzer-mcp` is fully replaced by `pentest-orchestrator-mcp`
- Do NOT delete it (keep for reference), but remove from MCP config
- The payload library is migrated, the signal detector logic is now the LLM's job

### Step 8: Write System Prompt / Testing Instructions

Create a prompt template that instructs the LLM how to use the new tools:

```
mcp-servers/pentest-orchestrator-mcp/TESTING_INSTRUCTIONS.md
```

This file should be referenced in Claude's system prompt or CLAUDE.md:

```markdown
## Security Testing Workflow

When conducting a security assessment:

1. **Discover**: Call discover_attack_surface to map all endpoints
2. **Recon**: Call recon_endpoint for each endpoint to understand behavior
3. **Headers**: Call analyze_headers for each endpoint
4. **For each endpoint + parameter**:
   a. Decide which vulnerability types to test based on:
      - Parameter name and type (e.g., 'url' param → test SSRF)
      - Response content type (HTML → XSS, JSON API → IDOR)
      - Technology stack (Jinja2 → SSTI, PHP → different payloads)
   b. Get hardcoded payloads: get_test_payloads(vuln_type)
   c. Run payload sweep: inject_batch(payloads)
   d. Analyze ALL responses — look for:
      - Payload reflection (in what context?)
      - Error messages (what technology?)
      - Behavioral changes (status code, redirect, different content)
      - Timing anomalies (blind injection?)
   e. Based on what you learned, craft targeted payloads:
      - Use technology-specific syntax
      - Bypass detected filters/WAF
      - Escalate from detection to exploitation
   f. Stop when: confirmed vulnerability OR exhausted reasonable payloads
5. **Record**: Call record_finding for each vulnerability
6. **Validate**: Use validator tools to confirm findings
7. **Report**: Generate evidence bundles and reports
```

### Step 9: Write Tests

For every new tool:
- Unit tests for payload library (all categories load correctly)
- Unit tests for HTTP transport (scope check, rate limiting)
- Unit tests for progress tracking (SQLite operations)
- Integration tests for the full flow (mock HTTP server + real tool calls)
- Test that FULL response bodies are returned (not truncated unless >5000 chars)
- Test that scope validation blocks out-of-scope requests

---

## Migration Checklist

- [ ] Create `pentest-orchestrator-mcp` package
- [ ] Implement `recon_endpoint` tool
- [ ] Implement `get_test_payloads` tool with migrated payload library
- [ ] Implement `inject_payload` tool
- [ ] Implement `inject_batch` tool
- [ ] Implement `analyze_headers` tool
- [ ] Implement `discover_attack_surface` tool
- [ ] Implement `record_finding` tool
- [ ] Implement `get_test_progress` tool
- [ ] Implement progress tracker (SQLite)
- [ ] Implement HTTP transport layer (reuse rate limiter + scope check)
- [ ] Migrate payloads from fuzzer-mcp payload-generator.ts
- [ ] Migrate payloads from browser-mcp xss-detector.ts
- [ ] Add new payload categories (IDOR, header injection, open redirect, CORS)
- [ ] Write unit tests for all tools
- [ ] Write integration tests
- [ ] Update MCP config (add orchestrator, remove fuzzer)
- [ ] Write TESTING_INSTRUCTIONS.md
- [ ] Update CLAUDE.md with new workflow
- [ ] Update SETUP.md
- [ ] End-to-end test against a real test target (e.g., DVWA, Juice Shop)

---

## What Stays The Same

| Server | Status | Reason |
|--------|--------|--------|
| `scope-guard-mcp` | **Keep as-is** | Scope enforcement is infrastructure, works correctly |
| `http-client-mcp` | **Keep as-is** | Rate limiting + transport works correctly |
| `browser-mcp` | **Keep as-is** | Browser automation works, used by discover_attack_surface |
| `world-model-mcp` | **Keep as-is** | State tracking works correctly |
| `evidence-mcp` | **Keep as-is** | Evidence bundling works correctly |
| `validator-mcp` | **Keep as-is** | Finding validation works correctly |
| `auth-tester-mcp` | **Keep as-is** | Auth/IDOR testing works correctly |
| `openapi-mcp` | **Keep as-is** | API discovery works correctly |
| `nuclei-mcp` | **Keep as-is** | External scanner integration works correctly |
| `fuzzer-mcp` | **Deprecate** | Replaced by pentest-orchestrator-mcp |

---

## Summary

The fix is NOT "make the fuzzer smarter." The fix is **remove intelligence from tools and give it back to the LLM**. The new `pentest-orchestrator-mcp` server provides:

1. **Transport primitives** that return full request/response pairs
2. **A payload library** that the LLM can browse and select from
3. **An injection tool** that sends exactly what the LLM tells it to
4. **Progress tracking** so the LLM knows what's left to test
5. **Discovery tools** that show the attack surface

The LLM provides:
1. **Test planning** — what to test based on application context
2. **Payload selection** — which hardcoded payloads are relevant
3. **Payload crafting** — custom payloads based on observed behavior
4. **Response analysis** — interpreting what each response means
5. **Decision making** — when to stop, what to test next, what's a finding
