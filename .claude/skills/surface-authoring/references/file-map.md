# Surface authoring — file map

Read this when you need the location of a surface type, helper, service, API route, admin UI, or check.

## Quick reference — file map

| What | Where |
|---|---|
| `SurfaceManifest` / `SurfaceValue` / `SurfaceValueGroup` / `ValueMapping` types | `features/surfaces/types.ts` |
| Canonical label helpers (`getSurfaceDisplayLabel`, `surfaceValueLabels`, `surfaceGroupLabels`) | `features/surfaces/utils/surface-display.ts` |
| Locate-on-page (`data-surface-value` flash) | `features/surfaces/utils/locate-on-page.ts` |
| Hierarchy (registry-backed, synchronous) | `features/surfaces/runtime/fetchRelatedSurfaces.ts` + `registry.ts` `getSurfaceAncestry`/`getSurfaceChildren` |
| Baseline values + helpers | `features/surfaces/manifests/_baseline.manifest.ts` |
| Central registry (`RAW_MANIFESTS` → derived `ALL_MANIFESTS`) | `features/surfaces/manifests/registry.ts` |
| **Reference implementation (full contract)** | `features/surfaces/manifests/marketing-page.manifest.ts` + `features/marketing/lib/marketing-page-scope.ts` |
| Simple-case reference | `features/surfaces/manifests/notes-editor.manifest.ts` |
| Binding service (associations edges) | `features/surfaces/services/bind-agent-to-surface.service.ts` |
| Per-manifest README | `features/surfaces/manifests/README.md` |
| Sync service (diff + upsert; mirrors label/value_groups/group_key) | `features/surfaces/services/manifest-sync.service.ts` |
| Sync SQL emitter (agent-shell path) | `scripts/emit-surface-sync-sql.ts` |
| Sync API (admin-gated) | `app/api/admin/surfaces/sync-manifests/route.ts` |
| Drift API (admin-gated) | `app/api/admin/surfaces/drift-report/route.ts` |
| Runtime resolver | `features/surfaces/utils/value-mapping-resolver.ts` |
| Launch thunk integration | `features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts` |
| Admin UI | `app/(authenticated)/(admin-auth)/administration/ui/surfaces/` |
| Agent-side binding UI | `app/(a)/agents/[id]/surfaces/page.tsx` + `features/surfaces/components/AgentSurfacesPanel.tsx` |
| Drift check (manual — in `pnpm check:release-gates`, NOT commit/CI-run) | `scripts/check-surface-drift.ts` (`pnpm check:surface-drift`) |
| **Route-coverage check** — phantom mappings fail, undeclared routes report | `scripts/check-surface-routes.ts` (`pnpm check:surface-routes`) |
| Candidate catalog (for the admin "add" dialog) | `features/surfaces/data/surface-candidates.ts` |
