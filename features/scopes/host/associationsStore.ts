// features/scopes/host/associationsStore.ts
//
// THE ONE provider-wiring module for `@ai-matrx/associations` (W5 swap,
// 2026-08-29): constructs the package store once per browser session and
// binds the three REQUIRED ports plus the entity overlay:
//
//   dataSource — the app supabase client singleton (answers every demanded RPC)
//   identity   — app auth: `requireUserId` (throws "Not authenticated", the
//                pre-extraction semantics) + `ensureOrgId` (active-org resolve
//                with the loud personal-org fallback)
//   errorSink  — `associationsErrorSink` → console.error + Error Inspector
//   overlay    — `ENTITY_OVERLAY` from registry/entityRegistry.ts (icons,
//                routes, rag/hr candidate loaders — host material)
//
// The five UI ports (notifier / windowShell / capture / pickerOverrides /
// entityDoors) are React chrome and bind on `<AssociationsHost>` (mounted in
// app/Providers.tsx), NOT here — this module stays import-inert for any
// non-React caller (the service wiring modules under ../service/).
//
// Construction is LAZY (first access), so importing this module costs nothing
// and never touches the supabase client at module-evaluation time.

import type { AssociationsStore } from "@ai-matrx/associations/core";
import { createAssociationsStore } from "@ai-matrx/associations/core";
import type { AssociationsDataSource } from "@ai-matrx/associations";
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { withOrganizationRefusalShown } from "@ai-matrx/chat/host/org";
import { associationsErrorSink } from "./errorSink";
import { getAssociationsEntityOverlay } from "@/features/scopes/registry/entityRegistry";

// D311 (2026-09-12): NOTHING here probes RPC existence, and nothing hides a
// probe's errors. @ai-matrx/associations 0.9.0 DELETED the boot probe and its
// `probeSchema` knob — it established that a demanded function existed by
// CALLING it (14 of the 26 are writes), which cost this app 25 rpc 400s on
// every page load. The class rule the package now holds: a write RPC is never
// invoked to ask whether it exists. PGRST202 at a real call site still screams
// `demanded_schema_violation` with a remedy.
//
// The sentinel-args Error-Inspector suppression that used to live at this seam
// went with the probe: every error reaching it now is a real one, and must be
// captured.

// Since @ai-matrx/associations 0.14.0 the port IS the supabase client: the package reaches
// every function through @ai-matrx/data's generated doors (`schema("public").rpc(...)`) and
// reads the four edge lists (assoc_for_entity / _sources / _targets / assoc_members_visible)
// COMPLETE itself — the host-side paging adapter (readAssociationPages) retired with it.
// Typed as the client itself (its `.rpc` serves the cmt_* seams); it satisfies the package port.
export const associationsDataSource = supabase;
const _port: AssociationsDataSource = associationsDataSource;
void _port;

let store: AssociationsStore | null = null;

/** The ONE package store instance for this app. Constructed on first access. */
export function getAssociationsStore(): AssociationsStore {
  if (!store) {
    store = createAssociationsStore({
      // The supabase client itself (the package pages its own edge lists).
      dataSource: associationsDataSource,
      identity: {
        requireUserId,
        // Org for created rows/edges (CategorySelect/CategoryTagPicker
        // create paths). `ensureOrgId(null)` resolves the SELECTED
        // organization and REFUSES when there is none — the personal-org
        // fallback was deleted on 2026-09-17, so this port now throws where
        // it used to invent. The package's errorSink reaches the Error
        // Inspector, which is an ADMIN surface: the person creating the
        // category would see a category that simply never appeared. So the
        // refusal is spoken here, and rethrown so the package still fails.
        ensureOrgId: () =>
          withOrganizationRefusalShown("created", () => ensureOrgId(null), {
            subject: "This item",
          }),
      },
      errorSink: associationsErrorSink,
      entityOverlay: getAssociationsEntityOverlay(),
    });
  }
  return store;
}
