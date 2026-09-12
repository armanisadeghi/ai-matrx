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

/**
 * Whether `AssociationsProvider` runs the package's `assertDemandedSchema`
 * probe on mount (D311, 2026-09-12). **FALSE, and it must stay false.**
 *
 * The probe INVOKES all 26 demanded RPCs with sentinel arguments to ask
 * whether each function exists. Fourteen of them are WRITES (`assoc_add`,
 * `assoc_set_targets`, `cat_delete`, `cmt_add`, `ues_set`, …). Measured on
 * `/administration/billing/spend`: 25 POSTs to `/rest/v1/rpc/<name>` answered
 * 400 on EVERY page load, ahead of the page's own reads — and the package's
 * `isDevelopmentBuild()` is `typeof process !== "undefined"`, true in the
 * browser bundle, so it fired in production too.
 *
 * THE CLASS RULE: a write RPC is never invoked to ask whether it exists.
 * Nothing replaces the probe because nothing needs to: the package's
 * `mapPgError` already turns PostgREST's PGRST202 (function not found) into
 * the same `demanded_schema_violation` scream, with the same remedy, at every
 * REAL call site. A wrong database still announces itself loudly, at the
 * moment it matters, and costs nothing on the loads where it is right.
 *
 * Lives here rather than beside its JSX so the guard test can assert the
 * shipped value without dragging the whole React host import graph in.
 */
export const PROBE_SCHEMA_AT_BOOT = false;

// The sentinel-args suppression that used to live here is
// GONE with the probe that produced them (D311). It existed only to keep the
// package's boot probe — 26 RPC invocations with `__not_a_uuid__`, 14 of them
// WRITES, 25 of them answered 400 on every page load — out of the Error
// Inspector. AssociationsHost now passes `probeSchema={false}` (see its
// header), so nothing calls these functions with sentinel arguments, and every
// error that reaches this seam is a real one that must be captured.

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
