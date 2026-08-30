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
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { associationsErrorSink } from "./errorSink";
import { getAssociationsEntityOverlay } from "@/features/scopes/registry/entityRegistry";
import { suppressSupabaseErrorCapture } from "@/lib/diagnostics/supabaseErrorCapture";

const DEMANDED_SCHEMA_PROBE_SENTINELS = new Set([
  "__not_a_uuid__",
  "__probe__",
]);

/**
 * The package's development-only demanded-schema check intentionally calls
 * each RPC with impossible sentinel values. Those expected Postgres errors
 * prove that the function exists; they are not application failures and must
 * not fill the global Error Inspector. The package still receives the raw
 * result and remains responsible for screaming when a function is missing.
 */
export function isDemandedSchemaProbeArgs(value: unknown): boolean {
  if (typeof value === "string") {
    return DEMANDED_SCHEMA_PROBE_SENTINELS.has(value);
  }
  if (Array.isArray(value)) {
    return value.some(isDemandedSchemaProbeArgs);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(isDemandedSchemaProbeArgs);
  }
  return false;
}

/**
 * The supabase client, narrowed to the package's structural dataSource
 * contract. The thin wrapper exists because handing tsc the FULL generated
 * `SupabaseClient<Database>` generic against the port's `DemandedRpcName`
 * union blows the instantiation-depth budget (TS2589) — the runtime object
 * is the client itself, untouched.
 */
// One deliberate unknown-cast at this boundary: relating the client's huge
// overloaded generics to the port type directly is what triggers TS2589, so
// we detach from the generated generics first. The methods are bound to keep
// supabase-js `this` semantics.
const client = supabase as unknown as {
  rpc: AssociationsDataSource["rpc"];
  from: NonNullable<AssociationsDataSource["from"]>;
  schema: NonNullable<AssociationsDataSource["schema"]>;
};
export const associationsDataSource: AssociationsDataSource = {
  rpc: (fn, args) => {
    const call = client.rpc(fn, args);
    if (isDemandedSchemaProbeArgs(args)) {
      return suppressSupabaseErrorCapture(call);
    }
    if (fn !== "cmt_add") return call;
    // The cmt_add tap (W6 comments adoption): EVERY comment post — the
    // package CommentThread composer, the store service, any host caller —
    // crosses this one seam, so the task "someone commented" notification
    // fires here instead of inside a per-composer helper (the behavior the
    // deleted taskService.createTaskComment carried). Fire-and-forget on
    // success only; dynamic import keeps tasks code out of this module's
    // import graph (and out of every non-React service consumer).
    return call.then((res) => {
      if (
        !res.error &&
        args?.p_entity_type === "task" &&
        typeof args.p_entity_id === "string" &&
        typeof args.p_body === "string"
      ) {
        const { p_entity_id, p_body } = args;
        void import(
          "@/features/tasks/services/taskCommentNotification"
        ).then(({ sendTaskCommentNotification }) =>
          sendTaskCommentNotification(p_entity_id, p_body),
        );
      }
      return res;
    });
  },
  from: (table) => client.from(table),
  schema: (name) => client.schema(name),
};

let store: AssociationsStore | null = null;

/** The ONE package store instance for this app. Constructed on first access. */
export function getAssociationsStore(): AssociationsStore {
  if (!store) {
    store = createAssociationsStore({
      // Structural subset — the supabase client behind a depth-safe wrapper.
      dataSource: associationsDataSource,
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
