# Sandbox proxy + FS-change events — FE integration guide

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/infrastructure/compute-targets/FEATURE.md` — read it before touching this feature in ANY repo.

**Status:** Backend shipped 2026-04-27. FE side is what this doc walks through.
**Companion specs:** [SANDBOX_DIRECT_ENDPOINTS.md](./SANDBOX_DIRECT_ENDPOINTS.md) (your original ask), [SYSTEM_STATE.md](./SYSTEM_STATE.md) (workspace truth).
**Author:** Python team — written 2026-04-27 after shipping §2 + §7 of the direct-endpoints spec and the new generic `RESOURCE_CHANGED` event.

---

## TL;DR

Two backend pieces just landed. The FE wiring is tiny because both pieces were shipped to fit `code/`'s existing seams.

1. **Browser-direct sandbox proxy** — Every `SandboxResponse` now carries a `proxy_url`. Mint a short-lived bearer token via Next.js, then the browser hits `${proxy_url}/<any-daemon-path>` directly. Vercel's 300s function cap + WS limitations are bypassed for streaming/PTY/large transfers and for sandbox-mode AI passthrough.
2. **`RESOURCE_CHANGED` stream event** — New canonical "refetch this" primitive. matrx-ai's `fs_write` / `fs_patch` / `fs_mkdir` emit it on success. Any future invalidation (cloud_files row updates, sandbox session-state changes, cache busts) uses the same event shape with a different `kind`.

After this doc's steps land, the agent edits a file in the user's sandbox → the editor tab refreshes within ~1 RTT, no polling, no extra connections.

---

## 1. Run `pnpm sync-types`

Pull the new `RESOURCE_CHANGED` Python types into TypeScript:

```bash
pnpm sync-types
```

This regenerates `aidream/api/generated/stream-events.ts` (or wherever your local copy lives — your existing `sync-types` script knows). After it runs, you should see in the diff:

- `EventType.RESOURCE_CHANGED = "resource_changed"` added to the `EventType` const object.
- A new `ResourceChangedPayload` interface with fields `kind`, `action`, `resource_id`, `sandbox_id?`, `user_id?`, `metadata`.
- The `EventPayloadByType` (or equivalent) discriminated union grows one entry mapping `"resource_changed"` → `ResourceChangedPayload`.

**If you don't see the new types after running sync, the AI Dream backend you're pointing at is on an older commit.** Check `commit d931ba85` is deployed. Production aidream auto-redeploys on `main` push.

---

## 2. Wire the `RESOURCE_CHANGED` handler

The NDJSON event router you already use for `chunk` / `tool_event` / `record_update` gets one new branch.

### 2.1 Where the events come from

Every NDJSON stream the FE reads from any aidream agent run **automatically** carries `resource_changed` events when the agent makes filesystem mutations. The same payload would be sent regardless of whether the agent runs:

- On the central aidream backend (multi-tenant — `kind: "fs.file"`, no `sandbox_id`)
- Inside a sandbox via `mtx aidream serve` and the `proxy_url` (see §3 below) — same `kind`, but `sandbox_id` populated and `resource_id` is the in-container absolute path

You don't need to handle these two cases separately. The reducer can dispatch on `kind` + `resource_id` and let the existing path-matching logic decide which open tab is affected.

### 2.2 Suggested reducer shape

In a new file, e.g. `features/code/redux/fsChangesSlice.ts`:

```ts
type FsChange = {
    kind: "fs.file" | "fs.directory";
    action: "created" | "modified" | "deleted" | "moved" | "renamed" | "invalidated";
    resourceId: string;        // absolute path inside the sandbox
    sandboxId?: string;
    metadata: {
        size?: number;
        mtime?: number;
        checksum?: string;
        previous_id?: string;  // on move/rename
        // free-form per kind
    };
    receivedAt: number;        // epoch ms — for dedup + UX timestamps
};

