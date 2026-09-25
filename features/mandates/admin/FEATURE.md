# Mandates admin console

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/mandates/ — read it before touching this feature in ANY repo.

Routes: `/administration/mandates` (`MandatesConsole.tsx`, list only) · `/[mandateKey]` (`AdminMandateWorkspacePage.tsx` = `MandateWorkspace host="admin-route"`; Test/Permissions/Source & Usage/Diagnostics tab bodies render `MandateDetailView`) · `/new` (`../authoring/NewMandatePage.tsx`) · `/advanced` (`advanced/AdvancedMandateCrud.tsx`) · `/references` (`MandateReferenceBoardView.tsx`) · `/list-preview`, `/record-preview/[key]`, `/window-preview`, `/dashboard-preview`, `/overrides-preview/[key]`.

Map: `service.ts` (console bundle, code-truth `GET /mandates/code-truth`, `POST /mandates/{key}/variable-verdicts`) · `mandate-health.ts` (`MandateRow`/`buildRow`, ONE worst-first health order) · `MandateDetailPanel.tsx` (`MandateDetailView`) · `MandateTestBench.tsx` + `TryItNowPanel.tsx` + `ProvisionOfferComposer.tsx` + `bench-draft.ts` · `impact.ts`/`impact-cells.tsx`/`impact-advance.tsx`/`ImpactBatchPanel.tsx`/`impact-settings-fix.tsx`/`useAgentChangeReach.tsx` (Agent Change Impact; window `features/window-panels/windows/mandates/ImpactBatchWindow.tsx`) · `rebind-impact.ts` + `useGuardedRebind.tsx` + `variable-verdict-presentation.tsx` · `mandate-actions.tsx` · `references.ts` + `MandateSourceUsage.tsx`. Surface: `matrx-admin/mandates` (`features/surfaces/manifests/mandates.manifest.ts`; write targets `select_mandate`, `mandate_exemplar_draft` — JUDGMENT BAR in the manifest before adding a third); the mandate page is `matrx-admin/mandate-workspace` (`mandate-workspace.manifest.ts`, target `mandate_goal_draft`).

Landmines:
- Every protected read/mutation establishes a browser session before building a Supabase query or `callApi`; wait for the explicit Redux `organization_id` before coverage/goals/code-truth.
- Admin system-default picker offers system agents only (`selectBuiltinAgents`); never a raw `.from("definition")` list.
- Code-truth read allows 60 s to headers; failures stay visible (amber banner), `console.warn` not `console.error`.
- Key `MandateEditor`/`MandateTestBench`/`MandateOverridePanel` by mandate id; keep the Test section `keepMounted` (it registers the write handler); `MandateDetail` root is `h-full min-h-0 overflow-y-auto`.
- Visible copy says "test case", never "exemplar" (DB/API names keep `exemplar`); no raw `JSON.stringify` in the UI.
- Batch bench needs ≥1 candidate; batch `callApi` uses a 10-minute connection deadline, no total deadline.
- Agent references are `EntityRef` with an `href` override (system agents `/administration/agents/system-agents/agents/<id>`, personal `/agents/<id>`); version door `…/latest`.
