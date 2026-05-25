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
SandboxPanel (attach)                          ← writes which box to Redux
  → userPreferences.coding.activeAgentSandbox   (shared default)  OR
    cx_conversation.sandbox_instance_id         (per-conversation override)

execute thunk → buildToolInjection()           ← runs CLIENT-side, every turn
  → getRegisteredCapabilities()                 (the provider registry)
  → sandbox-fs provider → getActiveSandboxBinding(state, conversationId)
      → resolveAgentSandboxRef()                (override ?? user-active ?? editor)
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

## 5. Still open (separate, tracked)

- **Deploy the aidream `sandbox-fs` `enabled_tools` change** (uncommitted in the
  aidream repo) so the server arms the coding toolset natively; then delete the
  client stopgap in `buildToolInjection`.
- **Trim the verbose `[SBX]` / per-turn `resolveAgentSandboxRef` logs** back to
  failure-only once this has soaked.
- A broader **silent-`return null` sweep** of the agent/sandbox fetch paths is
  worthwhile but out of scope for this fix.
