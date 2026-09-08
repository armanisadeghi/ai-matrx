# Mandates — client half (resolution + the user/org override surface)

**Cross-repo system-of-record: [`../../../../common-docs/systems/mandates/FEATURE.md`](../../../../common-docs/systems/mandates/FEATURE.md) (+ [`RUNTIME.md`](../../../../common-docs/systems/mandates/RUNTIME.md)) — read it before touching mandates in ANY repo.** Admin pin management lives in `features/mandates/admin/` (`/administration/mandates`). This folder is the USER-facing half. Server half: `aidream/aidream/services/mandates/FEATURE.md`.

**Cross-repo master tracker: [`../../../../common-docs/projects/mandate-binding-surfaces/PLAN.md`](../../../../common-docs/projects/mandate-binding-surfaces/PLAN.md).** Wave 0–4 core work is DONE (2026-08-22); the Mandate workspace shipped 2026-08-26 (below).

## THE 2026-08-26 REWORK — Arman's vision is the definition of done

> "A mandate simply allows us to provide an agent in a dynamic way so that it's not hard
> coded. It connects available state values to be mapped to inputs and context on the
> agent. Most importantly, it defines the exact goal the agent must meet and a highly
> specific output format acceptable for that mandate. Organizations and users override our
> system agents with their own; we even give them a copy of ours to modify."

A mandate is **the server-side equivalent of a surface** — the Provision offers values the
way a surface does; the binding maps them onto the Holder. The rules, all live:

1. **No novels on pages.** Sections state facts; the data talks.
2. **The list is the canonical entity-list shell** (`browse/` — 3 layouts, server
   sort/filter, facet chips, `urlState`). A feature door lands as a REAL select facet.
3. **ONE core, three hosts**: `workspace/MandateWorkspace` renders on
   `/mandates/[mandateKey]` (key OR uuid), on the ADMIN twin
   `/administration/mandates/[mandateKey]`, and inside `MandateWindow`'s Yours
   pane. Named deliberate divergences only: the window's scope list + Admin pane, the
   admin route's header offset, and the `authoring` rule in rule 8.
4. **Tabs separate concerns:** Definition (goal, inputs, output), Holder (selection, matching, preliminary checks), Overrides, Display Options, Test, Permissions, Diagnostics and Notes. Test and Diagnostics remain admin-only.
5. **Keep draft owners mounted across tabs.** One binding save owns holder/mapping/execution overrides; one treatment save owns shared presentation/execution seeds/write policies. Goal, draft inputs and context gating retain their immediate-save paths. `ConfigurationFields` supplies labeled values, explicit state and accessible help. Full validation remains not evaluated until exact-version-and-mapping evidence exists.
6. **Version binding is first-class**: latest (auto-updates, risks breaks) or pin
   (`agent_version_id`); pinned-and-behind MUST show drift. The bind endpoint always
   accepted the version triple — only this surface used to forbid it.