// State: a small ring buffer per sandbox, plus a "lastChangeByPath" map
// for fast O(1) lookup from the editor's tab-store.
```

### 2.3 Dispatch from the NDJSON reader

Wherever you currently switch on `event` for the agent's response stream, add:

```ts
case "resource_changed": {
    const data = ev.data as ResourceChangedPayload;
    if (data.kind === "fs.file" || data.kind === "fs.directory") {
        store.dispatch(fsChangesSlice.actions.received({
            kind: data.kind,
            action: data.action,
            resourceId: data.resource_id,
            sandboxId: data.sandbox_id ?? undefined,
            metadata: data.metadata,
            receivedAt: Date.now(),
        }));
    }
    // Future kinds (cld_files, sandbox.cwd, cache.*) get their own handlers
    // here as we add them. Don't crash on unknown kinds — log + ignore.
    break;
}
```

### 2.4 Refresh open editor tabs

Subscribe to the slice from your tab manager (or the existing tab-content store):

```ts
// On every fsChange where kind === "fs.file":
//   for each open tab whose absolute path matches change.resource_id:
//     - if tab is dirty (has unsaved local edits):
//          surface conflict toast (Take theirs / Keep mine / Show diff)
//     - else:
//          re-fetch via ${sandbox.proxy_url}/fs/read?path=<encoded path>
//          replace the buffer; update pristineContent
//     - flash a "recently modified" badge in the file tree
//
// On kind === "fs.directory" and action === "invalidated":
//   any cached file-tree state under resource_id is stale; refetch listing
//   on next view (lazy) OR refetch immediately if the file tree is open.
```

The conflict toast uses the same UX pattern as the existing source-of-truth conflict on Library Source Adapters (`Reload` / `Overwrite`) — reuse if convenient.

### 2.5 Edge cases worth handling

| Case | What to do |
|---|---|
| Agent writes a file the user hasn't opened | Slice records the change; no tab refresh; file-tree badge if visible. |
| Agent writes the same file 50 times in a turn | Each event is separate; debounce on resourceId in the slice OR rely on natural batching from the React render loop. |
| `kind === "fs.directory"` `action === "invalidated"` | Bulk hint — invalidate any cached listing for that prefix; lazy-refetch on next render. Don't fan out to per-file refresh. |
| `action === "moved"` or `"renamed"` | `metadata.previous_id` carries the old path. Update the open-tab path field; close+reopen if your tab system can't rename in place. |
| Unknown `kind` | Log and ignore — don't crash. Future-compat. |

---

## 3. Browser-direct sandbox proxy (when you're ready)

Already shipped on the orchestrator side; FE wiring is independent of §1+§2 above.

### 3.1 What's live now

Every `SandboxResponse` now contains `proxy_url`:

```jsonc
{
  "sandbox_id": "sbx-...",
  ...,
  "proxy_url": "https://orchestrator.dev.codematrx.com/sandboxes/sbx-.../proxy"
}
```

When unset (orchestrator hasn't been configured with `MATRX_PUBLIC_URL`), `proxy_url` is `null`. Your existing null-check is correct — fall back to the global server transparently.

### 3.2 The two new orchestrator endpoints

```
POST /sandboxes/{id}/access-tokens   (admin auth — Next.js server-only)
ANY  /sandboxes/{id}/proxy/{path:path}   (bearer token OR admin auth)
```

`POST /access-tokens` body:

```jsonc
{
  "scopes": ["ai"],                 // or narrower; see §3.3
  "ttl_seconds": 300,               // default 300, hard cap 900
  "actor": { "user_id": "...", "email": "..." },
  "single_use": false               // true for WS upgrades; see §3.5
}
```

Response:

```jsonc
{
  "token": "eyJhbGciOi...",         // HS256 JWT
  "expires_at": "2026-04-27T18:30:00Z",
  "direct_url": "https://orchestrator.dev.codematrx.com",
  "ws_base":    "wss://orchestrator.dev.codematrx.com",
  "tier": "hosted",                 // or "ec2"
  "sandbox_id": "sbx-..."
}
```

The token is bound to one sandbox + one scope set + a short TTL. Replay across sandboxes is rejected (signed `sub` claim). See `orchestrator/auth/sandbox_token.py` for the exact contract.

### 3.3 Recommended `scopes` map

| Scope | Use for |
|---|---|
| `ai` | Sandbox-mode AI passthrough — `${proxy_url}/ai/agents/.../execute` etc. |
| `exec.stream` | Direct SSE exec — `${proxy_url}/exec/stream` |
| `pty` | PTY WebSocket — `${ws_base}/sandboxes/{id}/pty` |
| `fs.read` / `fs.write` | Direct large-file transfer (if/when you migrate uploads off Vercel) |
| `fs.watch` | File-watcher WebSocket — `${ws_base}/sandboxes/{id}/fs/watch` |

Use the narrowest scope set that covers the call you're making. The orchestrator validates scope on every request; over-scoped tokens are still bounded by single-sandbox + short TTL but provide a smaller blast radius.

### 3.4 Next.js side — token-issuance proxy

Your `app/api/sandbox/[id]/access-tokens/route.ts` (new) takes the place of the `app/api/sandbox/[id]/access` (SSH) endpoint pattern but for browser tokens. Sketch:

```ts
// POST /api/sandbox/[id]/access-tokens?scope=ai
// Authenticated (Supabase user). Verifies ownership of the sandbox row,
// resolves the tier, asks the matching orchestrator to mint a token,
// returns it to the browser.

