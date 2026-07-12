# Sandbox-in-chat binding — what it is, what broke, and why

Status: ✅ working end-to-end (verified 2026-05-25 — agent ran `whoami` / `pwd` /
`ls /home/agent` inside box `sbx-85124c623c17`).

## 1. What this block is

The feature that lets a chat agent **do real work inside a user's sandbox**
(read/write files, run shell, clone repos). The user attaches a box from the
chat input; from then on the agent's `fs_*` / `shell_*` / `git_*` tool calls
execute **inside that container** instead of on the AI-Dream host.

The data path on every chat turn:

```
SandboxPanel (attach)                          ← binds the box
  → cx_conversation.sandbox_instance_id         THE BINDING (source of truth,
      ↕ mirrored to Redux `sandboxBinding`      the same column the server reads)
  → activeAgentSandboxBySurface preference      a SEED for NEW conversations only,
                                                promoted onto the record on first use

smartExecute → ensureSandboxOrDecide()         ← the pre-send gate (§4c)
  → gates ONLY on the conversation's own binding; persists any change BEFORE sending

execute thunk → buildToolInjection()           ← runs CLIENT-side, every turn
  → getRegisteredCapabilities()                 (the provider registry)
  → sandbox-fs provider → getActiveSandboxBinding(state, conversationId)
      → resolveAgentSandboxRef()                (conversation binding ?? surface seed)
      → POST /api/sandbox/{id}/access-tokens     (mint a scoped bearer)
  → emits client.capabilities:["sandbox-fs"] + client.state["sandbox-fs"]
  → execute thunk promotes it to the top-level `sandbox` request field

AI Dream (server) reads top-level `sandbox` → ctx.metadata["active_sandbox"]
  → matrx-ai fs/shell/git tools detect active_sandbox → proxy into the box
```

Two more pieces:
- **Which server runs the loop:** EC2 (slim) boxes route the turn to the nearby
  dedicated server (`NEXT_PUBLIC_EC2_SANDBOX_SERVER_URL`) — but only on the
  `production` server toggle; an explicit localhost/custom choice always wins.
- **Tool arming:** declaring `sandbox-fs` is supposed to auto-arm the coding
  tools. Server-side that's the capability's `enabled_tools` (aidream change,
  pending deploy); until then a **client stopgap** in `buildToolInjection`
  pushes the tool list when `sandbox-fs` is active.

## 2. The bugs (in the order they were hit)

Three independent defects, each of which alone made the feature look "done" but
do nothing.

### A. The binding was shipped on a field the server doesn't read
The frontend sent the binding only inside `client.state["sandbox-fs"]`. AI Dream
hydrates `active_sandbox` (the key the fs/shell tools read) **only** from the
**top-level `sandbox` request field**; the capability payload lands on a
different metadata key with no bridge. → Tools never routed into the box.
**Fix:** promote the binding to the top-level `sandbox` field in the execute
thunks (keep the capability for forward-compat).

### B. The capability registry was empty on the client (the big one)
`buildToolInjection` runs **client-side** and reads a module-level registry
`Map`. That Map is filled by a side-effect import (`register-all`) that was
placed **only in `app/Providers.tsx` — a Server Component.** So the providers
registered into the *server's* copy of the module while the *client's* copy
stayed empty. Result: `getRegisteredCapabilities() → []`, `client.capabilities`
`= []` on **every** turn, for **every** client capability (sandbox-fs,
editor-state, nextjs-surface) — not just sandbox. **Fix:** import `register-all`
from `build-tool-injection.ts` (the client-side consumer) so the same module
graph that reads the registry also populates it. The server-side import was
removed.

### C. Token mint contract mismatch (exp vs expires_at)
The mint succeeded (HTTP 200, valid JWT), but `fetchAccessToken` accepted only a
numeric `exp` field. The orchestrator returns `{ token, expires_at (ISO),
sandbox_id, tier, direct_url, ws_base }` — no `exp`. So `typeof json.exp !==
"number"` rejected every valid token and dropped the binding. **Fix:** parse
`expires_at` → unix seconds (still accept legacy `exp`).

Bonus (earlier in the session): the EC2 auto-routing was placed *ahead* of the
server toggle, so a bound box silently forced the remote server and ignored the
localhost button. **Fix:** auto-routing only applies on the `production` toggle.

## 3. Why this was able to happen — the failure classes

1. **Silent `return null` everywhere.** Every failure (no box, mint network
   error, mint non-200, unparseable body, dropped binding) returned `null`
   without a log. The feature degraded to "no sandbox" with zero signal — which
   is why it took hours instead of one glance. The whole binding path is now
   loud (`[sandbox-binding]`, `[sandbox-orchestrator-env]`, `[sandbox-routing]`).
2. **Server/client module-graph boundary.** A side-effect registration in a
   Server Component populates a *different* module instance than the client
   reads. Module-level singletons that are read on the client must be registered
   on the client.
3. **Contract drift with no validation.** FE assumed `exp:number`; the
   orchestrator sends `expires_at:string`. Nothing logged the mismatch; the
   token was just silently discarded.

## 4. Prevention / where it's verified now