7. **This page is PERSONAL.** Org editing lives at
   `/organizations/[orgId]/settings/mandates` (org fixed by the route, admin/owner gated —
   the server's `is_org_admin` 403 is the authority).
8. 🚨 **MANDATE MANAGEMENT IS ADMIN-SIDE (Arman, 2026-08-29).** The user route is
   **browse/view + their own override**, and nothing else. Editing the GOAL, editing the
   declared INPUTS, RUN THIS JOB and CREATING a mandate exist only on the admin route —
   `MandateWorkspace` gates them on `host === "admin-route"` (`authoring`), creation moved
   to `/administration/mandates/new`, and `/mandates/new` is gone. This is
   WHERE, not who: the server's `POST /mandates`, `PATCH /mandates/{key}/goal` and
   `/draft-inputs` are `require_super_admin` (aidream `304fe1848`), so an ungated pencil on
   the user route was a 403 waiting to happen. The admin console
   (`features/mandates/admin/`) is now the LIST only — its row click, coverage board,
   drift strip, right-click menu and `?mandate=` all land on the admin workspace page, and
   its old side-panel drawer (`MandateDetailPanel`) is off every default path; it still
   renders the operational depth, inside that page's Test, Overrides and Diagnostics tabs.

## What lives here

| File                                           | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract.ts`                                  | The Mandate CONTRACT as a leaf module — `parseMandateContract`, `missingRequiredVariables`, `missingVariablesMessage`, `MandateContract`. Required variables are a RUN-time precondition on the caller, not only a bind-time check on the agent (see the section below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `service.ts`                                   | `resolveMandate(mandateKey)` — client-side resolution for mandates whose consumer runs in this repo. **Authenticates before reading `mandate.definition` or consulting cache**; the 5-minute cache is user-scoped, so auth hydration and account switches cannot issue guest reads or reuse another caller's binding. Walks **system → org → user** (user config merges over org per key — the server's rule). Floating-only; loud on unknown/disabled/version-pinned mandates **and on a binding whose Holder is not an agent** (THE HOLDER GATE below). `invalidateMandateCache` + `onMandateCacheInvalidated` refresh mounted consumers.                                                                                                 |
| `service.server.ts`                            | `resolveMandateServer(mandateKey)` — the SSR twin for Server Components that must know a mandate's agent before first paint (`/chat/new`, the cx-chat demo pages). Same precedence + loud posture (holder gate included), request-scoped (no cache). Shares the `config_overrides` narrowing with the client via `llm-params.ts` and the holder gate via `provision-shapes.ts` so the two can never drift.                                                                                                                                                                                                                                                                                                                                  |
| `useMandate.ts`                                | React hook over `resolveMandate` — `error` set means the consumer disables its affordance; never a hardcoded fallback id. Re-resolves automatically on cache invalidation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `mandate-key.ts`                               | `splitMandateKey` — the ONE lossless parser for canonical `<feature>.<mandate>` keys. Splits only the first dot, preserves later dots, and keeps legacy dotless keys visible as `(unscoped)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `service.ts` → `fetchMandatePins(mandateKeys)` | Batch read of mandates' SYSTEM DEFAULT pins (master + pinned version + use_latest) for display/fork surfaces — NOT a run path, so version pins are fine here and no binding layer applies. Consumer: research's `useResearchAgentRoles` (the agent-roles page reads DB-truth pins instead of the hardcoded UUID maps that drifted on all 7 roles).                                                                                                                                                                                                                                                                                                                                                                                          |
| `overrides.ts`                                 | The override surface's data layer. READS ride RLS (fetch mandates + visible bindings + referenced agent names; `fetchMandatePickerData` for one mandate). **WRITES ride the ONE bind path: aidream `PUT/DELETE /mandates/{mandate_key}/binding`** (`putMandateBinding` / `removeMandateBinding` via `callApi`; org principals bind both `scopeOverrides.organization_id` and the body to the target org, user principals let callApi inject the ambient org — incidental there). `parseMandateContract` + `checkMandateContract` (the research-proven superset rule) are the instant client pre-flight; the server's bind-time check is the authority and its 422 detail is shown VERBATIM. Writes invalidate the resolution cache.         |
| `useMandateSet.ts`                             | **The set primitive** — resolve a SET of keys for one surface (a chip row, a mode strip) in ONE pass: parallel `resolveMandate` per key, per-key `MandateState`, invalidation-aware. A key that cannot resolve reports `error` for that key only; the others stay usable. Deliberately unassigned `optionalKeys` still refuse without emitting `console.error` into `system_error`. Set `enabled: false` when the owning affordance is not mounted; the hook then makes no requests and returns an empty set, so “not asked” can never masquerade as an unfulfilled Holder. Consumers: `/chat/new` quick-action chips (`NewChatGreeting`), the response-mode strip (`useResponseModeAgents`), and the demand-gated Messaging intelligences. |
| `notes.ts`                                     | **Notes & observations on a mandate** — `fetchMandateNotes` / `fetchMandateNotesFor` (batched, for a list) / `createMandateNote` / `deleteMandateNote` over `agent.mandate_note`. A note follows the JOB, never the pin: `mandate_id` + text + author + time, with `surface_name` and `observed_agent_id` recorded ALONGSIDE as context. Writes carry an EXPLICIT `organization_id` (`ensureOrgId`). Notes are never fed to an agent implicitly.                                                                                                                                                                                                                                                                                            |
| `components/MandateNotesPanel.tsx`             | THE notes surface — composer (four fixed kinds: observation / issue / idea / praise; Cmd+Enter saves) plus the history with kind, relative time, author and the surface it was written from. Composed in exactly two places: the Agents header menu's mandate row (`compact`, the moment of truth) and the admin drawer's **Notes & observations** section (review time). Never forked.                                                                                                                                                                                                                                                                                                                                                     |
| `components/MandateAgentPicker.tsx`            | The reusable consumer-facing "which agent runs this step" control — compact popover: system default + the user's own/shared agents, save-on-pick, reset-to-default, link to `/mandates`. First consumer: podcast topic ideas (`TopicIdeaHelper`, mandate `podcast_client.topic_ideas`). Drop it beside any mandate-resolved affordance.                                                                                                                                                                                                                                                                                                                                                                                                     |

| `coverage.ts` | **COVERAGE — the three-state scoreboard's client half**, shared by the admin console and both user-facing lists. Types + vocabulary (`COVERAGE_META`: Assigned / Running on fallback / Nothing assigned) and the two reads of the SAME server classification: `fetchMandateCoverage` (super-admin, counts + the NAMED orange/red rows → the console board) and `fetchMandateCoverageStates` (authenticated, ONE verdict per mandate → the per-row badge; `organizationId` scopes it to one owner and the server verifies membership). Green is SAID in the states shape, so a badge never infers it: a key ABSENT from `states` is unanswered (another owner's mandate on an org-scoped report), never assigned. Nothing here re-derives green/orange/red — that rule lives once, in aidream `services/mandates/coverage.py`. |
| `browse/CoverageBadge.tsx` | The per-row badge + its context. `coverageBadgeVerdict` is the pure rule set (met → quiet · report failed → **unknown**, never quiet · unanswered on a scoped report → `—` · orange names its LEADER · red says Unassigned), jest-pinned in `browse/__tests__/coverage-badge.test.ts`. Clicking a badge narrows the list to that state. |
| `browse/useCoverageList.tsx` | What both lists share: ONE coverage fetch, the active narrowing, the service wired to it, and `MandateCoverageNotice` (the "Showing only …" strip that owns the refetch). The narrowing sends the KEYS the server classified into `p_filters.coverage_keys` — never a second implementation of the rule in SQL. |
| `list-door.ts` | **THE one client of `public.mnd_list_scoped`** — the only place a browser asks which mandates exist. Owns the home vocabulary (`all` / `system` / `org:<id>`) written once, keeps the door's 42501 REFUSAL whole (sentence + reason, `isMandateListRefusal`) instead of flattening it into an empty list, and counts a home from the door's own `total_count` so a tab and its rows can never disagree. Callers: `browse/service.ts` (both list surfaces) and `admin/service.ts` (the console's `system` home). |
| `browse/` | **The list** — `listConfig.tsx` on the canonical entity-list shell over the `mnd_list_scoped` RPC triple (`migrations/mnd_list_scoped_one_ladder.sql`; OWNERSHIP tabs = the caller's organizations + System for an admin, RESOLUTION always the caller's in the ACTIVE org): per-caller `resolved_layer`, drift, honest DB-derived health; facets Feature / Decided by / Output kind / Status; 3 layouts; `urlState`. **The RPC reads only post-1W `mandate.definition` / `mandate.provision` / `mandate.binding`; `post-cutover-rpc.test.ts` refuses the graveyarded `agent.*` names and retired Holder columns.** `url-compat.ts` is the LOAD-BEARING legacy shim: `?feature=<domain>` redirects server-side onto the canonical `?filters=` select-filter form (jest-pinned). |
| `workspace/` | **THE core** — `MandateWorkspace` (the shared scope-parameterized tab shell), `OneBindingWorkspace` (persistent holder/mapping/override draft), `RunThisJobSection` (the run affordance — ADMIN ROUTE only since 2026-08-29 and still super-admin gated inside, Provision-driven inputs, canonical output pipeline, workflow-run door), `Section.tsx` (the shared section chrome), `useMandateWorkspaceData` (the ONE single-mandate load both hosts share; establishes authenticated browser identity before any protected read; refresh reloads ONE mandate, never the registry), `save-payload.ts` (pure, jest-pinned wipe guards: full map re-send; stored `config_overrides` survive when the settings step never opened; legacy mandates send NO map — the server 422s on `{}`). |
| `provision-shapes.ts` | LEAF module (the `contract.ts` pattern) for the Provision era: `OfferedValue` + `parseOfferedValues`, the ONE client consumption-map deserializer `parseConsumptionMap` (`surface_value` from the shared binding writer and legacy `code_value` normalize to `offered_value`), `parseMandateWave1`/`parseBindingWave1` (runtime narrowing of the wave-1 columns off `select("*")` rows — see the DB-types note below), the kind-law mirrors (`SCALAR_VALUE_KINDS`, `GENERIC_VALUE_KINDS`, `ALLOWED_PIN_KEYS`, `EXECUTABLE_HOLDER_TYPES`), the ONE holder-refusal message (`holderNotExecutableMessage`), and the `consumptionMapProblems` pre-flight — the ONE refusal voice of both binding modes on both hosts, which since V2 round 5 names every input/offered value by `displayLabelForKey` and every kind by `kindPhrase` (no raw key or slug inside a sentence; guarded by `__tests__/mandate-screen-vocabulary.test.ts`). 🚨 Its `offer` argument is NULLABLE (FIX-11): `null` means _the offer is not known here_ and silences ONLY the four sentences that must look a value up — never pass `{ values: [] }` to mean that, which claims the job offers nothing. `valueMappingsProblems` reaches the same judge for the single-source `ValueMappingMap` shape a surface/shortcut binding stores, and `assertMappingsAreAnswerable` is the throw both write seams call. Guarded by `__tests__/one-preflight-every-writer.test.ts`. |
| `provisions.ts` | Client reads of `agent.provision` — `fetchProvision` (one key) and `fetchProvisions` (the BATCHED list read: cache-aware, chunked at 100 keys, negative-caches misses) over a shared 5-min cache. A list surface resolves every key it renders in ONE call — never one request per card. Carries the ONE clearly-marked local-type widening for the table (`ProvisionRowLocal` / `Wave1Database`) — **delete it and rerun `pnpm db-types` when the CLI can authenticate**; the generated `types/database.types.ts` predates `agent.provision` and the wave-1 mandate/binding columns (live-verified 2026-08-22). |
| `components/EffectiveConfigLayers.tsx` | The truthful three-layer settings view per key: agent's own → binding overrides → mandate PINS (pins win, rendered locked "set by the mandate"). Pins are code-owned levers only (`reasoning`/`streaming`); a model id is NEVER rendered as a pin — `parseMandateWave1` refuses non-lever keys at ingress. |

## 🚨 THE HOST DECIDES THE PERSPECTIVE (Arman, 2026-09-08)

One `MandateWorkspace`, **three** questions, and a host may only ever ask ONE of
them. The perspective is derived once in `workspace/MandateWorkspace.tsx`
(`WorkspacePerspective`) and read everywhere below it — never re-decided
per-section, which is how the admin route ended up rendering the person's ladder.

| Host                                                    | mounted by                                                                    | perspective      | what it shows                                                                                                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mandates/[mandateKey]`                                | `app/(core)/mandates/[mandateKey]/page.tsx` (`host="route"`)                  | **person**       | the server verdict for THIS caller in their active org, the one ladder (`mandate.resolve`), and their own binding                                                                                    |
| the window panel, Yours pane                            | `features/window-panels/windows/mandates/MandateWindow.tsx` (`host="window"`) | **person**       | identical to the core route, in the panel's chrome                                                                                                                                                   |
| `/organizations/[orgId]/settings/mandates/[mandateKey]` | that route (`host="route"`, `principal={kind:"org"}`)                         | **organization** | what every member of THAT org gets; personal bindings excluded by construction                                                                                                                       |
| `/administration/mandates/[mandateKey]`                 | `AdminMandateWorkspacePage` (`host="admin-route"`)                            | **system**       | the job, THE SYSTEM ANSWER (the definition's default holder or the global binding), the system rung's health with the remedy inline, the binding UI pinned to the system rung, and the admin's tools |
| the window panel, Admin pane                            | `MandateWindow` → `MandateDetailView`                                         | **system**       | the same platform tools; no per-principal bindings list                                                                                                                                              |

**The system perspective's absolute rule**, in Arman's words: _"this is the Admin
panel so it should never show ANYTHING related to a user or an org … the ONLY
thing it should ever show is the things we assign from the system."_ So on that
host the workspace asks NEITHER the per-caller resolution door NOR
`mandate.resolve` — both answer _"what runs for me"_, which is not this page's
question — renders no rung selector, no precedence ribbon, and no list of who
overrode the job. Guards: `admin/__tests__/admin-route-system-perspective.test.tsx`
(rendered copy) and `admin/__tests__/system-rung-holder-refusal.test.tsx`.

### 🚨 THE SYSTEM ANSWER — three controls, and the CODE picks the record (FIX-R13/A, 2026-09-08)

On the system host the three controls of D19 (`Holder Type` · `Assigned Agent or
Workflow` · `Version`) write **the system answer**. Which of the two records
holds it is **never a question put to a person** — the reader is not asked to
choose between "the job's own default" and "a platform-wide binding", because
that distinction is storage. `features/bindings/system-answer-record.ts` is the
one place the rule lives:

| The answer names… | goes to | why |
| --- | --- | --- |
| a holder and nothing else | `mandate.definition.default_holder_*` (the bottom rung) | three columns; that is the whole answer |
| a holder **and** a mapping, settings, or an auto-run promise | `mandate.binding` at `principal_type = 'global'` | the definition has no columns for those three — writing it there would silently drop what the admin just set |
| anything, once a live global binding exists | that binding | it OUTRANKS the definition default; writing underneath it would save a row that changes nothing and report success |

`OneBindingWorkspace.writeBinding` is the **only** call site that consults it,
and `features/bindings/__tests__/system-answer-record.test.ts` counts the
deciders so a second one cannot grow. Two consequences the code depends on:

- **the admin host's rung is DERIVED, not `useState`-held** — it follows the
  data, so the page moves onto the binding the moment a save creates one;
- **every platform-wide refusal is keyed to the RECORD, not the rung**
  (`writesForEveryone`) — the super-admin check and the personal-holder refusal
  must not be skippable by standing on the bottom rung while writing a global
  row.

The record is not a secret either: `systemAnswerSaveWords()` names it on the
Save button — a label, never a paragraph.

Routes: `app/(core)/mandates/page.tsx` (list) · `app/(core)/mandates/[mandateKey]/page.tsx` (workspace, read-only triad + own override; segment accepts key or uuid) · `app/(core)/organizations/[orgId]/settings/mandates/{,[mandateKey]}` (org principal) · **admin** `app/(admin)/administration/mandates/{,[mandateKey],new}` (the list, the same workspace with `authoring` on, and creation). `browse/url-compat.ts` owns `adminMandateHref` — never hand-build the admin URL.

## The Provision era (2026-08-22) — inputs come from the PROVISION

> ✅ **The rollout is CLOSED on the server side (Wave 4, 2026-08-22).** Every declared mandate
> has an input contract: **298 declared, 0 uncovered** — 225 Provisions (7 generic-`json`-only)
> and 73 explicit waivers, from **152 Provisions**. Both server ratchets are closed. Practically,
> for this repo: **assume a mandate has a `provision_key`** — the provision-era paths below are
> the normal path now, not the new one, and `types/python-generated/provision-offers.ts` carries
> all 152 offer shapes. 🚨 **~118 client-invoked mandates are still invisible to server-side
> static analysis**, so a matrx-frontend-side census of what each `POST /mandates/{key}`
> actually sends is the outstanding cross-repo item (decision (d) in
> `/Users/armanisadeghi/code/common-docs/operations/data-to-kinds-queue.md` §6, awaiting Arman).

**A mandate carrying `provision_key` declares NO input variables of its own** — its
Provision (`agent.provision`, code-declared server-side) lists every value available at the
call site, and the BINDING's `consumption_map` decides what the bound Holder consumes and
through which channel (`variable` | `context`). SoR (rulings 2026-08-22):
`../../../../common-docs/systems/mandates/FEATURE.md`.

- **The retuned bind rule: everything consumed must be offered.** The legacy
  name-superset compare does NOT apply to provision mandates — `MandateOverrideEditor` and
  `MandateAgentPicker` skip it (the candidate still must RESOLVE); `contract-compare.ts` →
  `compareConsumptionAgainstOffer` is the provision-era compare. Legacy mandates keep
  `compareStoredContract` unchanged. The server's 422 verdict stays the authority.
- **The server REPLACES `consumption_map` with what the PUT sends** (omitted → wiped) —
  every save on a provision mandate re-sends the full current map (`putMandateBinding`
  `consumptionMap`; the picker re-sends the existing map on a quick agent swap).
- **Pins are code-owned levers only** (`reasoning`, `streaming`) — never model ids;
  precedence agent definition → binding overrides → mandate pins (pins win). Rendered once in Overrides by `EffectiveConfigLayers` in pins-only mode.
- **`pinned_context`** values are force-delivered as context — locked in the editor.
- **The input model is visible at LIST level** (`/mandates`). Every mandate with a
  `provision_key` renders a provision strip on its collapsed card — the provision key, the
  offer size (`N values offered — M guaranteed`), what the deciding binding consumes
  (`3 of 12 consumed`, or "nothing mapped yet"), the pinned-context count, and a **Map
  inputs** button that expands straight onto the Consumed values section. A **Mappable
  inputs (N)** chip beside the filter box scopes the list to jobs that have an input model.
  Mandates with no Provision render exactly as before — an absent offer is not a
  deficiency, so there is no empty state and no warning.
- **Bench**: a provision mandate's test-bench composer offers "Fill from the offer"
  (`features/mandates/admin/ProvisionOfferComposer.tsx`): the canonical `KindInputForm`
  against the derived `<provision_key>.offer` kind when it resolves, scaffolded fields from
  the offered values otherwise; the raw variables-JSON textarea stays as the escape hatch
  and the legacy path.
- **DB-types gap (temporary):** the wave-1 columns ride `select("*")` rows and are
  narrowed at ingress (`parseMandateWave1`/`parseBindingWave1`); the PUT body's
  `holder_type`/`consumption_map` ride a local extension beside the generated
  `MandateBindingRequest` until `pnpm sync-types` runs against a deployed server. Both are
  clearly marked for deletion.

## 🚨 A required variable binds the CALLER — the run REFUSES without it (disease D4)

**Arman, 2026-08-19,** on a Masterwork Conductor that fetched its Rulebook with a tool call on turn 1 and admitted it had skimmed it: _"this agent should never have even started without getting the rules in place."_

`required_variables` used to be a BIND-time check only — it verified the bound agent could RECEIVE a value while nothing verified any caller SENT one. It is now **both**:

| When         | Checks                                                        | Where                                                                                                                               |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| BIND time    | the candidate agent declares it                               | the server's 422 on `PUT /mandates/{key}/binding`; `compareStoredContract` is the client pre-flight                                 |
| **RUN time** | the caller actually supplied it — **else the launch refuses** | `contract.ts` → `missingRequiredVariables` / `assertMandateVariables`, enforced inside `launchAgentExecution`'s `mandateKey` branch |

- `contract.ts` is a LEAF module on purpose: both `service.ts` (resolution) and `overrides.ts` (the binding editor) read the same shape without an import cycle. `overrides.ts` re-exports it, so existing consumers are unchanged.
- `resolveMandate` / `resolveMandateServer` now carry `contract` on `ResolvedMandate`.
- **Blank counts as missing.** A required document that resolved to `""` is the wiring failure this exists to catch — so a genuinely empty document must render WORDS saying it is empty (reference: `features/masterwork/agent-context/rulebookDocument.ts`).
- A **spilled** variable is never counted missing: it arrives as user text. Structured content may never take that path.
- **A surface that resolves-then-launches must pre-check**, so the user sees a real refusal instead of a thrown promise — call `missingRequiredVariables(mandate.contract, vars)` and render the message from `missingVariablesMessage`. Worked reference: `features/masterwork/conduct/ConductorPanel.tsx` and `features/masterwork/components/detail/ScoutInterviewPanel.tsx`.

Law: `../../../../common-docs/systems/agents/agent-variable-binding/FEATURE.md` § THE DOCUMENT-VARIABLE COROLLARY · register: `../../../../common-docs/operations/agent-failure-diseases.md` § D4. Tests: `__tests__/document-variable-precondition.test.ts`.

## Invariants

- 🚨 **THE HOLDER GATE — the BROWSER resolver runs `agent` Holders only, and anything else
  REFUSES.** This is a limit of the client path, not of the platform: workflow Holders execute
  end to end on the server (aidream `services/mandates/workflow_holder.py` — the workflow runs
  as a child run and answers with the deliverable whose kind is the mandate's output kind). The
  browser resolver's whole job is handing `POST /agents/{id}` an agent id, so it has no channel
  to start a workflow run. Every resolver therefore checks the binding's declared `holder_type`
  against `EXECUTABLE_HOLDER_TYPES` **before applying any half of the binding** (agent swap or
  settings) and throws `holderNotExecutableMessage(...)` — naming the mandate, the layer, the
  row and the holder type, and naming the REAL reason rather than claiming the capability is
  unbuilt. Silently falling through to the system default was the live defect fixed 2026-08-27:
  the user's deliberate binding evaporated and the caller was told `provenance: "system"`.
  `parseBindingWave1` returns the DECLARED holder type verbatim (absent/blank reads as `agent`)
  plus `holderId`/`holderVersionId` — an unrecognized value must refuse, never masquerade as an
  agent. Tests: `__tests__/holder-type-resolution.test.ts`.
- 🚨 **A BINDING NAMES ONE HOLDER.** An agent binding carries `agent_id` XOR `agent_version_id`
  and no workflow identity; a workflow binding carries `holder_id` (always a
  `workflow.definition` id, NEVER a version id) with an optional `holder_version_id` pin, and no
  agent identity at all. `bindings.py` 422s on any mixture, and `buildBindingSavePayload` refuses
  before the wire. Tests: `workspace/__tests__/workflow-holder-payload.test.ts`.
- **User bindings key on the USER** (`principal_type='user'`, `subject_user_id`); `organization_id` on those rows is trigger-stamped and incidental. Org bindings pass the target org explicitly and are editable only by that org's admins/owners (RLS enforces; the UI offers org tabs only for admin/owner orgs).
- **Version pinning is the USER'S choice** (rule 6): `putMandateBinding` carries the honest triple (`agentId` XOR `agentVersionId` + `useLatest`); Step 1 offers it via the canonical `AgentVersionPicker`; pinned-and-behind renders drift. Open gap (D1): the CLIENT resolvers still refuse pins loudly — the run endpoint's `is_version` channel exists; threading it through `ResolvedMandate` is the tracked follow-up.
- **Settings overrides ride the canonical instance-overrides layer ONLY** (`instanceModelOverrides` + `RunConfigOverrides` + `selectSettingsOverridesForApi` — genuine diffs, base-equal never ships). A hand-rolled model/thinking pair is the defect the 2026-08-26 rework deleted.
- **The wholesale-replace PUT rules** (jest-pinned in `workspace/save-payload.ts`): every save re-sends the FULL `consumption_map`; `config_overrides` falls back to the STORED value when the settings step never opened; a legacy mandate sends NO map (`undefined`, never `{}`).
- Agent options come from the canonical Redux listing (`fetchAgentsListFull` + `selectOwnedAgents`/`selectSharedWithMeAgents`) — never a raw table query (ESLint `matrx/no-raw-agent-list-query`).
- **One write path.** Bindings are written ONLY through the aidream bind endpoint (`PUT/DELETE /mandates/{mandate_key}/binding`) — a supabase `.insert()/.update()` on `agent.mandate_binding` from this repo is a defect (it skips bind-time contract enforcement: required variables/context policies superset + the candidate's `output_schema` must carry the mandate's required output keys). The server is the authority; `compareStoredContract` (`contract-compare.ts`) is only the instant client pre-flight; the 422 detail is the contract verdict — surface it verbatim. Refresh the generated API types whenever the endpoint changes.
- 🚨 **A feature that owns mandates owns a DOOR to them, and the door is deep-linked.** `MandateDoorLink` emits `mandatesBrowseHref(feature)` — the canonical `?filters=` SELECT facet (strict; the neighbour-surfacing substring search retired 2026-08-26). Legacy `?feature=` links normalize server-side (`browse/url-compat.ts` — load-bearing, jest-pinned). The `<domain>` is the mandate key's first segment (`splitMandateKey().feature`). Place the door where that feature's users already are, in the pattern that surface already uses. **The door is [`MandateDoorLink`](./components/MandateDoorLink.tsx)** (`variant="icon"` for route-header chrome, `"inline"` for a body action row) — never a hand-rolled `<Link>`; a surface whose action row is icon-name-driven (`HeaderAction`) passes `icon: "BrainCircuit"` instead. `BrainCircuit` always; `Sparkles` is banned for AI.

  Live doors, one per domain: **podcast** (Studio dashboard action row, the original) · **flashcards** (`FlashcardsHome` header actions) · **education** (`StudyTodayCard` link row) · **tasks** (`TasksHeaderControls`) · **research** (`/research/topics` header) · **agent_apps** (`AgentAppsListHeader`) · **sms** (Messaging settings `SettingsLink`) · **masterwork** + **crm** (route `PageHeader`) · **workflow** (`WorkflowsListHeader`) · **transcript_studio** (`TranscriptsListHeader`) · **war_room** (`WarRoomAllView` header actions) · **notes** (`NotesView` right portal) · **seo** (`/marketing`) · **content_plan** (`ContentPlanListHeader`) · **growth_loop** (`SiteGrowthLoopWorkspace`).

  Deliberately doorless: domains that are internal plumbing with no user surface of their own (`ner`, `kg`, `observability`, `purpose`, `tool_viz`, `content_ir`, `iteration`, `hindsight`, `agent_factory`, `ambient`, `surfaces_client`, `human_decisions`, `coding_session`, `dictionary`, `web`, `tools`, `data`, `media`, `orchestras`, `prompts`, `conversation`, `vision_interview`) and domains a live door already covers by substring (`research_client` under `research`, `podcast_client` under `podcast`). `chat`, `voice`, `pdf`, `projects`, `rag`, `knowledge`, `extend` still need one — they own user-facing mandates and no door yet. Law: `../../../common-docs/policies/no-dead-ends.md`.

- 🚨 **WINDOW FIRST, ROUTE SECONDARY** (Arman's D4 ruling, 2026-08-26, reconciling handled-in-place with the dedicated route). A mandate named on a WORKING surface opens **`mandateWindow`** ([`useOpenMandateWindow`](../../overlays/openers/mandateWindow.tsx)) in place — its Yours pane IS `MandateWorkspace`. The dedicated route `/mandates/[mandateKey]` serves the browse list's name anchor, new-tab, deep links, and shared URLs. A `<Link>` to a mandate from a working surface is still a regression.
- 🚨 **THE DISCLOSURE LAW: register existing fixed jobs in the top Agents menu only.** Arman, 2026-08-25: "on any surface where an agent is actually being assigned but built into the physical UI … we also add that agent to the list of available agents at the top." Disclosure NEVER adds chips, badges, labels, cards, rows, rosters, callouts, or sections to page content; `PageAgents` is forbidden and deleted. A static fixed job declares `agentRoles[].mandateKey`; a runtime-selected fixed job uses UI-free `useDeclaredSurfaceMandates`. Only jobs this exact surface already runs appear — never family, catalog, suggested, default, public, organization, or user agents. Disclosure cannot invent an integration. Guard: `pnpm check:agent-disclosure`.

  🚨 **THE SELF-CONTEXT EXCEPTION.** A surface where you BUILD or EDIT an agent — the agent builder, this console, agent settings — discloses NOTHING: there the agent is the page's SUBJECT, and giving it context of itself is the opposite of what those pages want. The exempt paths are a readable list in the guard, never a judgement call re-made per file.

  🚨 **THE UNIVERSAL-HOST EXCEPTION.** Chat and arbitrary-agent runners declare `agentRosterMode: "universal"`: no surface roles, defaults, bindings, bound list, or Bind control. The selected agent remains functional host UI, not disclosure. A genuinely separate fixed Mandate acting on the host may register only that job.

- **A note is about the JOB, not the pin.** Notes hang off `agent.mandate`, so they survive every rebind and are read back when the mandate is judged. `surface_name` + `observed_agent_id` are context; a note is never evidence about an agent's version. Notes are admin-authored, org-visible (`internal`), and never enter agent context on their own.
- **Mandate fallback is system-layer inheritance, never a copied Agent id.** A definition with `metadata.fallback` delegates only its system layer to that broader Mandate; org/user bindings still win. Updating the row's own default Agent removes `fallback` through `agent.clear_mandate_fallback_on_default_change`, making the override explicit. Ambient assistants are the first consumer: Education section → Education module → `ambient.page_guidance`.

## Migrating a hardcoded call site (the sweep)

`agent.mandate` rows carrying `metadata.migration_status='placeholder'` are call sites that still run a hardcoded id; `metadata.code_ref` names the exact constant. That query IS the worklist:

```sql
select mandate_key, metadata->>'code_ref' from agent.mandate
where deleted_at is null and metadata->>'migration_status' = 'placeholder'
  and metadata->>'side' = 'client';
```

Recipe: React run site → `useHeadlessAgentJson` / `useLiveAgentRun` with `mandateKey` (THE MANDATE DOOR — the server resolves); React non-run site (a `defaultAgentId` prop, an on-click launch) → `useMandate` + gate the affordance on resolution; thunk/handler → `await resolveMandate`. Drop `<MandateAgentPicker>` wherever the user should be able to choose. Then move the mandate from aidream's `scripts/seed_mandate_placeholders.py` into a real `declare_mandate(...)` in `aidream/services/mandates/client_mandates.py` and release — `sync_declared_mandates` pops the placeholder marker, so the DB stops claiming the hardcoded path still runs.

**Migrated (2026-08-22, ROLLOUT F8):** `/chat/new` quick-action chips (9 → `chat.quick_*` + `chat.cx_default`, via `useMandateSet`; `chat.quick_org_chart` seedless → chip disabled with the reason), the response-mode auto-selector (`RESPONSE_MODE_MANDATE_MAP` in cx-chat `local-agents.ts`, the ONE map — public-chat's byte-duplicate deleted; `chat.response_mode_data` seedless → pill disabled), scraper Fact Checker / Keyword Analysis (`scraper.fact_check` / `scraper.keyword_analysis`, both seedless → the tab renders `AnalysisMandateGate`: picker + scraper door; dead ids + `contentVariableId` deleted, variable is the provision's `content`).

**Migrated:** research Outputs Studio (3) + research domain outputs (6, `DOMAIN_OUTPUTS[].mandateKey` → Context Builder `launchMandate`, 2026-08-22), content-plan setup (7), kind architect, kind creator (twin collapsed to one floating mandate), agent-app coding agent, flashcards spoken-front TTS, War Room (3), chat defaults (`chat.default_new_chat` + `chat.cx_default`), `projects.creation_guide`, the code editor (F6: 3 `code_editor.*` keys) + the system-agent registry (F8: `agent_apps.*`) — and, 2026-08-18 (education-platform WP2), **the entire education tree**: 31 raw UUIDs across 9 `agents.ts` registries became the 28-key `education.*`/`flashcards.*` roster (IC-1 in `common-docs/systems/education/INTEGRATION_MAP.md`); registries deleted, 39 call sites converted, 2 dead ids deleted unmandated.

🚨 **The placeholder census is NOT a hardcoded-id census.** The query above counts only rows someone SEEDED as placeholders — a UUID that was never seeded is invisible to it, which is exactly how education's 31 UUIDs sat outside a "worklist: empty" verdict for a month. An empty placeholder worklist means _seeded migrations are done_; the authority on remaining un-seeded hardcoded ids is `common-docs/systems/mandates/ROLLOUT.md` (F8 — ~13 ids remain outside education). A new hardcoded agent id is a new placeholder to seed + migrate, not a precedent. (`prompts.categorizer` was deleted as a dead pin.)

**When the call site PERSISTS the agent id** (War Room is the worked reference): the mandate decides only what a NEW record is CREATED with. A stored id — an association edge's `metadata.agentId`, a localStorage roster keyed by agent — always wins on rebind, so rebinding can neither rewrite nor orphan existing rows, and a migration of legacy state stamps the agent it was born under, never today's resolution. Gate the MINT affordance on resolution (disabled + the message) and let already-persisted records bind without the mandate. **Surface manifests** (`war-room*.manifest.ts`) keep a hardcoded `agentRoles[].defaultAgentId`: a manifest is static module-scope data seeded into `ui_surface_agent_role` and cannot resolve a mandate — the ruling is that it stays a documented SEED MIRROR of the mandate's system default, not a second authority (nothing reads it at run time).

🚨 **THE MANDATE DOOR — the server is the ONE resolver on the run path (2026-08-29).** `launchAgentExecution({mandateKey})` stamps the key on the conversation and `executeInstance` POSTs turn 1 to **`/ai/mandates/{key}`** (`lib/api/endpoints.ts` → `ai.mandateStart`; `/v2` covered), with the SAME `AgentStartRequest` body. aidream resolves principal → system default → org binding → user binding, applies the binding's `config_overrides`, the provision consumption map and the variable contract, then runs the identical downstream pipeline (`_run_mandated_agent` → `_run_agent`). A 404 `mandate_unfulfilled` surfaces verbatim — there is NO client-side re-resolve behind the door.

Consequences a call site must know:

- **Pass `mandateKey`, never a resolved `agentId` alone.** A surface that already knows what to PAINT (SSR-resolved, e.g. `/chat/new`) may pass `agentId` **alongside** `mandateKey`: it is display identity only, and the thunk then resolves nothing client-side. `mandateKey` remains mutually exclusive with `shortcutId`.
- **Never send mandate-derived `config_overrides`.** The server treats request config as the EXPLICIT layer that WINS over the binding, so echoing a client-resolved binding back beats the binding it came from. The thunk sends only the caller's own `config.llmOverrides`.
- **A version pin still wins** over the door (an explicit "run THIS row"; the mandate path has no `is_version` channel).
- The rule lives in `execution-system/utils/resolve-start-path.ts`; pinned by its own test plus `execution-system/thunks/__tests__/launch-mandate-config-overrides.test.ts`.

`resolveMandate` / `resolveMandateServer` are therefore **display-side** on this path: naming, painting, gating an affordance, snapshotting an instance. They are still the RUN resolver for bare `useRunAgent` call sites (agent-id callers, no mandate involved) and for consumers that persist an agent id — the un-converged remainder (see the gaps below).

**Known gap — a DURABLE conversation keeps only the agent, not the settings.** Consumers that mint a lasting chat through `createManualInstance` directly (`war_room.room` / `war_room.thread` provisioning, the master-tools `message-thread` handler) pass `mandate.agentId` and drop `configOverrides`. `createManualInstance` DOES take `mandateKey` now (that is what opens the door), so those call sites can converge by passing the key instead of a resolved id — but they persist the id into their own records, so it is a design decision, not a rename. Instance overrides live only in Redux, so even seeding them would evaporate when the conversation is reloaded from the DB — the fix is a design decision (persist per-conversation overrides vs. re-resolve the mandate each turn), not a call-site patch. Consumers that only need a DEFAULT agent id for a picker or a window (`chat.default_new_chat` tiles, `KindAgentButton`, assists `launch_agent`) are correct as they are — they never run the agent themselves.

**`useMandateRunner` is DELETED (2026-08-30).** It was the last client-side
resolver on a RUN path: it resolved the key in the browser and POSTed
`/ai/agents/{resolvedId}` with the binding's `config_overrides` echoed back as
the explicit layer — the exact bug the door fixed for chat. Its three call sites
(the mandate workspace's goal refiner and input converter, the surface bind
panel's mapping helper) now run `useHeadlessAgentJson({ mandateKey, expect: "text" })`,
which launches through `launchAgentExecution` → the door. `useMandate` stays
beside them for the DISPLAY half: gating the affordance while the key resolves
to nothing.

**Known gap — bare `useRunAgent` cannot live-render.** It produces no requestId
(the stream drains into a local string), so a surface using it can only show a
spinner — which violates the platform's no-spinner rule
(`docs/handoffs/live-stream-everywhere.md`). A mandate run the user WATCHES goes
through `useLiveAgentRun` (`features/agents/hooks/useLiveAgentRun.ts`, takes
`mandateKey`) + `<LiveRunDisplay>`. The three converged sites above kept their
button spinners (headless posture, identical behaviour); giving them live
displays is a UI decision, not a resolution one.

## A mandate replaces a hardcoded PROMPT too, not just a hardcoded id

The sweep above was about hardcoded agent **ids**. The 2026-08-16 purge closed
the other half: a hardcoded agent **definition** — a system prompt, instruction
block, role text, or persona written in this repo. Arman's ruling is that the
codebase is the CONNECTION and can never be the definition; see the root
`CLAUDE.md` bullet for the full text.

**Every instance found had already gone wrong**, which is the argument against
the pattern more than the doctrine is:

| Surface             | What the code held                                                         | How it had already failed                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/chat/voice` intro | An exact copy of the agent row's system message, used as a silent fallback | Correct only by luck — nothing kept the copy in sync, and a failed row load ran the copy without a word                                                     |
| Scribe Live         | A prompt that REPLACED the agent's own                                     | Told the agent "you cannot edit the working document in live mode" long after it was given the mutator tools it uses every session                          |
| Tool-UI generator   | A ~20k-char prompt with **no consumer**                                    | The agent's real prompt was 43,886 chars and materially different — the file read as authoritative and had zero effect                                      |
| Conductor           | A prompt written OVER every generated agent                                | The codebase was the real definition of every Conductor in the product; the `agent.template` row it "copied" was decoration a user could edit for no effect |

Rules that follow:

- **A fallback prompt is the same violation in disguise.** An unresolved mandate
  must fail loudly and refuse the affordance — never quietly run text from this
  repo. (`useXaiVoiceSession.start()` is the worked example: it refuses on empty
  instructions with a specific, visible error naming which agent failed and why.)
- **Runtime DATA injected around the agent's own prompt is fine** — the working
  document appended under Scribe Live's instructions is data, not a definition.
  The test: would a user editing the agent in the builder expect to control it?
- **If the DB's copy is wrong, fix the DB** — never override it from code. The
  Conductor template was rewritten live rather than patched around.
- **One reader per question.** `features/voice-agent/agentInstructions.ts` is the
  single answer to "what are this agent's instructions"
  (`useMandateAgentInstructions` + `readInstructionsFromAgent`), so a second answer
  cannot grow back.
- **`useAgentLauncher().launchMandate(mandateKey, opts)`** is the mandate-aware launcher.
  Its absence is part of why call sites reached for raw UUIDs.

Guard: **`pnpm check:hardcoded-prompts`** — loud, advisory, in
`run-release-gates.sh` in both modes. Allowlist
(`scripts/hardcoded-prompts-allowlist.json`) is a reason-required ratchet; the
count only goes DOWN, and `--write` never adds entries.

Guard: **`pnpm check:hardcoded-agents`** — the same law spelled as a raw agent
UUID (ROLLOUT.md row X4). Scans `app/ components/ features/ hooks/ lib/ utils/
actions/` for v4 UUID literals held in agent-shaped names (`agentId`, `promptId`,
`*_AGENT_ID`, …) or passed into `launchAgentExecution` / `launchAgent` /
`createManualInstance` / `useRunAgent` / `executeAgent`. Legal postures it
skips: a `SEED MIRROR` comment within 10 lines above the literal, a manifest
`defaultAgentId:` under `features/surfaces/manifests/`, or a reason-required
entry in `scripts/hardcoded-agents-allowlist.json`. Baseline
(`scripts/hardcoded-agents-baseline.json`) is a ratchet: exits 1 on a NEW site,
`--write` only ratchets down. Advisory in `run-release-gates.sh`; nothing runs at
commit time.

## Change Log

- 2026-09-08 — Structured inputs, output contracts, model parameters and holder checks now use shared responsive configuration tables. Source/state occupy columns; phone layouts retain labeled cells. Removed the redundant All mandates link; matching targets have enclosing borders and visible missing-source choices, disabled when inapplicable. Existing mapping, override and validation computations remain unchanged.

- 2026-09-08 — Live refinement: shared property rows now use bold colon labels, full-contrast values, fixed desktop label widths and row dividers. Input cards own one aligned property list including examples; removed the redundant declaration-source row. Goal editing has a visible button; input and output editing limitations are explicit. Existing authoring gates and writers are unchanged.

- 2026-09-08 — Tab-based configuration: Definition, Holder, Overrides, Display Options, Test, Permissions, Diagnostics, Notes. Preserved scope gates and existing writers, removed duplicate inventories and test forms, added labeled symmetric states/accessibility help. Overrides rebase against the selected holder/version while retaining edits; unset numeric settings no longer display a fabricated minimum. Sample-data fill and exact-draft full validation remain deferred. Localhost interaction and responsive verification recorded in the session review artifact; 55 focused preservation tests pass.

- 2026-09-08 — **THE GOAL WRITER IS A CONVERSATION, NOT A STRING** (Arman, live on `/administration/mandates/research_client.output_slides`). *Refine with AI* ran `mandate.goal_writer` through `useHeadlessAgentJson({ expect: "text" })` and pasted the answer into the goal textarea — for a job whose product is `agent_mandate_specification`, a registered shape (role, objective, weighted criteria, constraints, failure modes, a compressed **charge**, clarifying **questions**) with its own component. Every part but a string was thrown away, the JSON was rendered by hand, the back-and-forth the job is designed for was impossible, and the system said nothing. Now: (1) the button opens THE agent run window **on the mandate** — `useOpenAgentRunWindow({ mandateKey, surfaceName, initialAgentId: writer.mandate.agentId, initialVariableValues, initialAutoRun })`; the opener/window gained `mandateKey` (the server resolves the Holder + `config_overrides`, the agent id only paints chrome — the same managed-launcher seam `/chat` uses) and `surfaceName` (adopt a mounted surface so the run reads its scope and is offered its write targets); the transcript renders through the ONE pipeline and the person keeps talking. (2) The admin route is its own surface, `matrx-admin/mandate-workspace` (`features/surfaces/manifests/mandate-workspace.manifest.ts`; provider on `AdminMandateWorkspacePage`, goal values published from `TriadGoalSection` via `useSurfaceScopeContribution`), declaring ONE write target `mandate_goal_draft` (draft, ask) handled by the goal section (`setDraft` + open the editor — the admin still presses *Save goal*) and an `agentRoles` entry naming the goal writer (disclosure without a pixel). Route resolver: `/administration/mandates/<key>` → workspace surface; console, `new`, `advanced` stay on `matrx-admin/mandates`. DB mirror synced (`ui.ui_surface*`) — the server REFUSES a run that names an unregistered surface, so the mirror is load-bearing. (3) The kind component `agent_mandate_specification_workbench` (DB row, semver 1.1.0) carries **Use as goal** in its Charge panel: it probes the new kind action `list_surface_write_targets` and renders the control only where `mandate_goal_draft` is mounted AND wired, then applies through `apply_surface_write` (`origin: "user"`). Absent in /chat and everywhere else — never a dead button. (4) The system SCREAMS now: `execution-system/thunks/structured-output-flattening.ts` judges every headless `expect: "text"` run twice — before launch (the mandate declares a structured `output_kind`) and at settle (the harvested value carries `__kind`) — and `runHeadlessAgentJson` captures + console-errors the remedy, non-blocking. The Input section's converter moved to `expect: "json"` in the same pass. Live-verified end to end on localhost: window opens on the job, the shape streams and renders, *Use as goal* stages the charge, the editor opens with *Save goal*. Tests: `structured-output-flattening.test.ts`, `list-surface-write-targets.test.ts`, `admin-mandate-route.test.ts`, opener pass-through in `agentRunWindowOpener.test.tsx`.

- 2026-09-08 — **THE THREE CONTROLS WRITE THE SYSTEM ANSWER, AND THE TWO DELETED AFFORDANCES COME BACK AS A LINE AND A LINK** (one-resolution FIX-R13, Arman's standing defaults on top of D19). **(A) Storage is not a question put to a person.** FIX-R9-UI deleted the *"Set System-wide binding instead"* button — right, because it asked the reader to choose between two records — and left the admin host unable to create a platform-wide binding at all. There is no new button: `features/bindings/system-answer-record.ts` decides, `OneBindingWorkspace.writeBinding` is the only call site that consults it, and the rule is in this file under **THE SYSTEM ANSWER**. Two holes closed with it: the admin host's rung is now DERIVED (it was `useState`-held, so the page stayed on the definition-default rung after the save that created the binding above it), and every platform-wide refusal is keyed to the RECORD (`writesForEveryone`) rather than to `rung === "global"`, which the record could bypass. The Save button NAMES the record — *"Set the system answer for everyone"* — a label, not a paragraph. Guard: `bindings/__tests__/system-answer-record.test.ts`, 11 tests. **(B) The coverage fact and the agent door, inside the block.** `coverageLine()` — the only statement on that page of whether what the job offers feeds what the holder needs — renders as ONE LINE inside `HolderAssignment`, on the system host only (every other host still has its JOB cell, and saying it twice is the repetition Arman rejected). The door to the assigned agent goes through FIX-R10-ADDR's `useAgentHref` and nothing else, so a BUILTIN holder lands on the administration shell rather than a `/agents/<uuid>` that 404s. D19 does not regress: the block is still exactly three `data-holder-control`s and no fourth. Guard: `bindings/__tests__/holder-block-affordances.test.tsx`, 9 tests. **(C2) The declaration's field names are not badges.** *Guaranteed* / *Lazy* were the Provision entry's own column names on a screen a subject-matter expert reads; `provision-shapes.ts` now holds ONE wording (*Always there* · *Sometimes missing* · *Fetched when used*) and both renderers import it, closing the drift where the binding UI had plain words and the provision list did not. Guard: the new short-label leg of `__tests__/mandate-screen-vocabulary.test.ts` — the sweep above requires 12 characters and a space, so a one-word badge slipped through every existing leg. RED across all three, in a detached worktree at `5c9e56eedc`: 8 failed / 19 passed / 27 (plus the whole `system-answer-record` suite unable to load). GREEN: 65 suites / 562 tests.
- 2026-09-08 — **ONE COPY OF ONE DEFECT** (FIX-R9-UI round 3, the RE-WALK of v0.4.1734 — it closed the second holder block and the org-scope sentence on screen, and failed the page again because the SAME defect was stated three times). The pre-flight's verdict + remedy is THE one and stays; the Save-disabled reason stays too, deliberately (it is why a control at the bottom of a long screen is disabled, not a second telling — deleting it leaves the dead control the fourth law forbids); and the third, the run panel printing the SERVER's input-surface note in full, is now **FOLDED**: `components/official/ServerNotes` gains `folded`, so the counted heading still says a note exists and the server's exact words are one click away. Dropping it would be the silence that block exists to prevent. 🚨 That note is V-parity/UX **F1** and is already fixed in aidream's source (`contract_break_refusal_sentence` returns the database's clean `dropped_rungs` sentence) — the walker read the old uuid-and-Python-literal wording only because aidream's deployed build does not carry it yet. Two paragraphs also became two sentences: `DEFAULT_HOLDER_IS_HOLDER_ONLY` and the run panel's intro. Guard: `components/official/__tests__/server-notes-folded.test.tsx`, RED 3/6 → GREEN 6/6.
- 2026-09-08 — **ONE HOLDER ANSWER PER SCREEN** (FIX-R9-UI round 2, fresh Sonnet walk of the served v0.4.1732 — it FAILED the first build and was right). The three controls were correct and round-tripped, and the page still carried a COMPLETE second holder answer in the *Platform tools* panel: an `Agent` fact naming the same holder, `System agent: Yes`, `Version: latest (v7)`, the banner *"Research → Slides Generator does not produce what this job promises."* with the same remedy, and a button reading **"Assign a different holder"** — the control the ruling condemned, renamed. `MandateDetailView` gains **`showHolderAnswer`** (the sibling of `showGoal`, added for exactly this reason one prop over): a host that owns the holder answer passes `false`, and the three holder facts plus the SEVEN holder health verdicts (`output contract unmet`, `ok`, `version drift`, `not a system agent`, `agent archived`, `no holder yet`, `unresolved pin`) are ABSENT there — what survives is the health no holder control can state, the code declaration against the stored contract. The same defect was also stated a third time by the binding pre-flight, so the rule is now **one verdict on screen, always about the holder in the controls**: the pre-flight judges the DRAFTED agent and gates Save, and the door's `healthNote` stands only while the pre-flight has nothing to say. 🚨 The walk also found **V-PARITY/UX F3 a THIRD time** — *"Nothing overrides this job — every user on the platform runs the system answer."* on an ORG-homed job, three lines under its own correct org sentence; it takes its scope from `homeScopePhrase()` now, computed into a variable because FIX-R8's class guard rightly refuses an id-shaped expression inside a sentence. Guard: `admin/__tests__/one-holder-answer.test.ts` enumerates EVERY health verdict from `HEALTH_PRIORITY` rather than the one the walk happened to read — RED 7/7 at `293028b5d0~1`, GREEN 7/7.
- 2026-09-08 — 🚨 **THE HOLDER IS THREE CONTROLS, IN ONE PLACE** (one-resolution FIX-R9-UI, Arman's design ruling). *"3 values are all that is needed and then the mapping of the inputs… Where it says 'The system answer' you need 3 labels and 3 inputs… massive confusion by then repeating it in the bottom where it says 'Assign the system holder' that's stupid. One place is all we need and it's 3 things, not more."* `features/bindings/HolderAssignment.tsx` is now the only holder chooser in the repo — **Holder Type: Agent | Workflow · Assigned Agent/Workflow (the record's own id beside the name, never a version id) · Version (Latest or one version, in ONE dropdown)** — mounted by `ScopeHolderBar` for every perspective, so a fourth copy cannot fork per host. The version control is ABSENT until a holder is chosen, and `Latest` is a value rather than a Switch that disables a Select (storage: `default_holder_version_id IS NULL`). **DELETED:** `workspace/SystemAnswerSection.tsx` whole (it described the same three values ten lines above the controls that set them, in its own vocabulary — *"The system answer"*, *"Assigned by a platform-wide binding, which sits above this job's own default."*, *"Assign a different system agent"*, *"Required output: …"*), the *"Assign the system holder"* heading, `MandateDetailPanel`'s *"Who fulfils this job"* fold (a heading, a paragraph and an **Open it** button pointing at the same page), and the rung + job cells on the system host only. **The verdict now comes from the DOOR:** `system-rung-health.ts` prints `mandate.resolve`'s `dropped_reason` verbatim with a remedy chosen by `dropped_code` — the whole client-side `output_schema` re-derivation is gone from that path (V-PARITY/UX F2, the column had zero frontend consumers) — and `ladderRowIsBroken()` reads `dropped_code` first, so an output-contract drop (holder LIVE, rung dropped) stops rendering as *"Names an agent, running its latest version."* The scope half comes from the mandate's HOME (F3): *"every member of Write Target Sandbox"*, named, never the platform-wide claim for an org-homed job. Guard: `workspace/__tests__/holder-assignment.test.tsx`, RED 15 of 18 at v0.4.1731 → GREEN 18 of 18.
- 2026-09-08 — **Resolve a mandate only where its affordance exists.** `useMandateSet({ enabled: false })` now returns an empty set without issuing requests. The app-wide `MessagingHost` uses a ref-counted demand from `ConversationPane`, so the four `messaging.*` jobs and their knob resolve only while a conversation surface is mounted; unrelated routes no longer turn expected unfulfilled jobs into background errors.
- 2026-09-08 — **THE LIST SAYS THE SAME THING AS THE PAGE, AND THE BOTTOM RUNG HAS ONE ROAD** (FIX-R5). Two classes closed. **(1) The output half, everywhere.** FIX-R4 taught `buildRow` to judge it and named what it did not close: the LIST still reported `ok` because the console load never read `output_schema`. `fetchMandateConsoleData` now reads the column on the by-id agent query it was already making and hands it over as `MandateConsoleData.outputSchemas`; `buildRow` uses it when no explicit map is passed, so every list caller inherits the verdict and an explicit map (a fresher single-holder read) still wins. **Absent is still UNKNOWN** — an agent missing from the map is not accused. The SQL half moved with it: `public.mnd_list_scoped` computes the same verdict through `mandate.missing_output_keys` (aidream `0597`, the one SQL mirror of `_schema_keys` / `outputSchemaKeys`), and `output contract unmet` gains its badge, its sentence and its filter option in `browse/types.ts`. Measured live: **46 of 682** definitions have a default holder that cannot produce their required keys, and all 46 were reading `ok`. Live RED→GREEN on `research_client.output_slides`. **(2) `aidream AD226` — the mandate's default holder is written through the door, never the row.** `lib/supabase/mandateStorage.ts::mandateHolderWrite` is **DELETED** and `MandateDefinitionPatch` can no longer carry a `holder`; `useGuardedRebind`, `MandateDetailPanel`'s version pin and `AgentConvertSystemWindow`'s twin rebind all call `putMandateDefaultHolder`, and the door's one-of-two holder choice is made ONCE in `overrides.ts::agentDefaultHolder`. The database refuses the client-side write outright now (`aidream/db/migrations/0596`), so the guard is a CENSUS, not a three-file fix: `__tests__/default-holder-has-one-road.test.ts` sweeps every `.ts`/`.tsx` under `features lib app components hooks utils` and fails if any file names those columns in a write. RED in a detached worktree at `0d57acc92e`: 6 failed / 8 passed. GREEN: 14/14.
- 2026-09-08 — **THE WALK'S THREE FINDINGS, closed the same session** (FIX-R4 round 3; independent Sonnet walk of the deployed v0.4.1720). (1) **One screen, two verdicts about one holder**: the system answer said, in red, _"Research → Slides Generator declares no structured output, but this job requires `title` and `slides` … the assignment fails at run time"_, and three inches below it the Platform-tools banner said, in green, _"Healthy — System agent, tracking the latest version."_ The health model knew nothing about the OUTPUT half of the contract, which `enforced_holder_contract` keeps in force ALWAYS. `mandate-health.ts` gained `output contract unmet` (ranked above version drift — a drifted pin still runs, this does not) and `buildRow` takes an optional `outputSchemas` map judged by the SHARED `missingOutputKeys`; **absent means UNKNOWN, never "fine"**, so a caller that has not read it keeps exactly the verdict it had. The single-mandate admin page reads the holder's schema by id and supplies it; the console list did not, **and that gap is CLOSED by FIX-R5 (2026-09-08)** — see the entry below. Guard: `admin/__tests__/output-contract-health.test.ts` (RED is the shipped three-argument call, still asserted as `ok`; GREEN is the four-argument one). (2) **A person-perspective sentence survived in the door copy**: _"one screen, three rungs (system, organization, just you)"_ — also factually wrong for this host, which offers two. Rewritten to name the rungs the page actually manages. (3) **`The goal could not be read: Select an organization before sending this request.`** printed inside Platform tools, on a page that must never need an organization: `MandateDetailView`'s goal block is org-admitted AND a duplicate of the triad the workspace already renders above it, so the admin route passes the new `showGoal={false}` and the window's Admin pane (which shows no triad) keeps it. **Not a defect, checked and cleared:** the walk reported the health remedy's _"Open Research → Slides Generator"_ pointing at the public `/agents/{id}` route — read off the live DOM, that button is `/administration/agents/system-agents/agents/{id}/build`; the public href belongs to the `EntityRef` door beside it, which opens every agent in the USER shell from every host. That door is a shared primitive and is filed as a finding rather than special-cased here.

- 2026-09-08 — **THE ADMIN ROUTE IS THE SYSTEM RUNG AND NOTHING ELSE** (one-resolution FIX-R4, Arman's top-priority order). On `/administration/mandates/research_client.output_slides` (v0.4.1719) the admin panel rendered the PERSON's perspective — the ladder _Run scope / Your override / Org override / Platform-wide override / System default_, _"This job has no answer for you right now."_, _"How this job is decided for you"_, a rung selector defaulting to **User** (_"This applies everywhere you run"_) — while the system rung's own controls sat in a collapsed _Admin controls_ fold and the mandate's real defect was worded _"No Holder fulfils this job yet"_ with no remedy. Arman: _"this is the Admin panel so it should never show ANYTHING related to a user or an org … the ONLY thing it should ever show is the things we assign from the system … it's showing me a bunch of meaningless garbage … and it's missing the actual things I need."_ **The class fix is that the HOST decides the perspective, once** — `WorkspacePerspective` (person | organization | system), with the host census in the section above. The system perspective asks neither `GET /mandates/{key}/resolution` nor `mandate.resolve`: both answer _"what runs for me"_, and rendering that answer on the platform's own page is the lie, not the layout. What it shows instead: **`workspace/SystemAnswerSection.tsx`** — who the platform assigns, whether the assignment comes from the job's own default or from a global binding above it, and the system rung's HEALTH WITH THE REMEDY INLINE, written by the pure `workspace/system-rung-health.ts`. The case Arman was looking at now says _"Research → Slides Generator declares no structured output, but this job requires `title` and `slides` — whatever reads this job's result cannot be produced, so the assignment fails at run time."_ with _"Give Research → Slides Generator an output schema declaring `title` and `slides`, or assign a system agent that already does."_ and two doors (open the agent · assign a different system agent). The binding UI is PINNED: `OneBindingWorkspace`/`ScopeHolderBar` gained an additive `fixedRung`, so the bar STATES _"System — decides for every user"_ and offers no User/Org — the P13 movable control survives untouched on every host that really has a rung to choose. A personal agent at the system rung is now a **hard refusal** (Save disabled, reason + remedy beside it) rather than a warn-and-allow dialog: one rule in `features/bindings/system-rung.ts`, used by the bar's alert and by the refusal, so they cannot disagree. The admin's tools left the fold for the page surface, and the _User & org bindings_ list with its precedence ribbon is DELETED from the admin panel — one read-only sentence carries the count, because other people's overrides are theirs to change. Guards, both RED then GREEN: `admin/__tests__/admin-route-system-perspective.test.tsx` drives the REAL workspace at `host="admin-route"` and reads the copy (RED against the shipped tree, which rendered _"Run scope Your override Org override Platform-wide override System default This job has no answer for you right now. … How this job is decided for you"_), and `admin/__tests__/system-rung-holder-refusal.test.tsx` (RED: the scope picker rendered on the pinned host; the shipped `saveRefusal` had no branch for a non-system holder).

- 2026-09-08 — **THE HOME IS ON THE ROW, AND THE ORGANIZATION IS IN THE PANEL** (one-resolution FIX-R3/W1). The ownership tabs shipped on 2026-09-07 kept the canonical list shell's ONE `orgs` tab with a per-org chevron dropdown welded to it. A fresh Sonnet walk of v0.4.1718 drove `/mandates` and reported the page as having **no per-organization view at all** — the dropdown was never found, and no row said whose job it was. That loses the exact distinction the ruling is about: a mandate's home is its ORGANIZATION (D-R3), a personal workspace is just an organization, and the blended list mixes the platform's 400+ jobs with the handful an organization added. **The tab/facet semantics, stated once:** the TAB picks OWNERSHIP (`p_home`) — `orgs` blended is `all` (the platform's own **plus** every organization the caller belongs to), `orgs` narrowed to one organization is `org:<id>`, and `System` (`p_home => 'system'`) renders for a Matrx admin only, on exactly the door's own `is_platform_admin()` bar. RESOLUTION (`p_resolution_for`) is always the caller's own, in their ACTIVE organization (D-R1), on every tab. Because All is a blend, **an organization's count never sums to All's** — said on screen in the section's own hint rather than left to be inferred. What changed: a new shared primitive `EntityScopeFacetSection` (`lib/entity-list/config.tsx`) renders a scope's narrowing options as a section of the **Filters & Sort** panel, reading and writing `query.scope` — the SAME state the tab's dropdown writes, with the SAME counts (`EntityScopeCounts.narrow`), so there is no second filter to drift and no client-side re-filtering; every surface with a narrowable scope inherits it. `/mandates` declares the `Organization` section (`scopeSections` in `browse/listConfig.tsx`), and choosing an option re-asks `mnd_list_scoped(p_home => 'org:<id>')` — ownership is the door's decision and only the door's, which is why this is NOT a `p_filters` facet (the RPC has no home predicate in its filter bag; such a facet would silently narrow nothing). A **Home** column (`browse/MandateHome.tsx`) is locked on in the table and carries a badge on the compact rows and cards: the org's display name, `Matrx System` for the platform's own, resolved from the caller's membership list — an id it cannot resolve renders VERBATIM with a loud console error, never a guessed "Unknown", and the badge stays silent (not wrong) while the names are still being read. `prefsVersion` bumped 1 → 2, because a new column under a stale version is a column no existing user ever sees. Guard: `browse/__tests__/home-ownership.test.ts`, proven RED against `HEAD`'s own `listConfig.tsx` + `columns.tsx` (4 failing: no Organization section, no Home column, `prefsVersion: 1`, the section absent from the scope bag) and GREEN on what shipped (9/9).

- 2026-09-07 — **A refusal that accuses an agent now opens it.** `/administration/mandates/research_client.output_slides` printed the resolver's sentence — _"resolved system agent 8f0bbfc2-… breaks the mandate contract: declares no structured output_schema, but this mandate's consumers require output keys ['title', 'slides']"_ — as flat text, so the reader was told which agent was wrong and then made to hand-copy a uuid into a URL bar. That is THE DOOR LAW in prose form, and it is now corollary 6 of `../common-docs/policies/no-dead-ends.md`. The primitive is `components/official/entity-ref/TextWithDoors.tsx`: it splits a server sentence VERBATIM (every character survives, in order — no truncation to `8f0bbfc2…`) and renders each id through `EntityRef` as a new-tab door, taking the entity token from the sentence's own words and falling back to a `defaultToken` the surface declares. An id whose type cannot be established stays plain text, because a link to the wrong record reads as a fact and is a lie. Adopted by `MandateWorkspace` (refusal + every dropped rung), `RunFailureCard`, `mandate-actions` (promotion refusal + hint), `MandateDetailPanel`, `MandateTestBench`, `ProvisionOfferComposer`, `BindingMiddle` and `OneBindingWorkspace` (contract problems) — and by `components/official/ServerNotes.tsx`, which carries it to all 7 of its adopting surfaces for free. `EntityRef` stopped rendering an EMPTY controls span in the same change: it is a flex child, so the wrapper's `gap-1` was reserving a hole in the middle of the sentence. Guard: `components/official/entity-ref/__tests__/sentence-doors.test.tsx` (6 tests — token inference, verbatim round-trip, the two refuse-to-guess cases, and the rendered new-tab link). The remainder of the class outside this feature is filed as `FOUND_DEFECTS.md` D298.

- 2026-09-07 — **Promotion: a mandate can be copied into the system org, with lineage.** `mandate.duplicate_mandate(p_mandate_id, p_as_system, p_organization_id)` (aidream `0592`) is the ONE door that copies a mandate, and the client never re-decides any of its rules. Deliberately NOT a mirror of `agx_duplicate_agent` (REVIEW-one-resolution.md §8b item 3): `mandate.definition.organization_id` is NOT NULL and there is no type flag, so the `p_as_system` branch HOMES the copy in the Matrx System organization — read from `iam.system_orgs` key `'system'`, never a literal uuid — and the other branch homes it in an organization the caller names and is PROVED to belong to. What IS copied verbatim from the precedent is that the super-admin check lives inside the function body, because the function is granted to `authenticated`. **THE HOLDER LAW:** a promoted copy's default holder must be a system agent (`agent_type='builtin'` AND system-org owned), and a personal-agent holder is refused with the fixing door named — _"Promote the agent first: agx_duplicate_agent(p_as_system)…"_. **The copy starts with NO RUNGS** — no binding of any principal type is carried across, and the screen says so before the click. Surfaces: `PromoteToSystemMandateButton` (`admin/mandate-actions.tsx`) in the Admin controls fold, beside the agent's "Create system twin + rebind"; the door's refusal, hint included, is printed verbatim. `MandateLineageLine` renders _"Promoted from <label>"_ on the copy and _"Promoted copies: N"_ on the source, on every host, from the new `source_mandate_id` column — and says so explicitly when the ancestor exists but is not readable, rather than looking identical to a mandate with no ancestor. Guards: `__tests__/promotion-door.test.ts` (RED against a client-side read-then-insert that names the system org itself and drops the hint) and, for the door's real behaviour on PRODUCTION, `aidream/tests/test_mandate_promotion_live.py` (6/6, RED then GREEN).

- 2026-09-07 — **One list door, and the console became its `system` home.** Both mandate lists and the admin console now go through `list-door.ts` — the ONE client of L0's rewired `public.mnd_list_scoped(p_home, p_resolution_for, …)`, which takes OWNERSHIP and RESOLUTION as two separate parameters (DESIGN-one-resolution.md v2). The console's two unscoped reads are DELETED: it read every definition and, on the belief that _"RLS already narrows them"_, every binding in the database (283 live, of which 7 belong to system-homed mandates) and filtered client-side — for a platform admin `platform_admin_all` narrows nothing. Ownership and the admin gate now come from the door (`p_home => 'system'`, 409 rows measured live); the full definition rows the console needs are fetched by id and the bindings by mandate id, chunked at 100 because PostgREST puts every filter in the URL. A caller the door refuses gets its sentence PRINTED on the console — the `(admin)` route tree admits any admin level while the door gates on `is_platform_admin()`, so that gap is real. `/mandates` grew OWNERSHIP tabs on the canonical scope strip: one per organization the caller belongs to (personal workspace included — a personal workspace is just an organization, D-R3) plus **System for a Matrx admin only**, each with a true count taken from the door's own `total_count`; resolution stays the caller's, in the ACTIVE org (D-R1), on every tab. Rows now carry `holder_live` / `version_live` / `home_organization_id`, the `global` rung and the `holder unreachable` / `version unreachable` states are named and filterable, and an unknown rung or status is shown verbatim with a loud error instead of crashing the row on a missing Record key. The hand-rolled `MndRpcMap` seam is gone — `types/database.types.ts` now carries the RPC and the row type is checked against it at compile time. The organization settings page keeps `p_resolution_for => 'org'` from its route param, unchanged.

- 2026-09-07 — **The workspace stopped resolving and started asking.** `MandateWorkspace`'s `resolveForPrincipal` was a third hand-written ladder: it took `orgBindings[0]` from every binding whose org was one the caller belonged to (`orgIds.has(...)`), so "what runs for you" could name an agent from an organization that has no rung at all under D-R1. The personal principal now renders the SERVER VERDICT (`useMandate` → `resolveMandate` → `GET /mandates/{key}/resolution`) and names the ACTIVE org by name — _"Titanium (your active org) overrides this job."_ — never an org id; a verdict the client cannot run (version-pinned, non-agent holder) shows the resolver's own refusal instead of a guessed holder. The "N of your organizations override this job" fold is deleted with its "the first matching organization above" line; in its place `workspace/useMandateLadder.ts` reads L0's live client door `mandate.resolve(p_mandate_key, p_organization_id)` — one row per rung in ladder order, `global` never relabelled `system`, `holder_live`/`version_live` rendered as **Broken**, settings-only rungs rendered as settings. Nothing derives a winner from those rows: the verdict owns that. The ORG route principal keeps its own semantics (it answers for every member of the route's org, which no `auth.uid()` door can). Guards: `workspace/__tests__/workspace-one-resolution.test.ts` (the deleted cross-org shapes proven red against the code as it shipped, plus the rung-vocabulary writers).

- 2026-08-31 — **The vocabulary guard moved from words objects to rendered copy, and runs both ways.** `options-drawer-words.test.ts` compares words objects, so it was blind to a sentence hardcoded in a component — which is how "Surface values" survived in `MandateContextGate.tsx` (V2 round 4) after two earlier recurrences on two other delivery paths. `features/mandates/__tests__/mandate-screen-vocabulary.test.ts` now reads the SOURCE of every component under `features/mandates` and `features/bindings` (plus the AI map's prose in `features/surfaces/utils/binding-suggestions.ts`), strips comments, and flags any human sentence naming the old system; a second sweep points the same machinery at the agent doors for the mandate system's own noun (V1 round 4 O3 — the model picker said "the holder's own model" on the shortcut editor). Copy fixed in `MandateContextGate`, `MandatesConsole`, `provision-shapes`, and the model picker's empty choice is now a word each host supplies (`RunConfigOverridesWords.modelEmptyChoiceLabel`, defaulting to the agent noun). Both directions proven red against the exact shipped strings.

- 2026-08-31 — **A run says what it did, and a refusal stays on the screen.** `MandateTestResult.notes` (the `mandate_consumption_map_no_op` scream among them) arrives in the body of a 200 and used to be rendered nowhere; every run surface — the workspace's Run-this-job panel, the admin "Try it now" panel and each batch-bench cell — now prints it through the ONE counted amber block, `components/official/ServerNotes` (the binding-save notes block of v0.4.1567, extracted so the treatments cannot drift). And a 409/422 from the run door no longer collapses into a toast that clears the panel: `runMandateAdHocTest` throws `MandateRunRefusal` carrying status, machine code, notes and request id, and the panels keep it on screen in `RunFailureCard` until the next run replaces it. Pinned by `features/mandates/__tests__/run-honesty.test.tsx` and `features/mandates/workspace/__tests__/run-panel-honesty.test.tsx` (all three panel cases proven failing against the pre-fix component).

- 2026-08-31 — **The mandate workspace authenticates before protected reads.** `useMandateWorkspaceData` now establishes the browser user before constructing its `mandate.definition` query, so route/session hydration gaps fail locally instead of reaching PostgREST as anon. `workspace-auth.test.ts` pins both refusal and authenticated passage.

- 2026-08-31 — **Mandate resolution authenticates before protected reads.**
  `resolveMandate` establishes the Supabase user before reading `mandate.definition` or
  consulting its user-scoped cache. Anonymous/session-drift callers refuse locally, and
  an account switch cannot reuse the preceding user's resolved binding.
- 2026-08-31 — **Organization binding writes carry one organization at both boundaries.**
  `putMandateBinding` and `removeMandateBinding` bind `scopeOverrides.organization_id`
  to the org principal they write, so an administrator can manage an org binding while
  another workspace is selected without the transport rejecting body/header drift.
- 2026-08-31 — **The two missing sources, the promise, and the example.**
  A mandate consumption map now carries all three storable sources, not one:
  `direct_value` (a literal on the binding) and `prompt_user` (a question the mandate's
  input surface serves as a REAL named field, `origin: "binding_prompt"`, so the ask
  actually happens and the answer arrives under the holder input's own name) join
  `offered_value`. `ConsumptionEntry` widened to those three branches of the shared
  `ValueMapping`; `parseConsumptionMap`, `consumptionMapProblems` and
  `consumptionMapForApi` each speak all three. `mandate.binding.auto_run` (nullable)
  closes the auto-run inversion, refused-down-to-false at both write and resolve when
  the map still asks. `OfferedValue` and `DraftInput` gained a static `example` (D2) —
  an illustration at the moment of choice, never read at run time.
  **Two class defects fixed on the way through:** `compareConsumptionAgainstOffer` read
  a `direct_value`'s literal as an offered-value NAME, failing binding health on valid
  bindings; and `admin/pin-refusal.ts` + its test were DELETED as orphans (their only
  consumer was the rebind editor deleted with `OverrideFlow`) — the rule they held is
  no longer reachable from any screen.
- 2026-08-31 — **THE INPUT SURFACE IS SERVED, and "user text only" became a measurement.**
  Every reader derived a mandate's inputs from the two things only CODE declares (a
  Provision, or the promoted `required_variables`), so a mandate a PERSON authored —
  described inputs, an output kind, an agent bound and mapped — read as declaring nothing,
  and its run form offered one anonymous text box (found live by Arman on
  `mandate.goal_writer`). `GET /mandates/{key}/input-surface` (aidream
  `services/mandates/input_surface.py`) now answers, `ServedInput`-shaped so a mandate
  input and a workflow input are ONE contract (INPUT-SURFACE.md): provision → the
  mandate's own described inputs (label = the description; a described input whose name
  matches a Holder variable takes the HOLDER's spelling so the value lands) → the Holder's
  own declarations → none. `input-surface.ts` is the client half; `isUserTextOnly()` is the
  ONE rule for the phrase — served nothing AND nothing failed to load. `RunThisJobSection`
  consumes it instead of deriving fields; `TriadSections`' else-branch and the console's
  `MandateInputsCell` (via `mandate-health.ts`'s four-declaration `inputSummary`) read the
  described inputs and the bound agent's declarations before they may say the words.
  **THE SYSTEM RUNG BECAME A BINDING** in the same pass: `mandate.binding.principal_type`
  admits `'global'` (one row per mandate, super-admin only), so the rung that serves
  everybody can finally carry a consumption map and settings — `MandateBindingPrincipalInput`
  accepts it. No binding UI changed; that is frozen pending Arman's written plan.
  **THE DEAD SELECT** in the pin editor is fixed and guarded (`admin/pin-refusal.ts`): the
  dropdown is the authority on what was picked, the catalogue only describes it, and every
  refusal is in words on the page with its remedy named.

- 2026-08-30 — **THE DETACH, code side (program item 6.10).** A mandate is fulfilled by an
  Agent, an Orchestra, or a Workflow, so the feature stopped living under the agent
  namespace. Moved, imports rewritten repo-wide, no behaviour change:
  `features/agents/mandates/` → **`features/mandates/`**; `features/admin/mandates/` →
  **`features/mandates/admin/`**; `features/window-panels/windows/agents/MandateWindow.tsx`
  → `windows/mandates/MandateWindow.tsx`; routes `/agents/mandates{,/[mandateKey]}` →
  **`/mandates{,/[mandateKey]}`** and `/administration/agents/mandates/**` →
  **`/administration/mandates/**`**. Every old URL 308s (`next.config.js`, pinned in
  `admin/__tests__/retired-slot-producer.test.ts`, curl-proven), and the retired
  `/agents/mandates/new` lands on `/administration/mandates/new`. Admin nav: Mandates is now
  a top-level `/administration` domain (`slug: "mandates"`), a PEER of Agents rather than a
  row inside its "Tools & MCP" section. **The security shape is unchanged** — management
  (create / rebind / enable / bench) stays super-admin gated under `/administration`, and the
  user route stays browse + self-service. Window slug, `overlayId`, `urlSync` key, storage
  tables, and the `/ai/mandates/{key}` server door were all deliberately untouched. Doc
  pointers here now read `common-docs/systems/mandates/` (the node moved out of
  `systems/agents/` in the same sweep).
- 2026-08-30 — **THE MANDATE-DOOR FORK CLOSED: `useMandateRunner` deleted.** The
  one-resolver work left one client-side RUN resolver standing — `useMandateRunner`
  resolved the key in the browser, POSTed `/ai/agents/{resolvedId}`, and echoed the
  binding's `config_overrides` back as the request's EXPLICIT layer (the same bug
  that was defeating chat's own bindings). Its three call sites converged onto
  `useHeadlessAgentJson({ mandateKey, expect: "text" })` → `launchAgentExecution` →
  `/ai/mandates/{key}`: the mandate workspace's **goal refiner** and **input
  converter** (`workspace/TriadSections.tsx`, availability still gated by
  `AutomationButton`'s own `useMandate` probe) and the surface bind panel's
  **mapping helper** (`features/surfaces/components/bind/BindingSuggestionsTab.tsx`,
  which keeps `useMandate` for the unavailable state and now reads its live
  "writing (N)" counter off the run's own request via `selectAnswerText` instead of
  a drained local string). The hook file is deleted, not deprecated; the
  `check-agent-disclosure` run-signal for it went with it. **Id-persistence:** the
  shape-assists producer (`features/content-ir/studio/shape-assists-producer.ts`)
  stopped baking `resolveMandate(content_ir.kind_creator).agentId` into every
  emitted chip — a 30-day chip was pinned to whoever held the job the morning it
  was emitted — and now stores `mandateKey`, resolved at CLICK time by the
  `launch_agent` handler, matching its four sibling producers. War Room and the
  transcript-studio roster deliberately keep persisted ids (the PERSISTED-ID
  DOCTRINE above: a stored id must win on rebind so existing rows are never
  rewritten or orphaned).

- 2026-08-29 — **Coverage badges on both mandate LISTS.** The green/orange/red
  scoreboard existed only on the admin console, so a person browsing
  `/mandates` (or an admin on `/organizations/[orgId]/settings/mandates`)
  could not see that a row runs on somebody else's Holder. Now every row carries a
  compact badge: met is QUIET, amber names the leader carrying it, red says nothing
  is assigned — and clicking one narrows the list to that state (the console board's
  click-to-filter pattern), server-side, with a "Showing only …" strip to clear it.
  - **Data source:** a new authenticated `GET /mandates/coverage/states` in aidream
    (the `mandate_coverage` router's second mount), which calls the SAME
    `services/mandates/coverage.py` the super-admin scoreboard does. Deriving the
    badge from the row's own `fallback_mandate_key` was the alternative and was
    rejected: the classification walks fallback CHAINS across the whole registry
    (leaders, cycles, dead ends), which a 25-row page cannot see — it would have
    been a second, wrong implementation of the rule.
  - **Green is now SAID, not inferred.** The scoreboard payload names only orange
    and red; the states payload names every mandate it covers, so a key that is
    ABSENT means the report does not answer for it. That is what makes an
    org-scoped report honest: a platform mandate the organization does not own
    shows `—`, never a false green.
  - **Ownership law:** the org page passes `?organization_id=` (its own org), so it
    answers for what that organization owns. Today the platform owns 377 of 378
    mandates, so that page's badges are mostly `—` by construction — correct, and
    the reason the unanswered state had to be visible.
  - Narrowing rides `p_filters.coverage_keys` in `mnd_list_scoped` — the KEYS the
    server classified, never the rule. The coverage column deliberately does not
    sort (sorting it would mean re-deriving the classification in SQL).
- 2026-08-29 — **Demoted to self-service: browse/view + your own override.** Arman's
  ruling: mandate management is admin-side, because a mandate's goal, its declared inputs
  and running it are platform definitions, not user settings. So this route no longer
  offers goal editing, draft-input editing, RUN THIS JOB, or a New Mandate button, and
  `/mandates/new` is gone — all of it lives under `/administration/mandates`
  now, on the SAME `MandateWorkspace` (`host="admin-route"` sets `authoring`). The triad
  still renders here in full, read-only; the override flow, org-context line, fulfillment,
  duplicate-and-customize and notes are untouched. Matches the server, where
  `POST /mandates` and `PATCH /mandates/{key}/{goal,draft-inputs}` are now
  `require_super_admin` (aidream `304fe1848`). Eyes-verified on localhost:3001: the list
  shows no New button; `masterwork.understudy` shows INPUT/GOAL/OUTPUT with a plain goal
  and no pencil, no Refine with AI, no run panel, and "Your override" intact.

- 2026-08-29 — **The triad is the page, and mandates are user-creatable.** The workspace
  (route + window, same component) now leads with INPUT → GOAL → OUTPUT
  (`workspace/TriadSections.tsx`): the goal reads from `mandate.definition.goal` (its ONE
  home post-1W), edits in place through `PATCH /mandates/{key}/goal` (grounding → 'H',
  permanent — the boot sync only refreshes 'A' goals), and carries a plain-words grounding
  badge; INPUT shows the Provision's offer, or the row's `draft_inputs` descriptions
  (editable, `PATCH /mandates/{key}/draft-inputs`), or the honest "user text only" state.
  `/mandates/new` (`authoring/NewMandatePage.tsx`) creates a mandate before its
  intelligence exists — descriptive inputs, the goal, an output kind + free-text
  constraints — via `POST /mandates` (origin='user'; the server key validator's message
  renders verbatim). 🚨 **That page holds the only copy of the person's work, so two
  rules bind it** (FIX-R14): `authoring/draft.ts` writes every field as it is typed and
  puts it back on the next mount with an ANNOUNCED restore + *Start fresh*, so a route
  that changes for any reason costs nothing; and `authoring/key-availability.ts` makes a
  key that already names a live job a REFUSAL ON THE FIELD naming that job, with a link
  that opens in a new tab — the probe holds no router and returns a value, and the page's
  ONLY navigation is the post-create handoff to the mandate the server said it created.
  Two automation slots (`authoring/AutomationButton.tsx`) run mandates
  BY KEY (`authoring/constants.ts`: `mandates.goal_writer`, `mandates.kind_converter`) and
  refuse visibly with an informational readiness toast naming the key until those mandates
  exist. Expected absence never uses `toast.error`/`toast.warning`, because the shared toast
  boundary persists those severities as `system_error`. The window host
  links "Open full page".

- 2026-08-30 — Optional authoring automations classify an absent Holder as informational
  readiness, not an error toast; `AutomationButton.test.tsx` proves the expected refusal
  cannot enter `system_error` through the captured-toast boundary.

- 2026-08-29 — **The Mandate browse RPC follows the completed 1W storage cutover.** `mnd_list_scoped` now reads `mandate.definition` / `mandate.provision` / `mandate.binding`, derives latest from a null Holder version, and ignores non-Agent bindings in its Agent-shaped result instead of querying the graveyarded `agent.mandate_binding`. A source-contract test refuses every retired table and Holder-column name.

- 2026-08-28 — **You can RUN the mandate you are looking at.** The workspace stated the
  job, the Holder, the override and the notes, and had no way to run any of it: the only
  run affordance in the product was the admin console's bench, on an `/administration`
  route. New `workspace/RunThisJobSection.tsx` adds a **Run this job** section to
  `MandateWorkspace`, so it appears in BOTH hosts (the `(core)` route and the
  `MandateWindow` twin) with no host branch. Inputs are driven off the **Provision offer**
  `useMandateWorkspaceData` already loads (guaranteed ⇒ required, `pinned_context` values
  filtered out because the platform delivers them), each through the canonical
  `VariableInputComponent`; a legacy contract-only mandate falls back to its required
  variables. THE USER-INPUT LAW holds: every declared value goes as a named entry in
  `variables` and the free-text box is the only thing that becomes `user_input` —
  structured kinds are typed as JSON so they stay structured on the wire. The result
  renders through the ONE canonical pipeline (`StructuredValueView` for structured
  payloads and JSON documents, `MarkdownStream` for prose — nothing hand-rendered), and a
  failure shows the server's error verbatim. **The workflow leg:** the test result now
  carries `holder_type` / `run_id` / `workflow_id`, so a WORKFLOW holder's child run gets
  an **Open the run** door to `/workflows/runs/{run_id}`; those three fields are narrowed
  at ingress in `test-run.ts` (`readMandateRunHolder`) because `api-types.ts` is generated
  and does not carry them yet — the same local-extension seam `provision-shapes.ts` uses,
  removable on the next regeneration. **Gating:** `POST /mandates/{key}/test` is
  `require_super_admin` server-side, so the whole section renders nothing for anyone else
  rather than offering a guaranteed 403. Reuse, not a fork: `runMandateAdHocTest` moved
  from `features/mandates/admin/service.ts` down to `test-run.ts` and both hosts call the
  one function; `TryItNowPanel` itself was NOT reused — it is contract+agent-definition
  driven and half of it is exemplar authoring, so making it host-agnostic would have meant
  rewriting its field derivation and gutting its save half. Gates green: `type-check`,
  `test:workflow-runtime` (370), `test:content-ir` (1320), `check:hardcoded-prompts`,
  `check:kind-marker-law`, `check:agent-disclosure`, `check:dead-ends` (no new findings).
  Not browser-verified here by instruction — the preview server is owned by another session.
- 2026-08-29 — `test-run.ts` now owns the one client ad-hoc mandate test path and its generated transport shapes/runtime guard. Admin and core hosts share it; the endpoint remains super-admin-only and non-streaming.
- 2026-08-28 — **"Use a Workflow" is real.** The Holder step binds a Workflow end to end now
  that aidream executes one (`workflow_holder.py`), so the `mandates.workflow-holder`
  coming-soon entry is RETIRED rather than left "blocked" beside a working feature.
  `workflow-holders.ts` lists candidates from `workflow.definition`, putting the workflows that
  DECLARE this mandate's `output_kind` first and listing the rest rather than hiding them — the
  bind gate also accepts a workflow whose compiled deliverables produce the kind, and no column
  can know that. Step 3 maps onto the workflow's ONE compiled input surface
  (`GET /workflows/{id}/run-form`, never derived here) — the same map, keyed the same way, that
  `bindings.py::_check_target` validates. The gate is the only judge for a workflow Holder and
  its refusals stay ON THE PAGE, not just in a toast.
- 2026-08-28 — **THE GOAL, and the org pages answering for the ORG.** A mandate's goal is an
  aidream code declaration with no column and no write path, so it reaches this repo through
  `catalogue.ts` (`GET /mandates`) and `useMandateGoal`, and is shown READ-ONLY with a note
  saying where it is edited — the workspace used to print `description` and call a mandate with
  a perfectly good goal "a registry gap". `ProvisionOfferList` was extracted from §1 so the
  admin drawer reuses it instead of growing a second copy. Separately, `mnd_list_scoped` had
  carried `p_scope`/`p_org_id` since it was written and ignored both: the org settings pages
  resolved the CALLER's funnel, so an org admin with a personal override saw their own agent
  under "Fulfilled by". The RPC now honours org scope (personal bindings excluded, only the
  named org may decide, membership proved inside the SECURITY DEFINER body) and
  `MandateWorkspace` resolves for the principal the surface speaks for.

- 2026-08-29 — **THE MANDATE DOOR: two resolvers collapsed to one.** matrx-frontend resolved
  mandates in the browser and POSTed `/ai/agents/{resolvedId}` while aidream's own
  `POST /ai/mandates/{key}` (built, tested, already used by matrx-extend and matrx-local) sat
  unused — so a server-side rebind or provision never reached client chat. `launchAgentExecution`
  now stamps `mandateKey` on the conversation and `executeInstance` routes turn 1 through the
  door (`resolve-start-path.ts`); mandate-derived `config_overrides` are no longer echoed back
  (they were landing as the EXPLICIT layer and beating their own binding); `mandateKey` and
  `agentId` are no longer mutually exclusive (`agentId` is display identity — `/chat/new` passes
  its SSR-resolved default and resolves nothing client-side). Every `launchMandate(...)` site
  (11) converged for free through the funnel. Browser-proved on `/chat/new`:
  `POST /v2/ai/mandates/chat.default_new_chat`, and a user rebind to a different agent changed
  who answered, with no client deploy, and reverted on delete. Still un-converged and still
  resolving client-side to run: `useMandateRunner`/`useRunAgent` (4 consumers), the War Room /
  transcript-studio / content-ir sites that PERSIST an agent id, and the routing-only resolvers
  that compute a `/chat/a/<agentId>` href. _(The `useMandateRunner` half of that remainder was
  closed 2026-08-30 — see the changelog entry for that date.)_

- 2026-08-27 — **The client resolvers were HOLDER-BLIND; a workflow binding resolved to the
  system default.** `resolveMandate` / `resolveMandateServer` never selected `holder_type`, so a
  `holder_type='workflow'` binding (no `agent_id` by construction) fell through
  `if (binding.agent_id)` and returned the platform default with `provenance: "system"` — the
  opposite of the server, which refuses such a binding loudly. Both resolvers now select
  `id, holder_type` on both binding layers and gate on `EXECUTABLE_HOLDER_TYPES` before applying
  either half of the binding; `parseBindingWave1` stopped collapsing unrecognized holder types
  to `agent`; `ResolvedMandate` gained `holderType` (default `"agent"`). See THE HOLDER GATE
  invariant. Pinned by `__tests__/holder-type-resolution.test.ts` (15 tests, falsifiability
  checked — disabling the gate fails 6 of them). No workflow-Holder execution path was built.

- 2026-08-26 — **THE REWORK (vision section at top).** List rebuilt on the canonical
  entity-list shell over the new `mnd_list_scoped` RPC triple (first read surfaced 55
  mandates pinned behind latest); `MandateWorkspace` + stepwise `OverrideFlow` replace
  `MandateOverridesPage` (893) / `MandateOverrideEditor` (804) / `MandateOverridePanel` /
  `ConsumptionMapEditor` — DELETED; `MandateWindow`'s Yours pane and the admin drawer
  rewired onto the one core; org surface at `/organizations/[orgId]/settings/mandates`;
  version triple opened on `putMandateBinding`; settings step moved onto the canonical
  instance-overrides layer; client+SSR resolvers gained the ORG layer;
  `MandateAgentPicker`'s second write site stopped wiping consumption maps (+ the
  legacy-mandate `{}` 422 guard on both sites); `MandateDoorLink` emits the canonical
  filter URL. Live-verified end to end (binding created/removed through the UI;
  window/route parity). Wire truth: the consumption map is keyed by HOLDER INPUT name,
  `target` = offered value — three docstrings said the opposite (aidream router /
  provisions.py / provision-shapes.ts headers).

- 2026-08-26 — **Disclosure is top-menu only and surface-exact.** Deleted the stale inline/`PageAgents` doctrine and removed family expansion from `SurfaceMandatesSection`; the menu now contains only fixed jobs this exact surface already runs. Universal hosts remain unbound and disclosure never adds page content. `check:agent-disclosure` now hard-fails both inline disclosure and cross-surface expansion regressions.

- 2026-08-26 — **`mandateWindow`: mandates handled in place, never by leaving the page.** The window is the mandate twin of `AgentSettingsWindow` and wraps the canonical components (Yours = `MandateOverridePanel` + the resolution ribbon + notes for admins; Admin = `MandateDetailView` whole). It opens on the standing surface's own fixed-job mandates and loads only those rows — `fetchMandateConsoleData` gained a `mandateKeys` scope for exactly that. The menu's route links are gone.

- 2026-08-25 — **Mandate version diffs can no longer hide schema contract changes.** The production `seo.keyword_classifier` report traced to Growth Loop Collection Quality Judge v4→v5: v5 added the output-schema `__kind` property while the diff engine globally suppressed underscore-prefixed keys. Agent comparisons are now lossless, and the complete version/sync/restore contract also carries `input_kind`, so changing an agent's accepted Content IR kind is visible, versioned, restorable, and portable rather than a silent out-of-band mutation.
- 2026-08-25 — **THE DISCLOSURE LAW + notes on a mandate.** New `agent.mandate_note` (provisioned by `platform.create_entity_table`, `iam.canonical_certify_ok` true): the text, when, who, plus the surface and the holder agent as context. `notes.ts` + `MandateNotesPanel` compose in exactly two places — the Agents header menu (write it the second you notice something) and the admin drawer's Notes & observations section (read it when you judge the mandate). `ResolvedMandate` gained `mandateId`; `fetchMandateIdentities` is the batched label/id read chrome uses to LIST mandates without going through the run path. The original inline and family-expansion interpretation was corrected on 2026-08-26.

- 2026-08-24 — `useMandateSet` gained explicit `optionalKeys`: expected seedless mandates still return their refusal and disable only their affordance, without entering `system_error`. `/chat/new` marks the deliberately seedless `chat.quick_org_chart` chip optional; unexpected resolution failures remain loud.

- 2026-08-22 — Take-over pass: binding layer proven live (first real map-only user binding saved through Map inputs; DB check constraint fixed server-side, 0449); `agent.provision` local type widening deleted (generated types carry it); ROLLOUT F1/F6/F7/F8/F12/F15 call sites converted; `pnpm check:hardcoded-agents` at 0 baselined. Open: save toast hides the server 422 detail (`MandateOverrideEditor.tsx:372`); `overrides.ts` Wave-1 mirror stays until prod ships the fields.

- 2026-08-22 — **Last hardcoded call sites converted; `pnpm check:hardcoded-agents` baseline = 0.** Marketing page images → `marketing.image_prompt` / `marketing.page_image` / `marketing.page_image_all_in_one` (seedless → typed `step: "mandate"` refusal, never a silent two-step fallback); Tools-grid Smart Code Editor tiles → `code_editor.code_edit` via the window's `mandateKey` (personal-clone default id deleted). cx-chat `DEFAULT_AGENT_ID` SEED MIRROR marker made contiguous; the three user-selected picker rosters (`cx-chat agents.ts` BUILTIN_AGENTS SSR display seed, `local-agents.ts` DEFAULT_AGENTS, public-chat `AgentSelector` DEFAULT_AGENTS) are allowlisted with reasons in `scripts/hardcoded-agents-allowlist.json` — pickers are not selectors and not seed mirrors.
- 2026-08-22 — **ROLLOUT F6 + F8 migrated.** The code editor's three raw ids (`features/code-editor/agent-code-editor/agents.ts`) became mandate keys `code_editor.code_edit` / `code_editor.prompt_app_ui_edit` / `code_editor.dynamic_context_edit`, launched via `launchMandate`; the system-agent registry (`features/agents/constants/system-agent-registry.ts`) is now a builtinKey → mandateKey table (`agent_apps.metadata` / `agent_apps.auto_create` / `agent_apps.auto_create_lightning` / `chat.cx_default` / `tool_viz.component_generator` + the three above; `full-prompt-structure-builder` deleted — no launch site), and `executeBuiltinWith*Extraction` pass `mandateKey` into the launch funnel. The smart code editor resolves its roster through the existing `useMandateSet`.
- 2026-08-22 — **`pnpm check:hardcoded-agents` built** (ROLLOUT.md row X4, the frontend half): raw-agent-UUID guard modelled on `check:hardcoded-prompts` — SEED MIRROR / manifest `defaultAgentId` / reason-required allowlist exemptions, baseline ratchet seeded from the live sites at build time, wired into `run-release-gates.sh` in both modes. See the Guard paragraph above.
- 2026-08-22 — **The Provision system got a door.** Arman opened `/mandates` and saw
  nothing new: the list page had zero references to provisions, and `ConsumptionMapEditor`
  only mounted inside an already-expanded card, so a fully built, populated feature (153
  provisions; 227 of 302 mandates carry a `provision_key`) was invisible. `MandateCard` now
  carries a provision strip (key · offer size · consumed-vs-offered · pinned-context count)
  and an explicit **Map inputs** button; `focusConsumption` threads through
  `MandateOverridePanel` → `MandateOverrideEditor` to scroll and ring the Consumed values
  section on arrival; a **Mappable inputs** filter chip scopes the list. Offers for the
  whole page come from the new batched `fetchProvisions` (one chunked, cache-aware read —
  the N+1 that 227 per-card fetches would have been). The mapping UI itself was NOT forked:
  the same `ConsumptionMapEditor` and shared `ValueMapping` types.
- 2026-08-22 — **Wave 4 closeout — the Mandate Core Rollout is CLOSED server-side; this repo's Wave-2 surfaces are the normal path now.** Verified against the server this session: 298 declared mandates, 0 with no input contract (225 Provisions / 7 generic-`json`-only, 73 waivers), 152 Provisions, both ratchets closed (input baseline 289 → 0, blob-name 43 → 15), mandates suite 134 passed. `types/python-generated/provision-offers.ts` confirmed in sync at **152** offer shapes. Doc corrections only in this repo: the three `/Users/armanisadeghi/code/common-docs/...` pointers (system-of-record, master tracker, and the D4 law/register line) were broken absolute paths and are now repo-relative; the master-tracker line no longer calls the whole plan "proposed" (its Wave 0–4 core is done — only the workspace/UI experiences remain proposed); the Provision-era section leads with the final state. 🚨 **Outstanding cross-repo item, awaiting Arman:** ~118 client-invoked mandates cannot be classified from the server, so a matrx-frontend census of what each `POST /mandates/{key}` actually sends is what closes their input contracts (4 carry explicit "frontend census pending" waivers rather than guessed Provisions). That, and four other decisions the fleet surfaced and could not make alone, are at `/Users/armanisadeghi/code/common-docs/operations/data-to-kinds-queue.md` §6 (migrated out of aidream 2026-08-25; the other four decisions have since closed).
- 2026-08-22 — **Wave 2 of the Mandate Core Rollout (Provision → consumption map → holder).** New: `provision-shapes.ts` (leaf shapes + the ONE consumption-map funnel + wave-1 column narrowing), `provisions.ts` (`agent.provision` reads; clearly-marked local DB type until `pnpm db-types` can run), `ConsumptionMapEditor` (the full-offer editor — unused values calm, structured kinds context-only, optional values demand `when_absent`), `EffectiveConfigLayers` (agent → binding → pins, pins locked). `ResolvedMandate` gained `inputKind/outputKind/provisionKey/pins/pinnedContext` (client + SSR twin). `putMandateBinding` gained `holderType` + `consumptionMap` (local extension beside the stale generated request type). Contract-compare retuned: provision mandates judge input fit by consumes-⊆-offered (`compareConsumptionAgainstOffer`); editor + picker skip the superset check for them. Admin drawer facts gained Provision / Pins / Pinned context rows; the test bench gained the offer-driven structured composer. The shared `ValueMapping` union gained the neutral `offered_value` branch (surface editor/resolver refuse it loudly). `buildBindingTargets` consolidation: both agent-shortcut forks (batchModel, ShortcutEditorNext) now use the ONE surfaces util (they had dropped `defaultValue`, hiding agent defaults).
- 2026-08-21 — **THE DOOR LAW pass on the FEATURES that own mandates.** The platform's headline capability — swap the intelligence behind any step, no deploy — was reachable from exactly one feature surface (Podcast Studio); every other feature named `/mandates` only in code comments, so its users had no way in. Added one deep-linked door per domain in the pattern each surface already uses — **15 domains** across two waves: flashcards, education, tasks, research, agent_apps, masterwork, crm, workflow, transcript_studio, war_room, notes, seo, content_plan, growth_loop; SMS's existing bare link upgraded to `?feature=sms`. Introduced `MandateDoorLink` so wave two (and every future door) composes the same primitive instead of forking a `<Link>` per surface, and retrofitted wave one onto it. See the DOOR invariant above — it names the live doors, the domains deliberately left doorless, and the seven that still need one.
- 2026-08-21 — Added canonical Mandate fallback inheritance for ambient assistants, including cycle refusal and the database trigger that converts a changed inherited default into an explicit override.
- 2026-08-17 — **The Mandate-level context gate.** `agent.mandate.auto_context_disabled` (applied live, additive, default false) lets a Mandate cut context off even when its Holder would accept it. Rendered in the drawer's facts panel as a `Context` fact beside `Inputs` and `Output` — context is the third input channel, so it belongs where the contract is shown, not in a settings tab. Deliberately a COLUMN, not a key inside `contract`: `contract` is a server-seeded cache of the default agent's declarations and code truth re-seeds it, so a human decision stored there would be silently overwritten. **A GATE MAY ONLY NARROW** — the effective value is `holder OR mandate`, so when the Holder's own switch is off the control renders inert and names which side closed the door rather than implying the Mandate can enable anything. `MandateRow` carries `contextGateClosed` / `holderContextClosed` / `contextClosedEffective` as three separate facts so no surface can report one as the other. Written through the existing `updateMandateDefinition` patch allowlist. Verified live on `hindsight.reviewer` (toggled, persisted, copy switched to the "cuts context off even though its Holder would accept it" wording). The Agent-level half is [`features/agents/FEATURE.md`](../FEATURE.md) § Variables vs. context policies.
- 2026-08-17 — **Renamed to Mandates** (Arman, 2026-08-16; Vocabulary Law 4). `agent.slot_definition` / `slot_binding` / `slot_exemplar`, the `/agent-slots/*` API, and their `slot_*` fields are now `agent.mandate` / `mandate_binding` / `mandate_exemplar`, `/mandates/*`, and `mandate_*` end to end. `/agents/slots` and `/administration/agents/slots` remain only as permanent redirects. An Agent's `context_slots` column is a separate lineage, surfaced as **Context Policy**.
- 2026-08-16 — Added shared `splitMandateKey`; the admin registry now uses it for separate Feature/Mandate sort and filter columns, and the user override surface uses the same feature grouping parser.
- 2026-08-16 — Hardcoded-agent-definition purge. Four new client mandates declared in aidream `client_slots.py` (`voice.intro`, `transcript_studio.scribe_live`, `tool_viz.component_generator`, `orchestras.role_describer`) and synced live. Deleted from this repo: `INTRO_INSTRUCTIONS`, `LIVE_BASE_INSTRUCTIONS`, `COMPONENT_GENERATOR_SYSTEM_PROMPT`, `ORCHESTRATOR_SUPERVISOR_PROMPT`, `ORCHESTRATOR_USER_TEMPLATE`, plus the raw UUIDs `VOICE_INTRO_AGENT_ID` / `SCRIBE_LIVE_AGENT_ID` / `COMPONENT_GENERATOR_PROMPT_ID` / `ORCHESTRA_ROLE_DESCRIBER_ID`. The Conductor's `agent.template` b06689e3 was corrected in the live DB (supervisor prompt, marker intact) so the code override was no longer needed. New: `launchMandate` on `useAgentLauncher`, `features/voice-agent/agentInstructions.ts`, and the `check:hardcoded-prompts` guard. See the section above.

- 2026-08-10 — W3 review hardening: `MandateAgentPicker`'s pre-flight now FAILS CLOSED when the candidate's execution payload can't be loaded (`agx_get_execution_minimal` returns no row — inaccessible/deleted agent): the apply is blocked with "Could not verify this agent — it may be inaccessible or deleted", even when the mandate declares no contract requirements (an agent the RPC can't see is never silently bound). New optional `contractSource` prop: a consumer that DISPLAYS live system-agent requirements (research `AgentRoleCard`) passes that same live declaration so the pre-flight checks what the UI shows (`compareContracts`), falling back to the stored mandate contract while it loads. `invalidateMandateCache` now also clears the `pinCache` entry, and admin `updateMandateDefinition` fires it after every definition write — so any mounted consumer (incl. the admin mandates console, which now subscribes via `onMandateCacheInvalidated`) refreshes after a rebind from ANY surface, including the Linked Agent Sync window.

- 2026-08-10 — W3 canonicalization: absorbed research's proven override UI into this feature. New primitives: `contract-compare.ts` (the ONE three-state matched/missing/extra compare — `compareContracts` full-declaration form + `compareStoredContract` stored-contract form; research's two-state `checkMandateContract` clone deleted), `components/ContractItem.tsx` (canonical contract row, pending/matched/missing/extra), `components/MandateResolutionRibbon.tsx` (truthful precedence chain run-scope → user → org → system, `provenance` highlight, per-surface relabels), `components/OverriddenCountBadge.tsx` ("N of M overridden"), and `useCopyMandateAgent.ts` (the ONE Copy & Update: fork the exact record the server runs — version when pinned, master when floating, override master when set — with research's failure decomposition: a failed connect is an info toast, never a failed copy). `MandateAgentPicker` gained a controlled-override mode (`override` prop) so surfaces with their own override store (research `rs_topic.agent_config`) reuse the picker + contract pre-flight while keeping their write path; `MandateOverrideEditor`'s contract result now renders all three states via `ContractItem`. Research's `TopicAgentsPage`/`AgentRoleCard` are thin consumers (raw UUID-paste box deleted); the ribbon also sits on `/mandates` (page reference + per-card provenance) and the admin console drawer.

- 2026-08-10 — Documented the live-render gap above; content-plan's 7 setup mandates + brief writer migrated onto `useLiveAgentRun` (mandateKey-aware) with live output.
- 2026-08-09 — The shared override editor now uses the canonical on-demand `AgentListDropdown`; it shows the chosen agent (or “Keep system agent”) without permanently rendering the full catalogue in every expanded mandate.

- 2026-08-09 — DOOR LAW pass on `/mandates`: resolved/default/override agents are `EntityRef` doors, organization narratives link to their organization, and mandate-card headers permit legally nested door controls. Regression coverage lives in `components/__tests__/mandate-overrides-doors.test.tsx`.
- 2026-08-09 — `config_overrides` wired into the `launchAgentExecution` path: the thunk gained first-class `mandateKey` support, resolves the mandate, and seeds binding overrides into instance-model-overrides so the request carries them. Content-plan setup and flashcards TTS now use that path. Settings-only bindings therefore take effect there; the remaining durable-conversation persistence question is documented above.
- 2026-08-09 — Client placeholder sweep FINISHED (zero placeholders remain). `chat.default_new_chat` (the most-used swap in the product) migrated across every runtime consumer: `/chat/new` resolves at SSR via the new `service.server.ts` (`resolveMandateServer`, sharing `llm-params.ts` narrowing with the client), `beginFreshChat` resolves at call time, QuickChatSheet / RAG Agent Chat gate on `useMandate`, `openChatWindow` + the tools-grid Chat tile resolve at open time (tile `seedData` may now be async; activation awaits it), and the agentRunWindow registry default went to `null` (static data can't resolve a mandate — failure degrades to the window's agent picker, never a hardcoded id). `chat.cx_default` (demo SSR, loud seed-mirror fallback), `projects.creation_guide` (ProjectCreatePanel gates the AI tab on resolution), and `content_ir.kind_creator` (twin collapsed: rebound floating on the master; NewShapeClient/KindAgentButton/KindComponentFixBadge/assists/Surprise-me-UI all resolve the mandate) landed in the same pass. `prompts.categorizer` deleted (dead pin — `categorize_prompt` is retired). Remaining seed-mirror constants (`DEFAULT_NEW_CHAT_AGENT_ID`, cx-chat `DEFAULT_AGENT_ID`s, `PROJECT_CREATE_AGENT_ID`) are documented as such; new reads of them are defects.

- 2026-08-08 — War Room's three tier personas migrated (`war_room.thread` / `war_room.room` / `war_room.master`), the first call sites that PERSIST the resolved id. Added the persisted-id rule above (stored id wins on rebind; mandate governs creation only), the manifest seed-mirror ruling, and `useDurableAgentConversation` now idles on a null `defaultAgentId` rather than minting under a guess.
- 2026-08-08 — `useMandateRunner` added (the two-line consumer primitive) and the first migration wave landed: research Outputs Studio (per-card `MandateAgentPicker`, blog card consolidated onto `OutputCardShell`), content-plan setup's 7 agents, kind architect, agent-app coding agent, flashcards TTS — 13 hardcoded agent ids deleted and declared in aidream `client_slots.py`.
- 2026-08-08 — Binding writes rewired from direct RLS to the aidream bind endpoint (bind-time contract enforcement live; the "client-side only" gap is closed). Added `MandateOverridePanel` (shared with the admin console, which is now editable) and `MandateAgentPicker` (first consumer: podcast topic ideas). `useMandate` auto-refreshes on binding writes.
- 2026-08-08 — Created the user/org override surface (`/mandates`): browse + provenance + create/edit/delete bindings (agent swap and settings-only), client-side contract gate, org-admin tabs. Live-verified CRUD on a real user binding.
- 2026-08-08 — Synced the live binding API contract and normalized optional JSON object members before preserving an existing binding's `config_overrides`, keeping the strict API payload free of `undefined` values.
