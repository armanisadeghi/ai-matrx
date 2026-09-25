# Mandates — frontend

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/intelligence/mandates/ (owner rulings: `UI-REGISTER.md`) — read it before touching this feature in ANY repo.

## Routes
| Route | File | Host / perspective |
|---|---|---|
| `/mandates` | `app/(core)/mandates/page.tsx` → `browse/MandatesBrowsePage` | list (legacy `?feature=` → `?filters=` via `browse/url-compat.ts`, load-bearing) |
| `/mandates/[mandateKey]` (key or uuid) | `app/(core)/mandates/[mandateKey]/page.tsx` | `MandateWorkspace host="route"` → person |
| `/organizations/[orgId]/settings/mandates{,/[mandateKey]}` | route files | `host="route" principal={kind:"org"}` → organization; admin/owner gated |
| `/organizations/[orgId]/mandates{,/new,/[mandateKey]}` | `member-list/`, `authoring-level/NewSoftMandatePage`, `record-next/MandateRecordPage` | new member-level list / soft-mandate create / record |
| `/mandates/{list,new,record}-preview` | same components | member copies (person seat) |
| `/intelligence{,/[feature]}` | `feature-intelligence/` | per-feature intelligence pages |
| `/administration/intelligence/mandates` | `admin-list/MandateAdminListPage` | THE admin list (Intelligence → Mandates) |
| `…/[mandateKey]{,/overrides}` | `record-next/MandateRecordPage`, `overrides-simple/OverridesPreviewPage` | system-seat record, simple Overrides |
| `…/dashboard` · `…/health` · `…/unconverted` · `…/window` | `dashboard/MandateDashboard`, `code-references/MandateHealthPage`, `code-references/UnconvertedCallsPage`, `record-next/WindowPreviewPage` | reached from the list header (`admin-list/MandateAdminPagesNav`) |
| `/administration/mandates` + `[mandateKey]`, `new`, `advanced`, `references` | see `admin/FEATURE.md` | the owner's ORIGINAL pages — untouched, no redirects until he validates the new suite |
| window | `features/window-panels/windows/mandates/MandateWindow.tsx` (opener `features/overlays/openers/mandateWindow.tsx`); new copy `windows/mandates-next/MandateWindowNext.tsx` | Yours pane = person; Admin pane = `MandateDetailView` |

