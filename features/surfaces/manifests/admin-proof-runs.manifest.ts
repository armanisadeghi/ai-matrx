import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue, SurfaceValueGroup } from "@/features/surfaces/types";
import { mergeBaselineValues } from "./_baseline.manifest";

export const ADMIN_PROOF_RUNS_SURFACE_NAME = "matrx-admin/proof-runs";
const groups: SurfaceValueGroup[] = [{ key: "proofs", label: "Proof runs", sortOrder: 100, description: "Proof check status, recent run receipts, and the currently opened run." }];
const values: SurfaceValue[] = [
  { name: "proof_checks", label: "Proof checks", description: "Loaded proof check status records. Empty while none are available.", valueType: "array", alwaysAvailable: true, typicalCharCount: 4000, autoContext: false, group: "proofs", sortOrder: 100 },
  { name: "recent_runs", label: "Recent runs", description: "The 25 most recent proof run summaries. Empty when no runs have occurred.", valueType: "array", alwaysAvailable: true, typicalCharCount: 5000, autoContext: false, group: "proofs", sortOrder: 110 },
  { name: "open_run", label: "Open run", description: "Full receipt for the selected run. Empty when no run is selected.", valueType: "object", alwaysAvailable: false, typicalCharCount: 4000, group: "proofs", sortOrder: 120 },
];
export const adminProofRunsManifest: SurfaceManifest = { surfaceName: ADMIN_PROOF_RUNS_SURFACE_NAME, client: "matrx-admin", executionMode: "python-stream", description: "", label: "Proof runs", readiness: "partial", readinessNote: "The page emits current check and run data; canonical context-menu and complete binding audit remain.", urlPattern: "/administration/compute/proof-runs", intro: `<surface_intro>This administrator view runs provider-backed proof checks and shows their recorded receipts. Recent runs are capped at 25 and an opened run contains the detailed proof record.</surface_intro>`, groups, values: mergeBaselineValues([], values) };
export function createAdminProofRunsScope(values: { proof_checks: unknown[]; recent_runs: unknown[]; open_run?: unknown }): SurfaceScopePayload { return values as SurfaceScopePayload; }
