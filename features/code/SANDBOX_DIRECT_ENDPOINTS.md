# Sandbox Orchestrator — Direct Browser Access (Requirements for the Python Team)

**Owner:** matrx-admin (`features/code/`)
**Counterpart:** sandbox orchestrator (FastAPI / Coolify, repo TBD by Python team)
**Status:** Spec draft — 2026‑04‑26
**Drives:** removal of long-running paths from Vercel; alignment with the Matrx Engineering Constitution ("clients hit Python endpoints directly — requests never route through Next.js to reach Python").

---

## 1. Why this exists

Today every sandbox request from the browser goes through Next.js routes under `app/api/sandbox/**`. Those routes do three things:

1. Authenticate the caller against Supabase (`createClient` → `auth.getUser`).
2. Look up the `sandbox_instances` row, enforce `user_id` ownership, and read its persisted `tier` to pick `EC2_URL` vs `HOSTED_URL`.
3. Forward the request to the right orchestrator with the corresponding `X-API-Key` (server-only secret).

That works fine for short JSON calls (FS read/write, status, extend, …). It is fundamentally broken for everything else:

| Capability | Current path | Why Vercel breaks it |
|---|---|---|
| Streaming exec (SSE) — `git clone`, `pnpm install`, builds | `POST /api/sandbox/[id]/exec/stream` | Pro plan caps Serverless Functions at **300s**. `next build` cold cache, large test matrices, and long deploys exceed this routinely. |
| Real PTY terminal (WebSocket) | `GET /api/sandbox/[id]/pty` (upgrade) | Vercel Functions **cannot act as a WebSocket server** at all (https://vercel.com/docs/limits#websockets). The route currently returns 426 and the client falls back to buffered SSE — i.e. no real PTY in production. |
| File watcher (WebSocket) | `GET /api/sandbox/[id]/fs/watch` | Same — no WS upgrade on Vercel. |
| Bulk file upload / download (large bodies) | `…/fs/upload`, `…/fs/download` | Bound by function memory + duration; large transfers fail or stall. |

These are not Vercel-fixable. The only correct architecture is:

- **Short, JSON-only requests** continue to flow through Next.js (auth + tier routing + ownership check).
- **Long-running and bidirectional** requests go from the browser **directly** to the orchestrator, with the orchestrator validating a short-lived access token issued by Next.js for that specific sandbox.

This is the same pattern Supabase Realtime uses (Supabase JWT minted server-side, Realtime gateway validates it), the same pattern S3 presigned URLs use, and the same pattern our existing `POST /api/sandbox/[id]/access` already implements for SSH.

---

## 2. Authentication model — short-lived sandbox access tokens

The orchestrator does **not** call Supabase directly to validate users (we want exactly one authority on user→sandbox ownership: the Next.js layer that already owns the `sandbox_instances` table). Instead:

1. The browser asks Next.js for an access token: `POST /api/sandbox/[id]/access?scope=exec`.
2. Next.js validates the Supabase user, looks up the row, confirms ownership, picks the tier, and asks the **orchestrator** to mint a token bound to the upstream `sandbox_id`, the requested scopes, and a short TTL.
3. Next.js returns the token plus the direct orchestrator URL (`https://orchestrator.dev.codematrx.com` for hosted, etc.) to the browser.
4. The browser opens SSE / WebSocket / large HTTP requests **directly** against the orchestrator, presenting the token as `Authorization: Bearer <token>`.
5. The orchestrator validates the token signature, checks expiry + scope + sandbox-id binding, and serves the request.

The orchestrator already exposes a similar endpoint for SSH credential issuance (`POST /sandboxes/{id}/access`). We are extending the same shape to cover browser access.

### 2.1 Token contract

The token MUST be a signed structured token (recommended: JWS / JWT with HS256 using a per-orchestrator HMAC secret, or PASETO v4.local). The token MUST encode:

| Claim | Type | Required | Notes |
|---|---|---|---|
| `iss` | string | ✓ | `matrx-sandbox-orchestrator` |
| `sub` | string (UUID) | ✓ | Upstream `sandbox_id` |
| `scopes` | array<string> | ✓ | Subset of: `exec.run`, `exec.stream`, `pty`, `fs.read`, `fs.write`, `fs.watch`, `git`, `ports.read`. |
| `tier` | `"ec2"` \| `"hosted"` | ✓ | Echoed back so the browser can sanity-check. |
| `iat` | number | ✓ | Unix seconds. |
| `exp` | number | ✓ | Unix seconds. **Default TTL: 300s. Hard maximum: 900s.** |
| `actor` | object | ✓ | `{ user_id: string, email?: string }` — sourced from Next.js, used for orchestrator audit logs only. |
| `jti` | string | ✓ | Random; used for one-shot tokens (see §2.3). |

Tokens are bound to a **single sandbox**. There is no global "user token" — every long-lived connection corresponds to exactly one sandbox.

### 2.2 New / extended endpoint on the orchestrator

```
POST /sandboxes/{sandbox_id}/access-tokens
Headers:
  X-API-Key: <orchestrator master key>           # current admin auth
  Content-Type: application/json
Body:
  {
    "scopes": ["exec.stream", "pty"],
    "ttl_seconds": 300,           # optional, default 300, hard cap 900
    "actor": { "user_id": "uuid", "email": "arman@…" },
    "single_use": false           # if true, token is invalidated after first connect
  }
Response 200:
  {
    "token": "eyJhbGciOi…",
    "expires_at": "2026-04-26T08:30:00Z",
    "direct_url": "https://orchestrator.dev.codematrx.com",
    "ws_base":    "wss://orchestrator.dev.codematrx.com",
    "tier": "hosted",
    "sandbox_id": "<uuid>"
  }
```

This is admin-authenticated (`X-API-Key`) and only Next.js calls it. The browser never sees `X-API-Key`.

> **Migration note.** The existing SSH `POST /sandboxes/{id}/access` endpoint should stay as-is for SSH credential issuance. The new browser-access endpoint is intentionally separate to avoid coupling SSH key lifetime to web token lifetime.

### 2.3 One-shot vs reusable tokens

For SSE/HTTP we want **reusable** tokens (caller may retry, drop and reopen). For PTY/WS we recommend **single-use** tokens to make replay attacks meaningless: the orchestrator marks `jti` as consumed on first WS upgrade and rejects subsequent connections with the same `jti`. The `single_use` flag in §2.2 controls this.

### 2.4 CORS

The orchestrator MUST send `Access-Control-Allow-Origin` for the matrx-admin domains (configurable list, env var `MATRX_CORS_ALLOWED_ORIGINS`). Default list:

```
https://www.aimatrx.com
https://aimatrx.com
https://*.aimatrx.com
http://localhost:3000
http://localhost:3001
```

Required preflight:
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, Content-Type, X-PTY-Cols, X-PTY-Rows`
- `Access-Control-Allow-Credentials: false` (we are bearer-token, not cookie-based — keep it that way to avoid CSRF surface)
- `Access-Control-Expose-Headers: X-Sandbox-Id, X-Tier`

---

## 3. Endpoints that move to direct browser → orchestrator

Each endpoint below is the **direct** form. The orchestrator MUST accept either `Authorization: Bearer <access-token>` (browser) or `X-API-Key: <master>` (Next.js + ops tools). When a bearer token is used, the orchestrator MUST reject if `scopes` don't include the operation, if `sub` doesn't match the path's `{sandbox_id}`, or if `exp` is past.

### 3.1 Streaming exec (SSE) — replaces `/api/sandbox/[id]/exec/stream`

```
POST {direct_url}/sandboxes/{sandbox_id}/exec/stream
Authorization: Bearer <token with scope exec.stream>
Body (JSON):
  {
    "command": "pnpm install",
    "cwd": "/workspace",
    "env": { "TERM": "xterm-256color", "COLUMNS": "120", "LINES": "40" },
    "stdin": null,
    "timeout_seconds": 1800
  }
Response: text/event-stream
  event: stdout
  data: <chunk>

  event: stderr
  data: <chunk>

  event: exit
  data: { "code": 0, "signal": null }
```

- **No 300s cap.** Default timeout 30 minutes; configurable per-request up to 2 hours. Long builds work natively.
- Closing the SSE connection cancels the upstream process (same semantics we already have through the Vercel proxy — keep it).

### 3.2 PTY WebSocket — replaces (still-broken) `/api/sandbox/[id]/pty`

```
GET {ws_base}/sandboxes/{sandbox_id}/pty?cols=120&rows=40&cwd=/workspace
Sec-WebSocket-Protocol: matrx.sandbox.pty.v1, bearer.<token>
```

- The token rides in a subprotocol slot because browsers cannot set arbitrary headers on `new WebSocket(url, …)`. Format: the second subprotocol entry is `bearer.<base64url(token)>`. Orchestrator parses, validates, and selects the first acceptable subprotocol (`matrx.sandbox.pty.v1`) on success.
- Wire format is unchanged from today (text JSON frames):
  - client → server: `{type:"input"|"resize"|"signal"|"ping", …}`
  - server → client: `{type:"output"|"exit"|"error"|"pong", …}`
- TLS is required (`wss://`). No fallback to `ws://` over the public internet.

### 3.3 File watcher WebSocket — net-new direct path

```
GET {ws_base}/sandboxes/{sandbox_id}/fs/watch?path=/workspace
Sec-WebSocket-Protocol: matrx.sandbox.fs-watch.v1, bearer.<token>
```

- Server pushes `{type:"created"|"modified"|"deleted"|"moved", path, …}` events.
- Client may send `{type:"subscribe", path}` / `{type:"unsubscribe", path}` to adjust the watch set without reconnecting.

### 3.4 Bulk file transfer — direct (or kept on Next, see §3.5)

We currently proxy `…/fs/upload` (multipart) and `…/fs/download` through Next. With access tokens, the browser can `PUT` / `GET` directly to the orchestrator and bypass Vercel's body-size and duration limits. Same auth scheme (`Authorization: Bearer <…>` with scope `fs.write` / `fs.read`).

### 3.5 What stays on Next.js

The following are short, JSON, ownership-bound, and cheap to proxy. They keep the current shape so we don't have to ship a token round-trip just to read a directory listing.

- `GET /api/sandbox` (list user's sandboxes)
- `POST /api/sandbox` (create)
- `GET / DELETE /api/sandbox/[id]` (status / soft-delete)
- `POST /api/sandbox/[id]/extend` (TTL bump)
- `POST /api/sandbox/[id]/heartbeat` (in-flight keepalive)
- `GET / POST / PATCH / DELETE /api/sandbox/[id]/fs/[...path]` for **single-file** ops where buffered round-trip < 30s
- `POST /api/sandbox/[id]/exec` (one-shot buffered exec, used for tiny commands like `pwd`, `git status`)
- `POST /api/sandbox/[id]/credentials` and `…/credentials/workspace` (sets credentials inside the container; tiny payload)
- `POST /api/sandbox/[id]/access` (SSH credential issuance — already exists)
- `POST /api/sandbox/[id]/access?scope=…` ← **new**, mints the browser tokens described in §2

---

## 4. Concrete deliverables for the Python team

### 4.1 Code changes

1. **HMAC token issuance + validation middleware** that accepts `Authorization: Bearer <token>` on the SSE/WS routes. Master key path (`X-API-Key`) keeps working unchanged.
2. **`POST /sandboxes/{id}/access-tokens`** as specified in §2.2, admin-authenticated.
3. **CORS configuration** as specified in §2.4. Default to a strict allow-list, env-driven.
4. **Confirm SSE timeouts**: `/sandboxes/{id}/exec/stream` should not impose any timeout shorter than the request body's `timeout_seconds`. Hosting/runtime timeouts (uvicorn, Coolify reverse proxy) must be ≥ the configured maximum (recommend 2h ceiling).
5. **WebSocket subprotocol parsing** for `bearer.<token>` in PTY + fs-watch routes (as in §3.2 / §3.3). Reject the upgrade with 4401 close code on auth failure (browsers can read close codes; HTTP 401 on a successful upgrade is undefined).
6. **`Access-Control-Expose-Headers: X-Sandbox-Id, X-Tier`** on every response so the browser can verify the orchestrator agrees with the token claims (defense in depth — catches tier-routing mistakes early).
7. **Audit log** for every bearer-token request: `(jti, sub, actor.user_id, scope, route, status)`. We already log on the master-key path; reuse the same sink.

### 4.2 Tests / acceptance criteria

| Scenario | Expected |
|---|---|
| `pnpm install` on a fresh sandbox via SSE | Streams output continuously for ≥ 8 minutes without disconnect; final `exit` event delivered. |
| `git clone` of a 500MB repo via SSE | Streams progress lines; completes; `exit code 0` event. |
| Open PTY via WS, type `vim file && :q!` | Cursor moves correctly; bytes flow both ways; `cols`/`rows` resize works. |
| Token replay | A `single_use:true` token used twice → second connection rejected with WS close code `4401`. |
| Expired token | TTL +1s elapsed → `401 Unauthorized` on REST, `4401` close on WS. |
| Wrong sandbox | Token for sandbox A used to dial sandbox B → `403 Forbidden`. |
| CORS | Preflight from `https://www.aimatrx.com` succeeds; preflight from `https://attacker.example` fails. |
| Master key still works | `X-API-Key` request to `/exec/stream` (no Bearer) → succeeds (Next.js fallback continues to function). |

### 4.3 Documentation

- Update `/api-surface` to include the new `/access-tokens` route.
- Add a short README section on the token model (how Next mints, how the orchestrator validates, what the scopes mean).
- Note in the orchestrator's CHANGELOG: this is **additive** — no existing routes change shape; the `Authorization: Bearer` path is opt-in.

---

## 5. matrx-admin side of the migration (planned, not blocking the Python team)

Once §4 ships:

1. New helper: `useSandboxAccessToken(sandboxId, scopes)` — hits `POST /api/sandbox/[id]/access?scope=…`, caches the token in memory for `(exp - 30s)`, refreshes lazily.
2. `SandboxProcessAdapter.stream()` switches from `/api/sandbox/[id]/exec/stream` to `${direct_url}/sandboxes/<sandbox_id>/exec/stream` with the bearer token. Old proxy route stays as fallback for one release.
3. PTY: `openPty()` no longer relies on the Vercel WS upgrade; it dials `wss://…` directly with the `bearer.<token>` subprotocol. The 426 fallback path can finally be deleted.
4. File watcher and bulk transfer move next; same pattern.
5. After two releases without falling back to the Vercel proxies, delete the proxy routes (`/api/sandbox/[id]/exec/stream`, `/api/sandbox/[id]/pty`, `…/fs/watch`).

The Vercel `maxDuration = 300` ceiling becomes irrelevant — the only routes that go through Vercel after the migration are short-JSON CRUD that completes in < 5s.

---

## 6. Out of scope

- Replacing the Supabase ownership check with an orchestrator-side check. We deliberately keep the `sandbox_instances` table authoritative on Next.js — orchestrator only knows tokens.
- Changing the orchestrator's existing `X-API-Key` master path. Token-based auth is additive.
- Switching to a different transport (gRPC-Web, etc.). HTTP/SSE + WS is sufficient and well-supported in browsers.
- A general-purpose user JWT minted directly by Supabase. We prefer scoped, short-lived, single-sandbox tokens — the blast radius of a leaked token is one sandbox for at most 15 minutes.

---

## 7. Sandbox-Mode AI passthrough — `proxy_url` (added 2026‑04‑27)

This section describes a **new, separate** capability that unblocks "true sandbox mode": running the Matrx Python server **inside the container** and pointing the editor's chat conversation at it directly, so AI requests never leave the sandbox.

### 7.1 Why

The frontend now distinguishes two modes (see `EditorMode` in `features/code/redux/codeWorkspaceSlice.ts`):

- `cloud` — the agent's Python server runs centrally and operates on cloud-stored files. AI calls hit the global `apiConfigSlice.activeServer`.
- `sandbox` — the agent's Python server is a copy running **inside the user's container** at `/home/agent/<server>` (already the case today via `matrx_agent`). AI calls should hit *that* server so tool calls execute against the local filesystem with zero round-trips.

We can't flip `apiConfigSlice.activeServer` to do this, because that would redirect every other call in the page (cloud-files, prompt-apps, agent definitions, …). Instead we already implemented a **per-conversation override** (`instanceUIState.serverOverrideUrl`, consumed by `resolveBaseUrlForConversation`) that scopes the redirection to one chat thread.

What's missing on the orchestrator side: a public, authenticated proxy that fronts the in-container Python server.

### 7.2 What we need

**One field** added to the existing `SandboxResponse` payload:

```jsonc
{
  // ...all existing fields...
  "proxy_url": "https://orchestrator.dev.codematrx.com/sandboxes/<id>/proxy"
}
```

The frontend treats this field as authoritative. When a user connects to a sandbox, `SandboxesPanel.connect()` mirrors `proxy_url` into Redux (`codeWorkspace.activeSandboxProxyUrl`); `useBindAgentToSandbox` then writes it to `instanceUIState.serverOverrideUrl` for the active conversation. Cleared on disconnect.

**Field is optional in the type** — until you ship it, the FE silently falls back to the global server (the per-conversation override stays null). No FE code change needed when you flip it on.

### 7.3 Proxy semantics (orchestrator side)

The proxy at `${proxy_url}/<path>` MUST:

1. Forward requests to the in-container Python server's `/<path>` 1:1 — same method, headers (sans hop-by-hop), body, and response shape.
2. Stream both directions for SSE/NDJSON (`/ai/agents/.../stream` etc.) — the agent execute thunks read NDJSON line-by-line.
3. Authenticate the same way as §4 — short-lived Bearer token issued by Next.js with scope `ai`. The proxy validates the token, looks up the sandbox, and forwards to `localhost:<container-port>` with no further user auth (the in-container server already trusts requests reaching its bind address).
4. Serve `OPTIONS` preflight with `Access-Control-Allow-Origin: https://www.aimatrx.com` (and the dev origin) and the standard `Allow-*` headers. The browser hits this URL directly from the chat surface.
5. Be CORS-safe with `Authorization`, `Content-Type`, `X-Conversation-Id`, `X-Instance-Id` allowed in `Access-Control-Allow-Headers`.
6. Honor the same `maxDuration ≥ 2h` ceiling as the streaming exec route — agent runs are not bounded by the proxy.
7. Strip the `X-API-Key` master-key header on the way through (defense in depth — the in-container server should never see master keys).

### 7.4 In-container Python — what it must already speak

The frontend assumes the in-container server exposes the **same `/ai/...` API** as the central server. This is true today because the container ships the same codebase via `matrx_agent`. Concrete endpoints that must work through the proxy:

- `POST /ai/agents/{agent_id}/instances/{instance_id}/execute` (NDJSON stream)
- `POST /ai/agents/{agent_id}/instances/{instance_id}/chat` (NDJSON stream)
- `POST /ai/conversations/{conversation_id}/cache/invalidate`
- Whatever tool-result endpoints the agent uses (`/ai/tool-results/...`).

If anything diverges between central and in-container, it'll silently break sandbox-mode chats with no error surface — please make divergence a deploy-time check.

### 7.5 Acceptance

| Scenario | Expected |
|---|---|
| Sandbox `proxy_url` present + user opens a chat | AI execute thunk POSTs to `${proxy_url}/ai/...`, NOT the global server. |
| Disconnect from sandbox mid-chat | New messages route back to the global server (override is cleared automatically). |
| `proxy_url` is `null` | Override never set; chat behaves identically to a non-sandbox surface. |
| Two sandboxes open in two browser tabs | Each tab's chat hits its own `proxy_url`. (The override is keyed by `conversationId` in Redux.) |
| Bearer token expired | Proxy returns `401`; existing thunks surface this as a chat error. |

### 7.6 What blocks us until this ships

Nothing — the FE has shipped behind a `null` check. The moment `SandboxResponse.proxy_url` starts coming back populated, sandbox-mode AI calls reroute automatically. We do **not** need any other coordination.

### 7.7 Status (updated 2026‑04‑27)

`proxy_url` is **shipped on the hosted orchestrator** (`orchestrator.dev.codematrx.com`). Streaming SSE through the proxy, both auth modes, and CORS for `aimatrx.com`/`*.vercel.app`/`localhost` have been verified live by the Python team. EC2 picks this up on its next GHA-triggered deploy (assuming the same env vars are set there).

Frontend integration is complete:

- `SandboxesPanel` mirrors `proxy_url` and `sandbox.id` into `codeWorkspace.activeSandboxProxyUrl` / `activeSandboxId` on connect, and clears them on disconnect.
- `useBindAgentToSandbox(conversationId, proxyUrl, sandboxRowId)` writes `instanceUIState.serverOverrideUrl` and `serverOverrideAuthToken` for the focused chat.
- `resolveBackendForConversation()` sees the override, returns `{ baseUrl, channel: "override", headers: { Authorization: "Bearer <token>", ... } }` and every execute / chat / cache-invalidate thunk picks up that backend automatically.
- Admins see the channel/URL/auth scheme in the **Backend** tab of `CreatorRunPanel`, plus a `Cloud` / `Sandbox` pill on the collapsed strip above Smart Input.

### 7.8 Token-mint contract (FE → orchestrator)

Frontend route: `POST /api/sandbox/[id]/access-tokens` (`app/api/sandbox/[id]/access-tokens/route.ts`).

- Authenticates the user via the Supabase server client.
- Verifies the sandbox row belongs to that user and is in a usable status (`ready` | `running` | `starting`).
- Resolves the orchestrator for that sandbox row (hosted vs EC2 lookup).
- Forwards `POST {orchestrator}/sandboxes/{sandbox_id}/access-tokens` with:

```jsonc
// Request
headers:
  X-API-Key: <orchestrator master key>          // server-side only — never reaches the browser
  Content-Type: application/json
body:
  {
    "scopes": ["ai"],                            // FE defaults to ["ai"]; future scopes (fs, exec) sent through unchanged
    "actor": {
      "user_id": "<supabase user id>",
      "email":   "<supabase email or null>"
    }
  }
```

- Returns the orchestrator's response payload to the browser verbatim. **Field names match `§2.2` exactly** — `expires_at` (ISO 8601 UTC string), not a unix-seconds `exp`:

```jsonc
// Response (200) — orchestrator payload, unchanged on the way through Next.js
{
  "token":      "<jwt>",
  "expires_at": "2026-04-28T08:13:04Z",
  "direct_url": "https://orchestrator.dev.codematrx.com",
  "ws_base":    "wss://orchestrator.dev.codematrx.com",
  "tier":       "hosted",                      // also "ec2"
  "sandbox_id": "<orchestrator sandbox id>",
  "jti":        "<token id>"                   // optional — present when orchestrator emits it
}
```

`useSandboxAccessToken` parses `expires_at` into unix seconds for its internal refresh timer, refreshes ~30s before expiry, and attaches the token to every `${proxy_url}/...` call as `Authorization: Bearer <token>`. (The hook also accepts a raw `exp` number for forward compatibility, but the orchestrator currently emits `expires_at`.)

**No master key ever reaches the browser.** Token minting is the sole capability surface — leaking a minted token grants `ai`-scope access to one sandbox for at most its remaining lifetime.

### 7.9 Filesystem-change detection — `RESOURCE_CHANGED` (shipped 2026-04-27)

When the agent runs in sandbox mode, the in-container Python server modifies the real filesystem inside the container directly (no client-side patches involved). Without a server-pushed signal, the FE would have to poll for those writes — too slow for a code-editor UX.

**Generic resource-changed event — live now in `@ai-matrx/agents/generated/stream-events`:**

```jsonc
// NDJSON event in the same stream the FE already consumes
{
  "event": "resource_changed",
  "data": {
    "kind":        "fs.file" | "fs.directory" | string, // open-set; future kinds layer on without schema changes
    "action":      "created" | "modified" | "deleted" | "moved" | "renamed" | "invalidated",
    "resource_id": "/home/agent/src/components/Foo.tsx", // canonical id — absolute path for fs.* kinds
    "sandbox_id":  "sbx-abc-123" | null,                 // populated when the change came from inside a container
    "user_id":     "user-uuid" | null,                   // populated for user-scoped (cloud) kinds
    "metadata": {
      "size":        12345,
      "mtime":       1714248731.512,
      "checksum":    "sha1:…",
      "previous_id": "/home/agent/src/components/Bar.tsx" // only present on action === "moved" / "renamed"
      // additional fields per kind — caller should ignore unknown keys
    }
  }
}
```

**Why open-set kinds.** matrx-ai's `fs_write` / `fs_patch` / `fs_mkdir` tools emit `kind: "fs.file"` / `"fs.directory"` today. Future invalidations — `cld_files` row updates, `sandbox.cwd` changes, `cache.*` busts — reuse the same wire shape with a new `kind` and **no FE plumbing changes** beyond a new dispatch branch in the consumer hook.

**FE wiring (live):**

| Layer | File | Role |
|---|---|---|
| Wire types | `@ai-matrx/agents/generated/stream-events` | Auto-generated. Includes `EventType.RESOURCE_CHANGED`, `ResourceChangedPayload`, `isResourceChangedEvent`. |
| Slice | `features/code/redux/fsChangesSlice.ts` | Per-bucket ring buffer (cap `FS_CHANGES_RING_SIZE = 200`) + `lastByResourceId` lookup. Bucket key = `sandboxId` (or `GLOBAL_BUCKET_KEY`). Selectors: `selectFsChangesBucket`, `selectLastChangeForResource`, `makeSelectChangesByResourceId`, `makeSelectRecentChanges`, `selectLastFsChangeAt`. |
| Stream branch | `../aidream/apps/shared/chat/src/agents/redux/execution-system/thunks/process-stream.ts` | `else if (isResourceChangedEvent(event))` dispatches `receivedFsChange` + `appendTimeline({ kind: "resource_changed", … })` and increments `clientMetrics.resourceChangedEvents`. |
| Timeline type | `../aidream/apps/shared/chat/src/agents/types/request.types.ts` | `TimelineResourceChanged` entry + `ClientMetrics.resourceChangedEvents` counter. |
| Offline replay | `features/tool-call-visualization/testing/stream-processing/fold-stream-events.ts` | `state.resourceChanges` array + `counts.resourceChanged` so replay tools see the same shape. |
| Debug surfaces | `../aidream/apps/shared/chat/src/agents/components/debug/StreamDebugPanel.tsx`, `../aidream/apps/shared/chat/src/agents/components/run-controls/panels/ClientMetricsPanel.tsx`, `app/(public)/demos/api-tests/tool-testing/components/StreamEventTimeline.tsx` | `resource_changed` filter chip, fuchsia color, `FilePlus2` icon, summary line, "FS Changes" stat row. |
| Editor consumer | `features/code/agent-context/useApplyFsChangesToOpenTabs.ts` | Subscribes to the active sandbox bucket. For each new event: `fs.file` → refresh clean tabs via `FilesystemAdapter.readFile()` + `replaceTabContent`, or surface a conflict toast on dirty tabs; `deleted` → close tab; `moved`/`renamed` → close (no in-place rename in the tab slice yet); `fs.directory invalidated` → no-op (explorer's lazy refresh covers it); unknown kinds logged + ignored. Coalesces multi-write bursts to one refresh per `resource_id`. |
| Mounted in | `features/code/editor/EditorArea.tsx` | Single `useApplyFsChangesToOpenTabs()` call alongside `useApplyAIPatchesToActiveTab`. |
| Disconnect | `features/code/views/sandboxes/SandboxesPanel.tsx` | `disconnect()` calls `clearFsChangesBucket(activeId)` so the next sandbox doesn't see stale rows. |

The slice and consumer are **forward-compatible**: a new `kind` (e.g. `cld_files`) lands in the slice with zero changes — only `useApplyFsChangesToOpenTabs` (or a sibling consumer hook) needs a new dispatch branch.

**Coalescing.** The consumer collapses repeated events for the same `resource_id` within one render tick to a single refresh; per-event work in the slice and stream router is O(1). The slice ring is capped, so a long-running session can't grow unbounded.

**Acknowledgement.** After the consumer handles an event for a given `resource_id`, it dispatches `acknowledgeFsChange({ bucketKey, resourceId })` to drop the lookup row (the ring is preserved for debug/badge surfaces). This stops follow-up renders from re-firing the same toast.

### 7.10 Client-side patch detection — applied on the FE

In addition to direct tool-call mutations, the agent often returns SEARCH/REPLACE blocks **inline in its assistant text**. These are not tool calls — they're a structured pattern in the markdown stream that the FE detects and applies on the client.

This now lives in `features/code/`:

| Layer | File | Role |
|---|---|---|
| Parser | `features/code-editor/agent-code-editor/utils/parseCodeEdits.ts` | Extracts `CodeEdit[]` from raw assistant text. Reused as-is from the cloud code editor — same delimiters, same fuzzy fallback. |
| Applier | `features/code-editor/agent-code-editor/utils/applyCodeEdits.ts` | Applies edits to a single buffer (exact → fuzzy match). |
| Slice | `features/code/redux/codePatchesSlice.ts` | Stages pending patches per `tabId`, dedupes by `(conversationId, requestId, tabId)`. |
| Hook | `features/code/agent-context/useApplyAIPatchesToActiveTab.ts` | Watches stream completion, locates each block in any open tab via the applier, dispatches `stagePatches`. |
| UI (in tab) | `features/code/editor/TabDiffView.tsx` | When a tab has pending patches, `EditorArea` swaps `<MonacoEditor>` for this Cursor-style inline diff view. Slim toolbar with `Accept all` / `Reject all`, expandable per-edit list, and a Monaco `DiffEditor` showing original vs. proposed. |
| UI (sidebar) | `features/code/views/explorer/PendingChangesSection.tsx` | "Pending Changes" section in the Explorer that lists every tab with staged edits. Click a row → activates that tab → `TabDiffView` renders the diff. Auto-hides when there are no pending patches. |

Acceptance flow:

```
parse(stream-end text)
  → for each block: try-apply against every open tab's buffer
    → 1 winner: stage as PendingPatch on that tab
    → 0 winners: skip (target file isn't open; sandbox FS or RESOURCE_CHANGED handles it)
    → 2+ winners: skip (ambiguous — never overwrite the wrong file)
  → user accepts via tray
    → applyCodeEdits(tab.content, [patch])
    → updateTabContent(tab.id, result.code)            // tab becomes dirty
    → user saves (Cmd/Ctrl+S) → existing useSaveActiveTab pipeline writes
      to the right place: code-files, library adapter, sandbox FS, or mock.
```

This means client-side patches and sandbox-mode tool-call writes can coexist in a single conversation: tool-call writes hit the container directly (visible via `RESOURCE_CHANGED` once shipped), and inline SEARCH/REPLACE blocks become tray entries the user explicitly approves before they touch any file.


