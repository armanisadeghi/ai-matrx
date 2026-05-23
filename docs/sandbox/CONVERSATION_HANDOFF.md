# Conversation Handoff — running the agent inside a sandbox

Status: **backend live & verified** (hosted orchestrator) · Date: 2026-05-23

The goal: start a conversation, spin up a sandbox, and have the agent do its
real work — clone a repo, read/write files, run commands, push a branch —
**inside that box**, with the user's memory present. Same for both box types.

This documents what's real now, the exact frontend flow, and the two operator
actions still needed.

---

## The architecture truth (read this first)

There are two ways "the agent works inside the sandbox" could mean. We verified
which one the codebase actually implements, and it's the lean, correct one:

**Model B — loop remote, hands in the box (THIS is what's built & live).**
The agent loop runs where it already runs (AI Dream's `execute_ai_request`).
For a handed-off conversation, the loop's filesystem/shell/git **tools execute
inside the sandbox** via the orchestrator. The conversation stays in AI Dream;
every file edit, command, and `git push` lands in the box. Functionally this
IS "the agent working in the sandbox," and it works identically for the slim
box and the aidream box — slim stays slim, no secrets shipped into the box.

The machinery (already present, now unblocked):
- `matrx-ai` `tools/_sandbox_proxy.py` — when `AppContext.metadata["active_sandbox"]`
  is set, fs/shell tools target the box instead of the host.
- aidream `routers/chat.py` — accepts a `sandbox` field on the chat request and
  puts it on the context. **No per-tool plumbing.**
- orchestrator — now accepts the scoped token on the structured tool routes
  (`/fs`, `/exec`, `/git`, `/search`, `/processes`, `/ports`, `/pty`) and
  exposes a turnkey `/agent-binding` (below). **This was the missing piece;
  before it, the bound tool calls 401'd.**

**Model A — loop literally runs inside the box.** Only the aidream box can do
this (it bakes the full aidream FastAPI; `mtx aidream serve`). The slim box has
no agent loop and would need a new minimal runner. **Not built, and the stated
use cases don't require it** — it's only justified for autonomous/disconnected
operation. Don't build it speculatively. (If we ever want it for the aidream
box: point a conversation at the in-box aidream on `:8001`; it reads the same
Supabase, so it can pull the conversation and run the loop locally.)

---

## The frontend flow (Model B) — what makes it actually work

Three calls, all to the orchestrator (tier-routed as today):

```
1. POST /sandboxes/claim           { user_id, template:"slim", ttl_seconds }
   -> { sandbox_id, ... }          # ~0.5s from the warm pool; memory hydrated in

2. POST /sandboxes/{id}/agent-binding   {}        (master key / admin)
   -> { sandbox_id, base_url, access_token, root_path, expires_at }
      # exactly the shape AI Dream's active_sandbox expects

3. Send the chat turn to AI Dream WITH that object as the `sandbox` field:
      POST {aidream}/ai/conversations/{conversation_id}
      { user_input: "...", sandbox: { sandbox_id, base_url, access_token, root_path } }
```

From call 3 onward, the agent's tools run in the box. Verified live: with the
binding's token, `POST /sandboxes/{id}/exec` returns 200 and runs as the
`agent` user inside the container; `GET /sandboxes/{id}/fs/list` works; a token
minted for a different sandbox is rejected (401).

For the **aidream box**, the flow is identical — claim with `template:"aidream"`
instead of `"slim"`. (The aidream box also has the option of running the loop
in-box per Model A, but the binding path above works the same and is simpler.)

Memory needs nothing extra here — the orchestrator already hydrates the user's
`.matrx/memory/` into the box on claim/create (see MEMORY_API.md).

---

## Operator action 1 — enable the AI Dream files bridge (for "files copied in")

Needed for the cloud-files flow ("user has a bunch of PDFs/images, they get
copied in, the agent works on them") and `mtx files`. **Not** needed for the
agent's tools or memory (those are orchestrator-mediated and already live).

State today: the orchestrator side is fully configured (`MATRX_AIDREAM_URL` +
`MATRX_AIDREAM_SERVICE_TOKEN` are set). The endpoints exist on the AI Dream
side but return 503 until **one token is set on AI Dream production**:

```
# On AI Dream PRODUCTION's environment, set this to the SAME value already in
# the orchestrator's MATRX_AIDREAM_SERVICE_TOKEN, then redeploy:
AIDREAM_SANDBOX_SERVICE_TOKEN=<that value>
# verify:
curl https://server.app.matrxserver.com/api/cloud-files/integrations.aidream
#   -> {"configured": true, ...}
```

That's the only blocker for the bridge; everything else (sandbox client,
sync scripts, watcher, endpoints) is built and waiting.

---

## Operator action 2 — make EC2 launches actually fast (warm instances)

The warm-pool controller warms *containers* on whatever host the orchestrator
runs on. On this server that's the whole story. **On EC2**, the dominant launch
cost is instance boot + image pull, which the controller can't remove. To get
chat-speed claims on EC2:

- Keep 1–2 EC2 instances running with `matrx-sandbox:slim` **already resident**
  (CI now builds + pushes `:slim` to ECR and the SSM deploy pulls + tags it;
  baking it into the AMI removes even the pull).
- Set `MATRX_WARM_POOL_SIZE=2` on the EC2 orchestrator so it keeps 2 warm
  containers ready on each warm instance.

Nothing in the orchestrator code needs to change for EC2 — claim/replenish is
identical. This is purely an AWS provisioning step (instance + image presence).

---

## What's verified live vs. pending

| Piece | State |
|---|---|
| Instant box (warm pool, claim ~0.5s) | ✅ live (hosted) |
| Memory hydrated into the box on claim/create | ✅ live |
| Agent tools (fs/exec/git/...) reach the box via scoped token | ✅ live + verified |
| `/agent-binding` turnkey handoff object | ✅ live + verified |
| aidream `active_sandbox` binding + chat `sandbox` field | ✅ present in aidream |
| Frontend: claim → agent-binding → attach to chat | ⏳ frontend PR (their Vercel deploy) |
| AI Dream files bridge (PDFs/images in) | ⏳ operator action 1 |
| EC2 chat-speed | ⏳ operator action 2 |
| In-box loop (Model A, aidream box only) | not built; not required |
