---
status: active
updated: 2026-07-18
repos: [matrx-frontend, aidream, common-docs]
vision: [/Users/armanisadeghi/code/common-docs/systems/content-ir-system/FEATURE.md, /Users/armanisadeghi/code/common-docs/systems/content-ir-system/OWNER_BRIEF.md]
---

# Content IR / Shape System — work order for continuing agents

The system-of-record (evidence, counts, acceptance) is `common-docs/systems/content-ir-system/FEATURE.md`. THIS doc is the working handoff. **Read the Vision section before touching anything** — it is the ground truth and outranks every summary, including this one.

## Vision — Arman's words (verbatim; never paraphrase these into agent-speak)

- **What this system IS:** "THE ONLY reason we have built all of this content_ir stuff is so that users can create whatever they want for inputs, outputs, streaming, tools, workflows, and more and have it all instantly render for them in react, our extension, matrx local, and our soon to come mobile app. **THIS IS the system. It's not a feature, it is it!**"
- **The north star (LIVE):** "1. Create the kind based on the user's data. 2. Create the custom component for the user. 3. Create the agent skills and render blocks for the user. 4. Then, the user can test it out and the real magic is when the user sees a COMPLETELY customized, beautiful component that they designed with an agent."
- **Unification endgame:** "eventually **eliminate tools components** because their results are nothing more than a `__kind`."
- **Component trust:** "absolutely must be SUPER open… allowlist and massively expand our allow list… we make our safety systems better when we get users fully on it." Iframes = a user html/js OPTION, never a trust tier.
- **The Convert Pattern:** "Some items simply don't start and instantly be the `__kind` but you **click to convert**!" Tables stay markdown-first forever.
- **Production agents:** untouched until the system is 100% complete; never auto-list skills ("95% of our calls are… highly deterministic and with small models"). Rollout to agents comes LAST.
- **Workflows:** no investment "until I'm certain that the inputs and outputs for all fully and properly use the system and there is nothing left to do."
- **Persistence ruling:** dedicated canonical tables ("built solid from the ground up… powerful… that makes it EASIER, not over-engineering"), respecting every platform base/canonical system.

## Current state (2026-07-18 EOD — everything below is LIVE, adversarially reviewed, findings fixed)

- **The full user loop:** `/shapes` → `/shapes/new` → chat with `kind_creator` (`4f4ffd49-db15-4a2e-b9fe-341ffafc1323`, v4, 18 authz-hardened tools) → kind + db component + skill + content block → Preview/Test → **Save → Instances tab** (edit, repin, permalink, save-from-chat, view-as-table for flat kinds). Demo: `/shapes/wine_tasting` (+`/test`, `/instances`), conversation `/chat/4ec4285e-c9ba-4b92-9727-73d6dcffd170`.
- **Streaming:** cloud kinds render mid-stream everywhere (kernel preserves kind through schema races; eager render-essential fetch; per-kind granular repaint; 20-component loading library selected via `kind_definition.metadata.loading_component`; early-key contract `title/description/loading_message/loading_subtext/icon/count`). Registered kinds upgrade to components; example `__kind` payloads stay readable JSON.
- **Persistence:** `content_ir.kind_instance` — `iam.verify_canonical` 0 FAIL / 0 WARN; pinned versions; derived-on-write verdicts; fresh-version pinning at save; title derivation (explicit → `metadata.title_key` → shared list, mirrored both repos); reserved-slug guards both repos.
- **Platform + integration layers:** see the system-of-record. Enforcement machinery complete, all flags OFF. React Compiler re-enabled with A/B proof (D62 closed).
- **Key invariants:** table never auto-kinds · production agents untouched · RLS/`iam.has_access_for` is the ONE authz truth (tools delegate, never replicate) · `generic_structured` = only routable input key · db components receive payload as `props.data` · derived verdicts are never trusted from writers · **BlockRenderer's explicit `useMemo` on `(rawBlock, kindRouteVersion)` is LOAD-BEARING for streaming repaint — do not remove it in any "compiler is on, drop manual memoization" sweep; its version dep is the repaint mechanism.**

## Working discipline (how this effort has run — keep it)

Every lane: build → independent adversarial review agent (goal: REFUTE the claims) → fix findings → commit. Verify against the LIVE DB with SELECTs, never trust reports. Browser-verify user-visible work with real streams (dev-login per CLAUDE.md; never fake verification). Twin-bound files (`features/content-ir/core|convert/**`) change only with the sync ceremony (aidream `sync_content_ir_core.py` + check green, both repos committed). Idempotent ledgered migrations via Supabase MCP; watch the version-bump/example-stranding trap on any `kind_definition` UPDATE (revalidate after). Count `__kind` via `strpos`, never `LIKE '%__kind%'`.