Every admin-suite href is built in `admin-routes.ts` (`adminMandateRecordHref`, `ADMIN_MANDATES_*`, `CLASSIC_ADMIN_MANDATES`) — never hand-built. Route → surface: `features/surfaces/utils/route-to-surface.ts` `resolveMandateSuiteSurface` (record pages at every seat → `matrx-admin/mandate-workspace`; the suite's other pages → `matrx-admin/mandates`; member lists → none).

## Admin list (`admin-list/`)
- Server read: `public.mnd_admin_list` (`rpc.ts`; SQL `migrations/mnd_admin_list_server_read_2026_09_24.sql` + `mnd_admin_list_sources_contract_page_rows_2026_09_25.sql`) — scope, search, every filter/sort/facet, counts, in the database. ONE call per page: the `page` answer carries its own definition rows, bindings and holders (`console` → `service.ts consoleDataFromPage`), built by the one row builder (`rows.ts` → `admin/mandate-health.ts buildRow`).
- aidream reports (code truth, coverage, agent + workflow impact) load in parallel behind the first paint (`store.ts`); `facts.ts` packs only the sections a query needs into `p_facts`. `sources` is a request, not a fact: it makes the database compute the code-scan columns (~0.5 s) only when one is filtered/sorted, and for facets.
- Columns (`columns.tsx`, values `fields.ts`): Contract (`contractCheck`: Mismatch / Matches / Not checked, persisted verdicts), Declared in / Called from / Call sites / Language (`declaredRepos`, `calledFrom`, `callSites`, `languages` — cells from `code-references/data.ts fetchMandateSourceFacts` for the page's keys, after the paint). "Code declaration" (`declaredIn`) is the code-truth column.
- Batch: "Review as batch" (agent pins, `ImpactBatchPanel`); "Advance selected" moves agent pins (`admin/impact-advance.tsx`) AND workflow pins (`admin/workflow-advance.tsx` — through `putMandateDefaultHolder` / `putMandateBinding`, re-sending the stored settings; no server workflow-advance door exists).
- Dashboard tiles open the list pre-filtered (`dashboard/list-link.ts`), Health, or Unconverted (`unconvertedCallsHref("waiting")`).
- Timing: `ORIGIN=http://localhost:3001 node scripts/mandate-list-first-paint.mjs` (first real row + every report cell).

## Map
- Resolution (display side): `service.ts` (`resolveMandate`, `fetchMandatePins`, `invalidateMandateCache`/`onMandateCacheInvalidated`), `service.server.ts` (`resolveMandateServer`, SSR), `seed.server.ts`, `useMandate.ts`, `useMandateSet.ts` (set primitive; `enabled:false` = no requests), `llm-params.ts` (shared `config_overrides` narrowing).
- Contract: `contract.ts` (leaf: `parseMandateContract`, `missingRequiredVariables`, `missingVariablesMessage`), `contract-compare.ts` (`compareStoredContract` legacy, `compareConsumptionAgainstOffer` provision), `output-contract.ts`, `input-surface.ts` (served, never derived).
- Keys: `@ai-matrx/agents/mandates` (`MANDATE_KEYS`, `MandateKey`, `isMandateKey`, `mandateKeyOfApp`/`mandateKeyOfShortcut` → `DynamicMandateKey`); `mandate-key.ts` (`splitMandateKey`, first-dot split); `mandate-address.ts`.
- Provision: `provision-shapes.ts` (leaf: `parseOfferedValues`, `parseConsumptionMap`, `consumptionMapProblems`, `valueMappingsProblems`, `assertMappingsAreAnswerable`, `holderNotExecutableMessage`), `provisions.ts` (`fetchProvision`, batched `fetchProvisions`, 5-min cache, chunks of 100).
- Writes: `overrides.ts` (`putMandateBinding`/`removeMandateBinding` → aidream `PUT/DELETE /mandates/{key}/binding`), `workspace/save-payload.ts` (`buildBindingSavePayload`), `features/bindings/OneBindingWorkspace.tsx` + `HolderAssignment.tsx` + `system-answer-record.ts` + `HolderDraftPanel.tsx` (+ Agent).
- List: `list-door.ts` (ONLY client of `public.mnd_list_scoped`; keeps 42501 refusal whole), `browse/` (`listConfig.tsx`, `columns.tsx`, `CoverageBadge.tsx`, `useCoverageList.tsx`, `useMandateRowActions.tsx`, `url-compat.ts` → `mandatesBrowseHref`, `adminMandateHref`), `member-list/`, `admin-list/`.
- Coverage: `coverage.ts` (`fetchMandateCoverage`, `fetchMandateCoverageStates`), `workspace/MandateCoverageAlert.tsx`.
- Workspace: `workspace/MandateWorkspace.tsx` (`WorkspacePerspective` derived once from host), `TriadSections.tsx`, `Section.tsx`, `useMandateWorkspaceData.ts`, `useMandateLadder.ts`, `system-rung-health.ts`, `DefinitionEditHelp.tsx`; `record-next/` (URL-tab record page; member seats: `owner-service.ts` → aidream `GET /definition-rights`, `PATCH /definition`, `POST /try`; `OwnerDefinitionEditor.tsx` + the goal/provision pencils appear only when the server's rights say `can_edit` — a soft, non-system mandate its creator or home-org owner/admin owns; `MandateTryPanel.tsx` = the member Test tab, runs as the viewer, renders through `MandateTryResultView` (kind component → `StructuredValueView` → markdown/media, never JSON). `TriadSections.tsx`'s "admin route only" header predates the owner model — the copy passes `authoring` for owners).
- Authoring: `authoring/` (admin `NewMandatePage`), `authoring-level/` (user/org soft mandates → `POST /mandates/soft`).
- Notes: `notes.ts` (`agent.mandate_note`), `components/MandateNotesPanel.tsx` (two mounts only: Agents menu row, admin Notes).
- Feature intelligence (the per-feature page + the Intelligence icon): `feature-intelligence/` — see its `FEATURE.md`.
- Doors/UI: `components/MandateDoorLink.tsx`, `components/MandateAgentPicker.tsx`, `components/EffectiveConfigLayers.tsx`.
- Instructions reader: `features/voice-agent/agentInstructions.ts` (`useMandateAgentInstructions`, `readInstructionsFromAgent`).
- Launch path rule: `features/agents/redux/execution-system/utils/resolve-start-path.ts`.

## Guards
`pnpm check:mandate-keys` (+`:self-test`; allowlist `scripts/mandate-keys-allowlist.json`, reason required) · `pnpm check:hardcoded-agents` (baseline `scripts/hardcoded-agents-baseline.json`, allowlist `scripts/hardcoded-agents-allowlist.json`; ratchet down only) · `pnpm check:hardcoded-prompts` (allowlist `scripts/hardcoded-prompts-allowlist.json`) · `pnpm check:agent-disclosure` · `pnpm check:mandate-references` (`matrx-mandate-scan`) · `pnpm check:mandate-fallback-pin` · `pnpm check:mandate-pin-names-agent` · `pnpm check:admin-catalog` · ESLint `matrx/no-raw-agent-list-query`. Key tests: `__tests__/one-resolution.test.ts`, `__tests__/mandate-organization-pending.test.tsx`, `__tests__/document-variable-precondition.test.ts`, `__tests__/one-preflight-every-writer.test.ts`, `__tests__/mandate-screen-vocabulary.test.ts`, `workspace/__tests__/workflow-holder-payload.test.ts`, `features/bindings/__tests__/system-answer-record.test.ts`, `browse/__tests__/url-compat.test.ts`, `browse/__tests__/one-value-per-column.test.ts`, `browse/post-cutover-rpc.test.ts`, `admin-list/__tests__/`, `dashboard/__tests__/`, `features/surfaces/utils/__tests__/admin-mandate-route.test.ts`, `features/admin/constants/admin-navigation.test.ts`.

## Landmines
- Never type a mandate key literal — import the `MANDATE_KEYS` member (`.` → `__`). A parsed STORED ref does not narrow; the server is the authority.
- Never `.insert()/.update()` `mandate.binding` from the client — write through `putMandateBinding`; show the server's 422 detail verbatim.
- Every save on a provision mandate re-sends the FULL `consumption_map`; `config_overrides` falls back to the stored value when the settings step never opened; a legacy mandate sends NO map (`undefined`, never `{}`).
- `consumptionMapProblems(offer)`: `null` = offer unknown here; never pass `{ values: [] }` for that.
- Launch by `mandateKey` (`launchAgentExecution`, `useHeadlessAgentJson`, `useLiveAgentRun`, `launchMandate`) — never a resolved id alone, never echo mandate-derived `config_overrides`; `agentId` alongside is paint-only; `mandateKey` excludes `shortcutId`.
- `resolveMandate` authenticates before any read and caches per user; `organizationPending` renders a wait state, never the "bind an agent" remedy.
- The browser resolver runs `agent` Holders only; anything else refuses (never fall back to the system default).
- A resolve-then-launch surface pre-checks `missingRequiredVariables` and renders `missingVariablesMessage`; blank counts as missing.
- A door is `MandateDoorLink` (`variant="icon"|"inline"`; `HeaderAction` passes `icon: "BrainCircuit"`); admin URLs via `adminMandateHref`; a mandate named on a working surface opens `useOpenMandateWindow`, never a `<Link>`.
- Disclosure = manifest `agentRoles[].mandateKey` or UI-free `useDeclaredSurfaceMandates`; never visible page content.
- Agent option lists come from the Redux listing (`fetchAgentsListFull` + `selectOwnedAgents`/`selectSharedWithMeAgents`); settings overrides ride `instanceModelOverrides` + `RunConfigOverrides` + `selectSettingsOverridesForApi` only.
- The system answer (holder, map, settings, auto-run) lives ONLY on the mandate's own default (`default_holder_*` + `default_consumption_map` / `default_config_overrides` / `default_auto_run`, aidream 1037, Arman 2026-09-25), written through `putMandateDefaultHolder(…, settings)`; there is no global rung anywhere (aidream 1041: `mandate._rungs` returns none, CHECK `binding_no_live_global`, binding types are `user | org`; guard `features/bindings/__tests__/system-answer-record.test.ts`). A "Global" scope choice lands on the default rung.
- Coverage: never re-derive green/orange/red; a key absent from `states` is unanswered, not assigned.
- Notes carry an explicit `organization_id` (`ensureOrgId`); never fed to an agent.
- A call site that PERSISTS an agent id: the mandate decides only new records; surface-manifest `defaultAgentId` is a `SEED MIRROR`, never an authority.
- `EffectiveConfigLayers` renders stored pin keys only ("Constraints: None" when empty); never claim runtime enforcement.
- New AI step: declare in aidream `aidream/services/mandates/client_mandates.py`, release, then use the generated `MANDATE_KEYS` member; hardcoded-id sweep recipe = run site → `mandateKey`; non-run site → `useMandate` + gate; thunk → `await resolveMandate`.