- **Visibility is permanent**, not just debug logs: the Creator Hub **Routing**
  tab shows, per turn, the exact URL, channel, server toggle, the resolved
  sandbox + whether the binding attached, capabilities, and tool names. "Where
  did the traffic go / did the box bind" is now a fact, not a guess.
- **Registry**: registration is co-located with the client consumer; the
  Server-Component import is removed with a "do not re-add" note.
- **Audit (this pass):** `app/Providers.tsx` had exactly one such side-effect
  import (the broken one). The only other registry that touches `register-all`
  is `features/agents/ui-first-tools/tools/registry.ts`, which uses the safer
  co-located pattern (it imports its own tools at the bottom of the file that's
  read on the client) — not affected.

## 4b. Stale-binding hardening (2026-06-15)

A bound box can **expire after it was selected**. The stored ref carries no
liveness signal, so a new conversation auto-inherited the surface-default
**corpse** — minted a 409 and routed the whole turn to a dead EC2 host (502 +
CORS). Two layers now prevent this:

1. **Turn-time tombstone** (`lib/sandbox/active-binding.ts`): when a token mint
   reports the box terminally gone (409 / "not running" / "status: expired|
   stopped|failed"), the rowId is tombstoned (`markSandboxDead`).
   `resolveAgentSandboxRef` then refuses to resolve it at every level —
   suppressing **both** the binding and the `ec2-dedicated` routing — so the
   turn falls back to the global server. The mint runs before the AI stream in
   the same turn, so turn N is protected. A successful mint or
   `clearSandboxBindingCache` (re-attach) clears the tombstone.
2. **Load-time verification** (`hooks/sandbox/use-verified-binding.ts`): the UI
   no longer shows a binding straight from preferences. `useVerifiedSandboxBinding`
   checks the bound box against `/api/compute-targets` (real status) and only
   reports `verified` once it's confirmed online — `verifying` shows nothing,
   `unavailable` shows a re-attach hint. `RunControlsMenu` (the indicator dot)
   and `SandboxPanel` (the binding chip) both consume it, so a stale box never
   appears attached and the user can simply pick a live one.

## 4c. The gate fired on a conversation that never had a sandbox (2026-07-12)

**Symptom:** on `/chat/new`, the very first message was blocked by the pre-send
gate — *"This conversation is bound to a sandbox, but it can't be reached right
now"* — for a brand-new conversation that had never had one. It looked random.

**Cause — a preference was being read as a binding.** The gate asked "is this
conversation bound?" via a resolver that returned the first of *(conversation
override, surface preference, editor)*. A conversation on `/chat/new` has no
override, so the answer came from `activeAgentSandboxBySurface["chat-route"]` —
a **persisted user preference** written once, months earlier, by attaching a box
in surface mode, and which **nothing ever clears when the box dies**. The token
mint 404s on the corpse, the gate concludes "bound but unresolvable", and blocks
the send. The class of error: *a default for future conversations was allowed to
answer a question about this conversation's history.*

**Fix — one source of truth, and it's the row the server also reads.**
- A conversation is bound **iff its own record says so** — `sandboxBinding`,
  backed by `cx_conversation.sandbox_instance_id`. `getConversationSandboxBinding()`
  is the only thing the gate reads. Redux is now hydrated identically for a
  locally-created and a fetched conversation (`load-conversation.thunk.ts`), so
  "new" and "cached" conversations can't behave differently.
- The surface preference is demoted to an explicit **seed** (`getSurfaceSeedRef`):
  it arms an *unbound* conversation, and the first turn that actually resolves it
  live **promotes** it onto the record + writes the DB
  (`promoteSurfaceSeedToConversation`). A seed **never gates**: a dead seed just
  warns loudly and the turn goes out unbound — nothing was bound, nothing is at
  risk. It is NOT auto-deleted (a stopped box can be restarted; the panel already
  shows it as `unavailable`).
- **The DB is written BEFORE the request goes out.** The server runs the same
  `sandbox_instance_id` check, so "send without sandbox" now persists
  `sandbox_instance_id = null` *and* clears the surface seed (which would
  otherwise re-arm the box on the very next turn) before proceeding. A binding
  set while the conversation had no DB row yet (`cacheOnly` — the row is created
  server-side by the first turn) is flagged `sandboxBindingPersisted: false` and
  the write is retried at the next send.
- The metadata mirror now also carries `kind` and `name`. It didn't before, so a
  **local-PC binding silently lost its `kind` on reload** and became unroutable.

Guarded by `lib/sandbox/__tests__/sandbox-gate.test.ts` — the two load-bearing
cases are "dead seed → no gate, send proceeds" and "real binding → gate opens".

## 5. Still open (separate, tracked)

- **Deploy the aidream `sandbox-fs` `enabled_tools` change** (uncommitted in the
  aidream repo) so the server arms the coding toolset natively; then delete the
  client stopgap in `buildToolInjection`.
- **Trim the verbose `[SBX]` / per-turn `resolveAgentSandboxRef` logs** back to
  failure-only once this has soaked.
- A broader **silent-`return null` sweep** of the agent/sandbox fetch paths is
  worthwhile but out of scope for this fix.
