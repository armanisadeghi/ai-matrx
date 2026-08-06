---
status: active
updated: 2026-08-06
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/code/common-docs/projects/google-oauth-verification/PLAN.md]
---

# First-party Google product build — Connected Accounts, Picker + drive.file tools, reviewed gmail.send

The build that makes Google verification submittable: PLAN execution steps 5–9. First-party
only — Arman's ruling 2026-08-06: no Composio/aggregator ("it takes away my drive to get
this done the right way").

## Vision — Arman's words

> "Ideally, we can set these things up so that our users can do some authentication process
> and then have full mcp access to their own stuff from the agents they create and use in
> our system and they can do it without any issues." … "The key is that you need to keep in
> mind we want to do this in a way that ALL users will be able to use it, not just me."

Ground truth for scope strategy, reviewer wording, and gating:
[`common-docs/projects/google-oauth-verification/PLAN.md`](https://github.com/AI-Matrix-Engine/matrx-common-docs/blob/main/projects/google-oauth-verification/PLAN.md).
Strategy summary (do not re-litigate): `drive.file` + Google Picker for user-selected
Docs/Sheets (non-sensitive, no security assessment); `gmail.send` with explicit user review
of recipient/subject/body (sensitive, ordinary verification); NO restricted scopes
(`gmail.readonly/modify`, full `drive`) in this campaign. MCP is a later transport for
these same tools, not part of this build (Google's Workspace MCP servers are Developer
Preview and still require our own verified OAuth client — they change nothing about
verification).

## Resources

- Working OAuth loop to build ON (do not fork): `features/marketing/google/`
  (service/hooks/types, has tests) → aidream `aidream/services/google_integrations/`
  (exchange, vault, refresh — see its FEATURE.md; `refresh_connection_access_token()` is
  the server-side access-token primitive; tokens NEVER reach the browser).
- Connect UI exemplar to generalize: `features/marketing/components/integrations/MarketingConnectionsWorkspace.tsx`.
- Scope source of truth: the registries from `docs/handoffs/google-scope-registry.md`
  (do that handoff first or in the same effort).
- Agent tool patterns in aidream: `aidream/tools/` + tool registration via
  `tool.definition`; injection funnel `aidream/services/tooling/tool_merge.py` (nothing
  there needs changing). Tool output contract + size caps: matrx-ai
  `TOOL_OUTPUT_VALIDATION_GATE.md`, `TOOL_RESULT_SIZE_GATE.md`.
- Settings surface shell (for Connected Accounts): `features/settings/pages/IntegrationsSettingsPage.tsx`
  + `features/settings/registry.ts`.
- Test login: `/login` `admin@admin.com` / `Password1234#` (CLAUDE.md § Web Access).

## Remaining work (order matters)

1. **Connected Accounts surface** — ONE supported entry point for Google (and later Bing,
   MCP). Promote the Google connection UI out of `features/marketing/` into a
   `Connected Accounts` settings tab/page reusing the IntegrationsSettingsPage shell;
   marketing pages keep consuming the same hooks. Show per-account: granted scopes,
   health, resources, disconnect. (PLAN step 5 second half.)
2. **Google Picker + `drive.file`** — add the Picker flow (user selects a Doc/Sheet; we
   store only file id + safe metadata — decide storage: a `users.integration_connection_resources`
   row type is the natural home). Gate the new scope request behind the internal test
   gate (PLAN: "Gate unfinished/new-scope features to Arman's test account").
3. **aidream Docs/Sheets tools** — new agent tools (e.g. `google_docs`, `google_sheets`)
   with `action` discriminated-union dispatch (read / update; Sheets: read_range /
   write_range / append) operating ONLY on user-selected file ids, resolving credentials
   via `refresh_connection_access_token`. Register per the mcp-tool-creation /
   tool-definition conventions; results self-capped. NO Drive listing/search tools —
   that's the restricted-scope trap.
4. **Reviewed `gmail.send`** — agent drafts; a review UI shows editable recipient/subject/
   body; only an explicit user approval triggers aidream to send exactly that message via
   a `gmail_send_reviewed` tool. Client-delegated tool suspend/resume (the durable
   `cx_tl_call` 'delegated' ledger) is the right mechanic for "agent waits for user
   approval" — never an in-memory wait.
5. **Demo/test page** — a simple internal page (route per new-route conventions, admin or
   test-gated) exercising the whole chain: connect → pick a Doc → agent edits it → pick a
   Sheet → agent writes a cell → draft + approve an email. This is the harness Arman uses
   with his multiple Google accounts, and it becomes the reviewer-video script. Register
   it in `agent.review_queue`.
6. **Privacy policy Google User Data section + reviewer package** (PLAN "Identity and
   policy" + "Reviewer package" checklists): once 1–5 work, freeze the sensitive-scope
   set, record the video, fresh-account test, submit. The submission click is Arman's.
7. Groom: tick PLAN steps 5–9 in common-docs as they land; when all done, **delete this
   handoff** and log in the affected FEATURE.mds.

## Known traps

- Granular consent: users can approve some scopes and deny others — every feature checks
  its own scope grant (`metadata.granted_scopes`) and degrades with a clear re-consent
  prompt, never a crash.
- `drive.file` access is per-file-per-app: a file is reachable only after the user picked
  it through OUR Picker with OUR client id. Picker must run with the same OAuth client as
  the connection.
- Old connections hold legacy broad grants — never rely on them; the feature must work
  from a fresh minimal-scope connect.
- Do not build a second token path, a second connection table, or a Next.js proxy hop —
  browser ↔ aidream directly, per both repos' data-flow doctrine.

## Decisions needed (Arman)

- **Situation:** Docs/Sheets editing via `drive.file` covers files the user explicitly
  picks. Some users will eventually ask "let my agent find the doc" (Drive search), which
  is restricted-scope territory with an annual security assessment (~$540–1,800/yr lab
  cost). **Decide:** confirm we defer all Drive-wide discovery until after this approval
  ships (PLAN says defer; this just makes it explicit for tool design — tools will hard-omit
  list/search).