import { createClient } from "@/utils/supabase/server";
import { lookupSandboxAndOrchestrator, orchestratorJsonHeaders } from "@/lib/sandbox/orchestrator-routing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const lookup = await lookupSandboxAndOrchestrator(id);
  if (!lookup.ok) return NextResponse.json({ error: lookup.error }, { status: lookup.status });

  const body = await req.json();
  const orchResp = await fetch(`${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/access-tokens`, {
    method: "POST",
    headers: orchestratorJsonHeaders(lookup.orchestrator),
    body: JSON.stringify({
      scopes: body.scopes ?? ["ai"],
      ttl_seconds: body.ttl_seconds,
      actor: { user_id: user.id, email: user.email },
      single_use: body.single_use ?? false,
    }),
  });

  if (!orchResp.ok) return NextResponse.json({ error: await orchResp.text() }, { status: orchResp.status });
  return NextResponse.json(await orchResp.json());
}
```

### 3.4½ Header layout — exact contract for `${proxy_url}/...` calls

**For sandbox-mode AI passthrough (your current pattern — just swap the base URL):**

```
Authorization: Bearer <user-supabase-jwt>     # forwarded UNCHANGED to the in-container aidream
Content-Type: application/json                # standard
```

That's it. No `X-Sandbox-Access-Token`, no `X-API-Key`. The orchestrator's `/proxy/{path:path}` route now treats `Authorization: Bearer <anything>` that doesn't validate as our HMAC token as **upstream identity** and forwards it verbatim. The in-container aidream gets the same Authorization header it would on `localhost` / central, validates the JWT, finds the conversation. **This is fixed in `matrx-sandbox c94d25a` (deployed on the hosted orchestrator).**

If you previously set both `Authorization: Bearer <jwt>` and got `Conversation not found: 404`, that was the bug — orchestrator was stripping Authorization. No FE changes needed; just retry against the live hosted orchestrator.

**For non-AI direct calls (PTY, exec/stream, fs/watch, large-body uploads) where there's no upstream JWT to forward:**

Use the dedicated proxy-auth header so it doesn't collide with anything:

```
X-Sandbox-Access-Token: <token from POST /access-tokens>     # consumed + stripped by orchestrator
Content-Type: application/json
```

The orchestrator validates this token (signature, sandbox-id binding, scope, expiry) and strips the header before forwarding. Authorization is left alone (so if you ever want to ALSO forward an Authorization, it works — though for these non-AI paths the daemon usually doesn't need one).

**For server-to-server admin tooling:**

```
X-API-Key: <master orchestrator key>
```

Also stripped before forwarding. Used by Next.js's own per-sandbox proxy routes and ops scripts.

**Summary table:**

| Scenario | Send | Stripped before forwarding? |
|---|---|---|
| FE → AI passthrough | `Authorization: Bearer <jwt>` | No — daemon needs it |
| FE → PTY / exec.stream / fs.watch | `X-Sandbox-Access-Token: <token>` | Yes |
| Next.js / ops → anything | `X-API-Key: <master>` | Yes |
| Legacy: FE → anything with our HMAC token in Authorization | `Authorization: Bearer <our-token>` | Yes (orchestrator-owned) |

You can mix `X-Sandbox-Access-Token` (proxy auth) AND `Authorization` (forwarded upstream) on the same call. They never collide.

---

### 3.5 Browser-side — caching + refresh

```ts
// Cache by (sandboxId, scopeSet); refresh when (exp - 30s) elapsed.
function useSandboxAccessToken(sandboxId: string, scopes: string[]) {
  // Fetch from /api/sandbox/[id]/access-tokens with body { scopes }.
  // Cache the {token, expires_at, direct_url, ws_base} tuple in memory.
  // On consumer call, return cached if fresh, else refresh and return.
}
```

For SSE/HTTP, use `single_use: false` (default) — retries should be cheap. For WebSocket upgrades (PTY, fs/watch), use `single_use: true` so a leaked token on the wire is consumed on first connect and replay is impossible.

### 3.6 Sandbox-mode AI passthrough

This is the immediate FE win — already specced in §7 of [SANDBOX_DIRECT_ENDPOINTS.md](./SANDBOX_DIRECT_ENDPOINTS.md), now unblocked:

1. On `SandboxesPanel.connect()`, mint a token with `scopes: ["ai"]`.
2. Mirror `proxy_url` + `token` into Redux (`codeWorkspace.activeSandboxProxyUrl`, `…Token`).
3. `useBindAgentToSandbox` writes `${proxy_url}` into `instanceUIState.serverOverrideUrl`. Add `Authorization: Bearer ${token}` to the agent's existing fetch headers when this URL is in use.
4. On disconnect, clear both. Token expires on its own.

Once this lands, sandbox-mode chats route browser → orchestrator/proxy → in-container `mtx aidream serve` directly. Each tool call the agent makes runs on the sandbox's own filesystem, so `fs_write` events fire from inside the sandbox and your `fs_changes` slice from §2 picks them up. No Vercel hop, no network cap, no FS-roundtrip tax.

---

## 4. Acceptance criteria

| Scenario | Expected |
|---|---|
| `pnpm sync-types` after this lands | `EventType.RESOURCE_CHANGED` appears in the generated TS, with the typed `ResourceChangedPayload` interface. |
| Agent does `fs_write` to an open editor tab in cloud mode | NDJSON stream carries one `resource_changed` event. Editor tab content refreshes within ~1 RTT. |
| Agent writes 5 files in one turn | 5 separate events; FE may debounce per-resource_id. |
| Agent does `fs_patch` with conflict (user has unsaved edits) | Conflict toast surfaces; user picks Take theirs / Keep mine / Show diff. |
| `proxy_url` populated on `SandboxResponse` | Available immediately on a fresh sandbox; legacy in-memory rows backfill on read. |
| Token with `scopes: ["ai"]` on `${proxy_url}/processes` | 200 OK, daemon returns process list. |
| Token for sandbox A used on sandbox B | 401 with `token sandbox_id mismatch`. |
| Expired token | 401 with `token expired`. |
| Token issued for `scopes: ["fs.read"]` used on `${proxy_url}/exec/stream` | 401 with `missing required scope: ai` (current default). Adjust scope mapping if you want this to differ — see §3.3. |
| Sandbox-mode AI run | Chat thunks POST to `${proxy_url}/ai/...`, NOT the global server. Tools the agent calls operate on `/home/agent/...` directly. |

---

## 5. What's NOT yet shipped

These need real-usage data before we know whether they're worth building:

- **Universal file watcher (inotify via `/fs/watch` WS)** — would catch terminal-driven changes (user runs `git checkout` in a terminal tab; build tools writing artifacts). Same `RESOURCE_CHANGED` shape; just a different source. Layer on later if/when users complain "I touched this in the terminal and the editor didn't notice."
- **Shell-tool emit hooks** — `shell_execute` / `shell_python` may write to the FS but we don't know what without parsing strace. Currently these don't emit `resource_changed`. The fs/watch WS fills this gap when it ships.
- **WebSocket bearer-subprotocol parsing** on `/proxy/{path:path}` upgrades (the `Sec-WebSocket-Protocol: matrx.sandbox.pty.v1, bearer.<token>` shape from §3.2 of SANDBOX_DIRECT_ENDPOINTS.md) — the orchestrator route accepts the methods but the WS-bearer path is deferred. PTY direct-via-proxy still works through `X-API-Key` admin path; bearer-only upgrades need this piece next.

---

## 6. Sources of truth

If any of this drifts, these are the canonical files:

- **Event vocabulary + the rule for when to use which event** — [`packages/matrx-connect/CLAUDE.md`](../../../aidream-current/packages/matrx-connect/CLAUDE.md) → "The event vocabulary" section. **Read this before adding any new emitter call.**
- **`RESOURCE_CHANGED` payload definition** — `packages/matrx-connect/matrx_connect/context/events.py::ResourceChangedPayload`
- **Orchestrator proxy + token contract** — `matrx-sandbox/orchestrator/orchestrator/routes/sandboxes.py` and `orchestrator/auth/sandbox_token.py`
- **Backend commits that shipped this** — `matrx-sandbox` `b051630` (proxy + tokens) and `aidream-current` `d931ba85` (RESOURCE_CHANGED + fs tool emits)

---

## 7. Quick test before merging your FE changes

Spawn a sandbox, mint a token via the new Next.js route, hit the proxy directly:

```bash
SANDBOX_ID=...                    # from /api/sandbox response
TOKEN=...                         # from /api/sandbox/$ID/access-tokens response

# 1. Reaches the daemon
curl https://orchestrator.dev.codematrx.com/sandboxes/$SANDBOX_ID/proxy/processes \
  -H "Authorization: Bearer $TOKEN"

# 2. Streams an exec
curl -N -X POST https://orchestrator.dev.codematrx.com/sandboxes/$SANDBOX_ID/proxy/exec/stream \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"for i in 1 2 3; do echo line-$i; sleep 0.3; done","timeout_seconds":10}'

# 3. Reads a file
curl https://orchestrator.dev.codematrx.com/sandboxes/$SANDBOX_ID/proxy/fs/list?path=/home/agent \
  -H "Authorization: Bearer $TOKEN"
```

All three should work. If `proxy_url` is null on your sandbox row, the orchestrator hasn't been configured (`MATRX_PUBLIC_URL` + `MATRX_ACCESS_TOKEN_SECRET` env vars). On the hosted tier these are set today; EC2 needs the same two env vars for `proxy_url` to be non-null there.
