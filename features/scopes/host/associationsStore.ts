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
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { associationsErrorSink } from "./errorSink";
import { getAssociationsEntityOverlay } from "@/features/scopes/registry/entityRegistry";

let store: AssociationsStore | null = null;

/** The ONE package store instance for this app. Constructed on first access. */
export function getAssociationsStore(): AssociationsStore {
  if (!store) {
    store = createAssociationsStore({
      // Structural subset — a supabase-js client satisfies rpc/from/schema.
      dataSource: supabase,
      identity: {
        requireUserId,
        // Org for created rows/edges (CategorySelect/CategoryTagPicker
        // create paths). `ensureOrgId(null)` resolves the active org and
        // falls back LOUDLY to the personal org — pre-extraction semantics.
        ensureOrgId: () => ensureOrgId(null),
      },
      errorSink: associationsErrorSink,
      entityOverlay: getAssociationsEntityOverlay(),
    });
  }
  return store;
}