## Remaining work — safely delegable to any competent agent

1. **Deploy aidream → drift → flips (owner-gated start, then mechanical).** After Arman runs `bash scripts/release.sh`: verify prod (creator agent live, tool stamping, envelope producer), let traffic soak, read `tool_io` drift logs (`degraded_reason=` tokens + `output kind … DEGRADED`), fix screamers, then flip `MATRX_KINDS_ENFORCE_TOOL_IO`, then remaining families as logs come clean, then delete the hand-coded detector literals (gated on the flip). Post-soak: drop `content_ir._backup_*` + the two `matrx_orm.yaml` exclude lines.
2. **FE incident reporter.** DbKindComponent's error boundary screams to the error store but never writes `content_ir.kind_component_incident` rows — the agent's `resolve_incident` loop is blind to real crashes. Wire the boundary (and the html-flavor frame's error channel) to insert incidents via the browser client (RLS-gated, org-scoped, dedup per the tool_component pattern). Include the crashing `data_snapshot`. This closes the self-healing loop.
3. **Creator-agent conversational polish.** Run fresh full-loop browser passes as a naive user; every rough edge in the agent's flow (confusing replies, missed tool opportunities, guidance gaps) → prompt/spec/tool-docstring fixes via the factory path (version-bump). The E2E script (`run_kind_tools_e2e.py`) guards regressions.
4. **Loading-component adoption sweep.** Teach `kind_creator` to set `metadata.loading_component` + emit early keys in its skills' guidance (the contract is in SHAPE_SYSTEM.md); set sensible loading components on the ~19 active platform display kinds (data-only, ledgered).
5. **Richer fielded inputs.** Extend the flat-schema fielded form to nested objects (the bridge + `fields_from_json_schema` both sides, all-or-nothing honesty per level); dedicated input-role components ride the same db-component machinery when needed (lift the `generic_structured`-only restriction carefully — FE routing + docs + agent guidance together).
6. **Cross-platform loading/render parity groundwork.** The extension (`matrx-extend`) and matrx-local consume stream-events already; inventory what they'd need to render kinds (the vision names all four surfaces). Scoping/report first — implementation is likely its own campaign.
7. **Instances polish riders:** collection view beyond per-kind (a "/shapes/instances" all-my-instances index); live-exercise view-as-table with a fielded kind; org/sharing UX for instances (grants exist via the canonical registry — no UI yet).

## Bigger-thinking items — WAIT for Arman + a heavyweight session (do not start casually)

- **tool_ui subsumption** (the ratified endgame): migrating tool renderers onto kind components touches tool-call-visualization, workflow-emit, agent-apps, and the tool schema. Needs a design pass and Arman's sequencing call.
- **Agent bulk-bind** (578 variable-carrying agents → kind contracts): gated on prod soak of the W3-A bridge + Arman's "system is 100%" bar — this IS the production-agent rollout he deliberately holds.
- **Workflow launch + dynamic contract publisher (P9)** — gated on Arman's "nothing left to do" bar for workflow I/O.
- **E1 — unified TurnAssembler / parallel-pipeline retirement** (`common-docs/projects/unified-content-pipeline/FEATURE.md`): deliberately last, consumes stabilized contracts.
- **Sandbox/safety hardening for shared user components**: Arman ratified open-allowlist now, "make our safety systems better when we get users fully on it" — the *when and how* is his call.

## Done (compact — git + FEATURE docs hold the detail)

- 2026-07-15: Waves 0–1 (spine, 634 contracts, enforcement machinery OFF, coverage, generated detection, dispatch registry, guidance, B5, envelope parity).
- 2026-07-15→17: Wave 3 + integration lanes (D1 inputs, D2 studio handoff, D3 artifacts, agent-input bridge, builder picker, education kind-aware, chips + convert, candidates + Convert Pattern doctrine, registry admin rebuild, nested examples).
- 2026-07-18: North-star user loop (K1–K5 + polish); streaming kinds + loading library; `kind_instance` persistence (P-1/P-2 + title-key + guards). All adversarially reviewed.

## Decisions needed

None open. The only owner ACTION is the aidream deploy (Remaining #1). Rulings live in the Vision section + agent memory.
