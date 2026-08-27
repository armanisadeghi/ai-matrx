# MCP Server Architecture Guide — AI Matrx

> **Purpose:** Reference for AI Matrx developers implementing MCP (Model Context Protocol) server connectivity across the platform. Covers transport types, authentication patterns, configuration schema, and real-world server examples.
>
> **Last Updated:** April 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Transport Types](#2-transport-types)
3. [Authentication Architecture](#3-authentication-architecture)
4. [AI Matrx Unified Config Schema](#4-ai-matrx-unified-config-schema)
5. [Server Examples by Category](#5-server-examples-by-category)
6. [Implementation Priorities](#6-implementation-priorities)

---

## 1. Overview

MCP is an open protocol (by Anthropic) that standardizes how AI clients connect to external tools, databases, and APIs. AI Matrx acts as an **MCP client** — we connect to MCP servers that expose capabilities (tools, resources, prompts) via a unified JSON-RPC 2.0 interface.

The protocol uses a discovery-driven model:

```
AI Matrx (Client) → connects to → MCP Server (e.g. Notion, Stripe, Supabase)
                  ← discovers  ← available tools, auth requirements, capabilities
```

**Key Principle:** The MCP spec defines a universal auth and discovery flow. Our client implementation should be **transport-aware** and **auth-universal** — one OAuth client handles all compliant servers, with fallbacks for legacy/simple auth.

---

## 2. Transport Types

MCP supports three transport mechanisms. Our client must support all three, but **HTTP is the primary target**.

### 2.1 HTTP (Remote — Recommended)

Vendor-hosted servers. This is where the ecosystem is converging. The MCP spec (Nov 2025) designates Streamable HTTP as the standard remote transport.

- Protocol: HTTP POST with JSON-RPC 2.0 bodies
- Auth: OAuth 2.1 with PKCE (protocol-level), or Bearer tokens
- Connection: Stateless request/response, with optional SSE streaming for server→client notifications
- URL pattern: Typically `https://mcp.{vendor}.com/mcp`

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

### 2.2 SSE (Remote — Deprecated)

Server-Sent Events. Older remote transport, still used by some vendors (e.g. Asana). Functionally similar to HTTP but uses a persistent SSE connection for bidirectional communication.

- **Status:** Deprecated in the Nov 2025 spec. Support for backward compat only.
- URL pattern: Typically ends in `/sse`

```json
{
  "mcpServers": {
    "asana": {
      "type": "sse",
      "url": "https://mcp.asana.com/sse"
    }
  }
}
```

### 2.3 stdio (Local)

Spawns a local process. Communication via stdin/stdout using JSON-RPC 2.0. Used for filesystem access, local databases, and community-built servers distributed via npm/pip.

- Auth: Via environment variables passed to the spawned process (not OAuth)
- Process lifecycle: Client manages spawn/kill
- No network required

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Transport Decision Matrix

| Factor | HTTP | SSE | stdio |
|--------|------|-----|-------|
| Vendor-hosted (Notion, Stripe, etc.) | ✅ Primary | ⚠️ Legacy | ❌ |
| Self-hosted remote servers | ✅ | ✅ | ❌ |
| Local tools (filesystem, custom scripts) | ❌ | ❌ | ✅ Primary |
| Community npm/pip packages | ❌ | ❌ | ✅ Primary |
| Docker-wrapped servers | ❌ | ❌ | ✅ |
| Auth mechanism | OAuth 2.1 / Bearer | OAuth 2.1 / Bearer | Env vars |

---

## 3. Authentication Architecture

### 3.1 The Universal OAuth 2.1 Flow (Build Once)

The MCP spec mandates a **discovery-driven OAuth 2.1 + PKCE flow** for remote servers. This is a single implementation that works with every compliant server.

**Flow:**

```
1. Client → MCP Server: POST /mcp (no token)
         ← 401 Unauthorized + WWW-Authenticate header

2. Client → MCP Server: GET /.well-known/oauth-protected-resource
         ← JSON with authorization_servers[], scopes, etc.

3. Client → Auth Server: GET /.well-known/oauth-authorization-server
                         (or /.well-known/openid-configuration)
         ← JSON with authorization_endpoint, token_endpoint,
            registration_endpoint, etc.

4. Client → Auth Server: POST /register  (Dynamic Client Registration)
         ← client_id (and optionally client_secret)
         ⚠️ Optional — some vendors require pre-registered client IDs

5. Client → Auth Server: Redirect user to authorization_endpoint
            with: response_type=code, code_challenge (S256), scopes
         ← User authenticates + consents
         ← Redirect back with authorization code

6. Client → Auth Server: POST /token
            with: code + code_verifier (PKCE)
         ← access_token + refresh_token

7. Client → MCP Server: POST /mcp
            with: Authorization: Bearer {access_token}
         ← Success — tools available
```

**What this means:** Our client hits any MCP server URL, gets a 401, auto-discovers all OAuth endpoints, completes the PKCE flow, and we're in. Same code path for Notion, Figma, Stripe, Slack — everything.

### 3.2 Three Auth Tiers

Not every server uses the full OAuth flow. Our client needs three tiers:

#### Tier 1: Full OAuth 2.1 Discovery (Default for Remote)

The universal flow described above. Used by all major vendor-hosted servers.

- **No per-vendor code.** Everything is discovered from `/.well-known/` endpoints.
- Client only needs to store: `access_token`, `refresh_token`, `expires_at` per user per server.
- The only per-vendor config may be `scopes` (what permissions to request) and `clientId` (if DCR is not supported).

#### Tier 2: Static Bearer Token / API Key (Fallback for Remote)

For servers that don't implement full OAuth (internal tools, simple APIs):

```json
{
  "mcpServers": {
    "internal-api": {
      "type": "http",
      "url": "https://api.company.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

Or with custom header names:

```json
{
  "mcpServers": {
    "custom-api": {
      "type": "http",
      "url": "https://api.company.com/sse",
      "headers": {
        "X-API-Key": "${API_KEY}"
      }
    }
  }
}
```

#### Tier 3: Environment Variables (stdio Only)

Local processes pull auth from env vars. No OAuth, no headers — the spawned process handles auth to upstream services internally.

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### 3.3 What We Build (Implementation Checklist)

**Universal MCP OAuth Client (build once):**

```
src/mcp/auth/
├── discovery.ts          # Fetch /.well-known/oauth-protected-resource
│                         # Fetch /.well-known/oauth-authorization-server
│                         # Fetch /.well-known/openid-configuration
├── registration.ts       # Dynamic Client Registration (RFC 7591)
├── pkce.ts              # code_verifier generation, S256 challenge
├── auth-flow.ts         # Authorization code flow orchestration
├── token-manager.ts     # Storage, refresh, expiry tracking (per user, per server)
├── bearer-injector.ts   # Attach tokens to outgoing MCP requests
└── fallback.ts          # Static bearer / API key / header injection
```

**Token Storage (Supabase):**

```sql
-- Per-user, per-server token storage
CREATE TABLE user_mcp_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    server_name   TEXT NOT NULL,
    server_url    TEXT NOT NULL,
    access_token  TEXT NOT NULL,       -- encrypted at rest
    refresh_token TEXT,                -- encrypted at rest
    expires_at    TIMESTAMPTZ,
    scopes        TEXT[],
    client_id     TEXT,                -- from DCR or pre-registered
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, server_name)
);
```

### 3.4 Auth Decision Flowchart

```
Remote server (http/sse)?
├── YES → Try OAuth Discovery
│         ├── Server returns 401 + WWW-Authenticate? → Full OAuth 2.1 flow (Tier 1)
│         ├── Server returns 401 with no discovery? → Use configured Bearer/API key (Tier 2)
│         └── Server returns 200 (no auth required)? → Connect directly (e.g. Context7)
└── NO (stdio) → Pass env vars to spawned process (Tier 3)
```

---

## 4. AI Matrx Unified Config Schema

This schema supports all three transports and all three auth tiers in a single interface.

```typescript
interface McpServerConfig {
  // ── Identity ──
  name: string;                     // Unique key: "notion", "github", "supabase-prod"
  label?: string;                   // Display name: "Notion", "GitHub (Work)"
  description?: string;             // What this server provides
  icon?: string;                    // URL or icon identifier for UI

  // ── Transport ──
  transport: "http" | "sse" | "stdio";

  // ── Remote Config (http / sse) ──
  url?: string;                     // Server endpoint URL
  headers?: Record<string, string>; // Static headers (for Tier 2 auth)

  // ── Local Config (stdio) ──
  command?: string;                 // "npx", "uvx", "docker", "node", etc.
  args?: string[];                  // Command arguments
  env?: Record<string, string>;     // Environment variables for the process

  // ── Authentication ──
  auth:
    | {
        strategy: "oauth_discovery";    // Tier 1: Auto-discover OAuth endpoints
        clientId?: string;              // Only if vendor doesn't support DCR
        clientSecret?: string;          // Only for confidential clients
        scopes?: string[];              // Permissions to request
      }
    | {
        strategy: "bearer";             // Tier 2: Static bearer token
        tokenRef: string;               // Reference to secret store key
      }
    | {
        strategy: "header";             // Tier 2: Custom header + token
        headerName: string;             // e.g. "X-API-Key"
        tokenRef: string;               // Reference to secret store key
      }
    | {
        strategy: "env";                // Tier 3: stdio env-var auth
      }
    | {
        strategy: "none";               // Public server (no auth)
      };

  // ── Scoping ──
  scope: "user" | "project" | "system";
  // user:    Per-user, available across all their projects
  // project: Shared with team via project config (committed to repo)
  // system:  Admin-controlled, available platform-wide

  // ── Operational ──
  enabled: boolean;
  timeout?: number;                 // Connection timeout in ms (default: 30000)
  maxOutputTokens?: number;         // Max tool output size (default: 10000)
  retryPolicy?: {
    maxRetries: number;             // default: 3
    backoffMs: number;              // default: 1000
  };
}
```

### Config File Locations

Following the Claude Code convention for familiarity:

| Scope | Location | Purpose |
|-------|----------|---------|
| `project` | `.mcp.json` in project root | Team-shared, committed to git |
| `user` | `~/.aimatrx/mcp.json` | Personal servers, all projects |
| `system` | Platform admin dashboard | Admin-controlled, tenant-wide |

**Merge order:** `system` → `user` → `project` (project overrides user overrides system for same `name`).

---

## 5. Server Examples by Category

### 5.1 Official Vendor-Hosted Remote Servers (HTTP — Tier 1 OAuth)

These follow the MCP spec's OAuth 2.1 discovery flow. Our universal client handles them all identically.

```json
{
  "mcpServers": {
    "notion": {
      "transport": "http",
      "url": "https://mcp.notion.com/mcp",
      "auth": { "strategy": "oauth_discovery" },
      "scope": "user",
      "enabled": true
    },
    "figma": {
      "transport": "http",
      "url": "https://mcp.figma.com/mcp",
      "auth": { "strategy": "oauth_discovery" },
      "scope": "user",
      "enabled": true
    },
    "stripe": {
      "transport": "http",
      "url": "https://mcp.stripe.com",
      "auth": { "strategy": "oauth_discovery" },
      "scope": "user",
      "enabled": true
    },
    "linear": {
      "transport": "http",
      "url": "https://mcp.linear.com",
      "auth": { "strategy": "oauth_discovery" },
      "scope": "user",
      "enabled": true
    },
    "asana": {
      "transport": "http",
      "url": "https://mcp.asana.com/sse",
      "auth": { "strategy": "oauth_discovery" },
      "scope": "user",
      "enabled": true
    },
    "slack": {
      "transport": "http",
      "url": "https://slack-mcp.example.com/mcp",
      "auth": { "strategy": "oauth_discovery" },
      "scope": "user",
      "enabled": true
    },
    "paypal": {
      "transport": "http",
      "url": "https://mcp.paypal.com/mcp",
      "auth": { "strategy": "oauth_discovery" },
      "scope": "user",
      "enabled": true
    },
    "hex": {
      "transport": "http",
      "url": "https://app.hex.tech/mcp",
      "auth": { "strategy": "oauth_discovery" },
      "scope": "user",
      "enabled": true
    }
  }
}
```

**Known official MCP endpoint URLs (as of April 2026):**

| Vendor | URL | Transport | Notes |
|--------|-----|-----------|-------|
| Notion | `https://mcp.notion.com/mcp` | HTTP | OAuth discovery |
| Figma | `https://mcp.figma.com/mcp` | HTTP | OAuth discovery |
| Stripe | `https://mcp.stripe.com` | HTTP | OAuth discovery |
| Supabase | `https://mcp.supabase.com/mcp` | HTTP | OAuth or Bearer PAT |
| Linear | `https://mcp.linear.com` | HTTP | OAuth discovery |
| Asana | `https://mcp.asana.com/sse` | SSE (legacy) | OAuth discovery |
| PayPal | `https://mcp.paypal.com/mcp` | HTTP | OAuth discovery |
| Hex | `https://app.hex.tech/mcp` | HTTP | OAuth discovery |
| Vercel | `https://mcp.vercel.com` | HTTP | OAuth discovery |
| Amplitude | Announced Jan 2026 | HTTP | MCP Apps launch partner |
| Box | Announced Jan 2026 | HTTP | MCP Apps launch partner |
| Salesforce | Announced Jan 2026 | HTTP | MCP Apps launch partner |
| Monday.com | Announced Jan 2026 | HTTP | MCP Apps launch partner |
| Canva | Announced Jan 2026 | HTTP | MCP Apps launch partner |

### 5.2 Remote with Static Auth (Tier 2)

Servers where you bring your own token — no OAuth discovery.

```json
{
  "mcpServers": {
    "supabase-readonly": {
      "transport": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=<NON_PRODUCTION_PROJECT_REF>&read_only=true&features=docs,database,debugging",
      "headers": {
        "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}"
      },
      "auth": { "strategy": "bearer", "tokenRef": "SUPABASE_ACCESS_TOKEN" },
      "scope": "project",
      "enabled": true
    },
    "internal-api": {
      "transport": "http",
      "url": "https://api.internal.company.com/mcp",
      "headers": {
        "X-API-Key": "${INTERNAL_API_KEY}"
      },
      "auth": { "strategy": "header", "headerName": "X-API-Key", "tokenRef": "INTERNAL_API_KEY" },
      "scope": "project",
      "enabled": true
    }
  }
}
```

### 5.3 Public Servers — No Auth (Tier 0)

Read-only, documentation-style servers that require no authentication.

```json
{
  "mcpServers": {
    "context7": {
      "transport": "http",
      "url": "https://mcp.context7.com/mcp",
      "auth": { "strategy": "none" },
      "scope": "system",
      "enabled": true
    }
  }
}
```

### 5.4 Local stdio Servers (Tier 3)

#### Developer Tools

```json
{
  "mcpServers": {
    "github": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      },
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true
    },
    "github-docker": {
      "transport": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      },
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true
    }
  }
}
```

#### Atlassian (Jira + Confluence)

```json
{
  "mcpServers": {
    "atlassian": {
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "JIRA_URL": "https://your-company.atlassian.net",
        "JIRA_USERNAME": "your.email@company.com",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}",
        "CONFLUENCE_URL": "https://your-company.atlassian.net/wiki",
        "CONFLUENCE_USERNAME": "your.email@company.com",
        "CONFLUENCE_API_TOKEN": "${CONFLUENCE_API_TOKEN}"
      },
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true
    }
  }
}
```

#### Google Workspace (Drive, Docs, Sheets)

```json
{
  "mcpServers": {
    "google-workspace": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@a-bonus/google-docs-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}",
        "GOOGLE_CLIENT_SECRET": "${GOOGLE_CLIENT_SECRET}"
      },
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true
    },
    "google-drive-sheets": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@isaacphi/mcp-gdrive"],
      "env": {
        "CLIENT_ID": "${GOOGLE_CLIENT_ID}",
        "CLIENT_SECRET": "${GOOGLE_CLIENT_SECRET}",
        "GDRIVE_CREDS_DIR": "${HOME}/.config/mcp-gdrive"
      },
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true
    },
    "google-full": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "google-workspace-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}",
        "GOOGLE_CLIENT_SECRET": "${GOOGLE_CLIENT_SECRET}"
      },
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true,
      "label": "Google Full Suite (Calendar, Drive, Gmail, Docs, Sheets, Slides, Forms, Tasks)"
    }
  }
}
```

#### Supabase (Local CLI)

```json
{
  "mcpServers": {
    "supabase-local": {
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y", "@supabase/mcp-server-supabase",
        "--read-only",
        "--project-ref=txzxabzwovsujtloxrus"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      },
      "auth": { "strategy": "env" },
      "scope": "project",
      "enabled": true
    }
  }
}
```

#### Database & Search

```json
{
  "mcpServers": {
    "postgres": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      },
      "auth": { "strategy": "env" },
      "scope": "project",
      "enabled": true
    },
    "brave-search": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@brave/brave-search-mcp-server"],
      "env": {
        "BRAVE_API_KEY": "${BRAVE_API_KEY}"
      },
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true
    }
  }
}
```

#### Browser Automation & Monitoring

```json
{
  "mcpServers": {
    "playwright": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-playwright"],
      "auth": { "strategy": "env" },
      "scope": "project",
      "enabled": true
    },
    "sentry": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server"],
      "env": {
        "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}",
        "SENTRY_ORG": "${SENTRY_ORG}"
      },
      "auth": { "strategy": "env" },
      "scope": "project",
      "enabled": true
    }
  }
}
```

#### Utility Servers

```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y", "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/directory"
      ],
      "auth": { "strategy": "env" },
      "scope": "project",
      "enabled": true
    },
    "sequential-thinking": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-sequentialthinking-tools"],
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true
    },
    "context7": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "auth": { "strategy": "env" },
      "scope": "user",
      "enabled": true
    }
  }
}
```

---

## 6. Implementation Priorities

### Phase 1: Core Client (MVP)

Build the transport layer and simplest auth paths first.

1. **HTTP transport handler** — JSON-RPC 2.0 over HTTP POST
2. **Tier 2 auth (Bearer/Header)** — Static token injection from config
3. **Tier 0 (no auth)** — Direct connection for public servers
4. **Config loader** — Parse `McpServerConfig` from `.mcp.json` and user settings
5. **Tool discovery** — Call `tools/list` on connected servers, cache schemas
6. **Tool invocation** — Route tool calls to the correct server

This gets us connected to Supabase (with PAT), Context7, and any server using API keys.

### Phase 2: Universal OAuth

Build the full OAuth 2.1 client to unlock all vendor-hosted servers.

1. **Protected Resource Metadata fetcher** — `GET /.well-known/oauth-protected-resource`
2. **Auth Server Discovery** — `GET /.well-known/oauth-authorization-server` + OIDC fallback
3. **PKCE implementation** — `code_verifier` generation, S256 `code_challenge`
4. **Authorization Code Flow** — Browser redirect → callback → code exchange
5. **Dynamic Client Registration** — `POST /register` (RFC 7591)
6. **Token Manager** — Store per user per server in `user_mcp_tokens`, auto-refresh
7. **401 → Discovery → Auth → Retry** — Automatic flow when any request gets a 401

This unlocks Notion, Figma, Stripe, Linear, Slack, Asana, and all compliant servers.

### Phase 3: stdio Support

Add local process management for community servers.

1. **Process spawner** — Start/stop/restart child processes
2. **stdio JSON-RPC bridge** — Route JSON-RPC over stdin/stdout
3. **Env var injection** — Resolve `${VAR}` references from secret store
4. **Process health monitoring** — Detect crashes, auto-restart with backoff
5. **Docker support** — Handle `docker run` as the command

This unlocks GitHub, Atlassian, Google Workspace (community), Playwright, Sentry, and all npm/pip servers.

### Phase 4: Multi-User & Platform

Scale for AI Matrx's multi-tenant architecture.

1. **Scope system** — user / project / system config merging
2. **Admin controls** — System-level allowlist/denylist for servers
3. **Per-user token vault** — Encrypted storage in Supabase with RLS
4. **Tool Search (lazy loading)** — Don't load all tool schemas upfront; discover on demand to save context
5. **Server health dashboard** — Connection status, token expiry, error rates

### Security Checklist

- [ ] Never store raw tokens in config files — use `${VAR}` references to secret store
- [ ] Encrypt `access_token` and `refresh_token` at rest in the database
- [ ] Enforce HTTPS for all remote connections
- [ ] Validate all OAuth redirect URIs strictly
- [ ] Scope API keys to minimum required permissions
- [ ] Audit connected servers regularly — every server is an active credential
- [ ] Pin npm package versions for stdio servers (never use `@latest` in production)
- [ ] Run untrusted stdio servers in sandboxed containers
- [ ] Implement token rotation and refresh before expiry
- [ ] Log all tool invocations for audit trail

---

> **Questions?** Reach out in the `#mcp-integration` channel or check the MCP spec directly at [modelcontextprotocol.io](https://modelcontextprotocol.io).
