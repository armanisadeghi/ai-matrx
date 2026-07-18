---
status: active
updated: 2026-07-18
repos: [matrx-frontend, aidream, common-docs]
vision: [/Users/armanisadeghi/code/common-docs/content-ir-system/FEATURE.md, /Users/armanisadeghi/code/common-docs/content-ir-system/OWNER_BRIEF.md]
---

# Content IR / Shape System — complete state + what remains

The cross-repo system-of-record (evidence, counts, acceptance criteria) is `common-docs/content-ir-system/FEATURE.md`. THIS doc is the working handoff: Arman's vision, exactly where we are, and what's next.

## Vision — Arman's words (verbatim, ratified 2026-07-15 → 2026-07-18)

- **What this system IS:** "It's important that you understand THE ONLY reason we have built all of this content_ir stuff is so that users can create whatever they want for inputs, outputs, streaming, tools, workflows, and more and have it all instantly render for them in react, our extension, matrx local, and our soon to come mobile app. **THIS IS the system. It's not a feature, it is it!**"
- **The north star (NOW LIVE):** "The true value of these kinds can only be realized when we have it FULLY AVAILABLE for users, not for me and the admins. When we can have OUR agent we create that will do this for a user, then we will have massive adoption: 1. Create the kind based on the user's data. 2. Create the custom component for the user. 3. Create the agent skills and render blocks for the user. 4. Then, the user can test it out and the real magic is when the user sees a COMPLETELY customized, beautiful component that they designed with an agent."
- **Unification endgame:** "the goal is to eventually **eliminate tools components** because their results are nothing more than a `__kind` so then we don't need tool components and all of that." (kind components subsume `tool.ui` renderers; the kindcomp toolset is the successor.)
- **Component trust model:** "absolutely must be SUPER open so we need to do allowlist and **massively expand our allow list**. This is literally what our app does so we can't limit the user, we need to make our safety systems better when we get users fully on it." Iframes are ALSO supported "for a totally different reason… html/js and giving users even more options" — an option, never a trust tier.
- **Tables / the Convert Pattern:** "tables need to stay exactly as they are… markdown core content… but there is a button to convert. Not only do we want to keep this but this is a **CRITICAL pattern to document, appreciate and adopt**. Some items simply don't start and instantly be the `__kind` but you **click to convert**!"
- **Production agents:** "I can't roll out a system that is only partially created… we would never 'auto-list' a tool like that for all agents… 95% of our calls are designed to be highly deterministic and with small models." Agent rollout comes LAST, "and the agents part will be easy."
- **Workflows:** "I also want to actually launch workflows but I won't put any time into that system until I'm certain that the inputs and outputs for all fully and properly use the system and there is nothing left to do."
- **Enforcement:** tools first ("it's easy to test and fix"); every kind gets an example; the 6 gated inactive roots are test kinds.

## Current state (2026-07-18, all verified live)

**The user loop is LIVE, end-to-end browser-verified, and first-try-polished:**
- `/shapes` (list, creator-scoped "Your shapes" + platform library) → `/shapes/new` (intent + sample → chat handoff) → conversation with **`kind_creator`** (`4f4ffd49-db15-4a2e-b9fe-341ffafc1323`, prompt v2, 13 authz-hardened tools) → kind + `source='db'` component + skill + content block created → `/shapes/[kind]` Preview / **Test** (form → live render of the user's data through their own component).
- **Demo left for Arman:** `/shapes/wine_tasting` + `/shapes/wine_tasting/test`; the conversation that built it: `/chat/4ec4285e-c9ba-4b92-9727-73d6dcffd170`.
- First-try polish shipped: props contract taught + write-time lint (flat-props refused), input row seeded at `kind_create`, fielded Test form for flat samples (all-or-nothing honesty), `props_transform` semantics documented, agent guidance points back to /shapes.

**Platform layer (Waves 0–1, all adversarially reviewed):** 786-item vocabulary crosswalk (0 unclassified) + coverage gates; KindSchema expressivity (json-any, unions, open objects, roots); A3 machinery live-but-OFF (versioned kind refs, admission gate `enforce=false`, derived-on-write example validation via pg_jsonschema, `MATRX_KINDS_ENFORCE_*` env flags, non-retryable contract violations, admission at run AND resume); 22/22 live workflow definitions canonical; envelope parity all families; generated detector bootstraps both runtimes; BlockRenderer = declarative crosswalk-mirrored dispatch registry; guidance kits for all six gated roots; every kind has a passing canonical example (~725 passed / 0 failed).

**Integration layer (Wave 3 + K-wave):** builder "Bind to a kind" picker; education renders kind-aware; Shapes chips in Quickset + "Convert to…" message action (canonical dialog, manual-only per ruling); schema_proposal → "Create a Shape" (warnings acknowledged, rollback, 12-kind cap); `source='db'` components render via the massively-expanded allowlist (+ html iframe flavor), refresh-on-view staleness contract; D2 workflow envelope handoff (elided-on-wire, Studio trusted path); D3 artifacts (unbind, registry-driven edit, notes materialization); agent-input bridge (typed schemas, wire-compatible); admin kind-registry rebuilt on canonical MatrxDataTable.

**Key invariants to never violate:** table never auto-kinds (click-to-convert); production agents untouched until 100% complete; user kinds are private-by-default, RLS/`iam.has_access_for` is the ONE authz truth (tools delegate to it); `generic_structured` is the only routable input key today; DB components receive the payload as `props.data`.

## Resources

- Studio: `features/content-ir/studio/` (+ `app/(core)/shapes/`); creator agent constant: `studio/constants.ts#SHAPE_CREATOR_AGENT_ID`.
- DB components: `features/content-ir/react/db-component/` + SHAPE_SYSTEM.md § "DB kind components" (props contract, flavors, staleness contract); shared compiler/allowlist: `features/agent-apps/utils/{compile-slot,allowed-imports}.ts`.
- Creator toolset: aidream `packages/matrx-ai/matrx_ai/tools/implementations/{kind_shared,kind_authoring,kind_component}.py`; agent spec `internal_agents/kind_creator.md`; E2E: `matrx_ai/tools/tests/run_kind_tools_e2e.py`.
- Component versioning/incidents: `content_ir.kind_component_version` view + `kind_component_incident` (kc_001).
- Enforcement: aidream `docs/workflow/KINDS_ROLLOUT.md` (flags, escalation matrix, B5 status); admission: `content_ir.admission_config`.
- Coverage: `pnpm check:shapes` / `check:shapes:crosswalk` / `check:content-ir:strict`; board `/administration/kind-registry`.
- Test login: dev-login per CLAUDE.md; metrics caveat: count `__kind` via `strpos`, never `LIKE '%__kind%'`.

## Remaining work (ranked)

1. **Deploy aidream to prod** (`bash scripts/release.sh` — Arman or a session with the permission; also in `.matrx/ARMAN_TASKS.md` item 0). Everything server-side is on `main` but inert in prod: kind_creator + toolset, envelope producer, typed agent projections, tool stamping, enforcement machinery (OFF). **After deploy:** read `tool_io` drift logs for a few days → flip `MATRX_KINDS_ENFORCE_TOOL_IO` first per the ratified tools-first order → then the other families as their logs come clean → then delete the hand-coded detector literals (gated on the flip). Post-soak: drop `content_ir._backup_*` tables + the two `matrx_orm.yaml` exclude lines.
2. **FE incident reporter** — render errors from db components currently scream to the error store but do NOT write `content_ir.kind_component_incident` rows, so the agent's `kindcomp_get_context`/`resolve_incident` loop never sees real crashes. Wire the DbKindComponent error boundary to insert incidents (org-scoped, RLS-gated). This closes the self-healing loop the toolset was built for.
3. **Richer input components** — `generic_structured` is the only input key; the fielded form covers flat schemas only. Next: nested-object form support in the bridge, then dedicated input components as a kind_component role='input' ecosystem (users will want custom input UIs too — same db-component machinery).
4. **tool_ui subsumption** (the ratified endgame) — migrate tool renderers onto kind components: tool results are already `tool_io_*` kinds; plan = point tool result rendering through `resolveComponent`, port `tool.ui` rows to `kind_component`, retire `DbToolRenderer`. Design first; touches tool-call-visualization + workflow-emit.
5. **Agent bulk-bind** — the 578 variable-carrying agents onto kind-bound contracts once the W3-A bridge has soaked in prod (blocked on item 1's deploy).
6. **Cross-platform bindings** — extension / matrx-local / mobile renderers for kinds (the vision names all four surfaces; only web + workflow-studio Vite exist today). React Native bindings = D4's remaining half.
7. **Workflow launch** — gated on Arman's bar: every workflow input/output fully on the system with "nothing left to do." Dynamic contract publisher for `io.user_input` (P9) is the known gap. E1 (unified TurnAssembler pipeline) remains its own campaign, last by design.
8. **Small known items:** FOUND_DEFECTS D60 residual (launch-variable agents don't surface stashed drafts — plain agents fixed); education convert-dialog branding when opened from general chat (latent UX note); `item_presentation` Python detector gap (shrink-only ratchet); 2 pre-existing `system_instruction_persist_roundtrip` failures in aidream (spawned task).

## Streaming + loading + persistence (Arman, 2026-07-18 morning — vision addendum)

- **BUG (active):** MarkdownStream does not recognize db-component kinds during the stream — "It starts to show something, but then it just shows as JSON." Streaming recognition of cloud kinds must work "all across the system for streaming content everywhere."
- **Eager lightweight fetch (verbatim intent):** "the moment a 'cloud kind' is recognized, it triggers a direct lightweight fetch of the core component and loading component, along with only any validation or things it needs for rendering. We cannot bloat the fetch with additional things that aren't needed for rendering."
- **Hardcoded loading-component library:** ~20 customizable loading components permanently in the codebase (zero fetch delay), selectable per kind. Powered by **early-emitted keys in the `__kind` payload** — a default key set like `title`, `description`, `loading_message`, `loading_subtext` (+ a few more) emitted FIRST so the loading state renders meaningful content live while the rest streams. Kinds that can't render mid-stream get an optional custom loading component instead of a dead skeleton.
- **User-kind persistence (to discuss, then build):** how user-defined kinds attain persistence and the rest of the platform kit — "users have plenty of places where they can have custom data shapes, especially udt datasets (highly flexible and fully customizable user tables)." Map what the artifact/materialization system already gives kinds vs what user kinds are missing; connect kinds ↔ udt datasets.

## Done (compact — details in FEATURE docs + git)

- North-star loop live + verified + polished (see Current state) — waves K1–K5 + P0/P2 passes, 2026-07-18.
- Waves 0–1 (adapter spine, contracts, enforcement machinery, coverage, detection, dispatch, guidance) — 2026-07-15.
- Wave 3 (inputs D1, workflow handoff D2, artifacts D3, agent-input bridge) + integration lanes B/C/D — 2026-07-15→17.
- Every lane adversarially reviewed; all findings fixed (incl. the K2 authz hardening: reads viewer-gated, writes via live `iam.has_access_for`, incident payloads editor-only).

## Decisions needed

None open. All rulings recorded above and in agent memory; the only owner ACTION is the deploy (Remaining #1).
