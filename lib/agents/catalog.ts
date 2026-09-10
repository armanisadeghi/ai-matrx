// lib/agents/catalog.ts
//
// THE host wiring for `@ai-matrx/agents/catalog` — the ONE agent picker.
//
// Owner ruling (Arman, 2026-09-08, D1): the picker and ALL its logic live in
// the package; this app receives `onSelect(agentId)` and nothing more. There
// is no second list store anywhere in this repo.
//
// C22 CENSUS — every line below INJECTS APP IDENTITY. Nothing here catches,
// retries, validates, or branches on package behaviour:
//
//   client    → `@/utils/supabase/client`, the app's ONE browser singleton.
//   identity  → `requireUserId` from `@/utils/auth/getUserId`, the app's ONE
//               synchronous Redux identity read (the same one the
//               `@ai-matrx/associations` host binds). It THROWS when there is
//               no session — never a silent anonymous read.
//   transport → ONE `createMatrxTransport(store.getState)`, the same
//               production pipeline `useRunAgent` and the execution system
//               ride. Needed only because a picker may pass
//               `defaultMandateKey`, and clients NEVER walk the mandate
//               ladder themselves (platform rule D-R1) — the package resolves
//               the Holder through the aidream door.
//   errorSink → `captureError` from `@/lib/diagnostics` (source
//               `"agent-catalog"`), so a failed catalogue read lands in the
//               same inspector every other failure does.
//   notifier  → `toast` from `@/lib/toast`, the app's ONE toast entry point.
//               The package's in-picker banner is still the primary scream.
//
// The catalog is created ONCE, lazily, and registered on `globalThis` by the
// package (`Symbol.for("ai-matrx.agents.catalog")`), so the React provider and
// the `agent-definition` registry hydrators share exactly one instance.

import {
  createAgentCatalog,
  getRegisteredAgentCatalog,
  type AgentArchFilter,
  type AgentCatalog,
  type AgentCatalogClient,
} from "@ai-matrx/agents/catalog";
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toast } from "@/lib/toast";
import type { RootState } from "@/lib/redux/store";

/**
 * Thrown when the catalogue is asked for before the Redux store exists. The
 * transport reads credentials and the active org out of Redux on every call,
 * so there is no honest catalog without it.
 */
export class AgentCatalogNotReadyError extends Error {
  override readonly name = "AgentCatalogNotReadyError";
  constructor() {
    super(
      "The agent catalog was requested before the Redux store was created. " +
        "Every consumer sits under <StoreProvider>; call this from inside the " +
        "React tree (or after store creation), never at module scope.",
    );
  }
}

/**
 * THE ARCHIVED-ITEMS LAW's knob, in the package's words.
 *
 * The user preference (`userPreferences.lists.archivedDefault`) has two
 * states because that is all a person is offered — "hide archived" and "show
 * all". The package's control has three (`active` | `both` | `archived`),
 * because a list can also be narrowed to the archive alone from the control
 * itself. `"all"` is the package's `"both"`; there is no preference value that
 * maps to `"archived"`, and a person still reaches it in one click.
 *
 * Exported so the mapping is a tested fact rather than an inline expression:
 * an illegal value makes `createAgentCatalog` throw (a silently-ignored
 * setting is a knob that lies about being a knob).
 */
export function toCatalogArchiveFilter(
  archivedDefault: "active" | "all",
): AgentArchFilter {
  return archivedDefault === "all" ? "both" : "active";
}

/**
 * THE catalog. Created on first use and shared across loader graphs by the
 * package's own `globalThis` registry.
 *
 * `archiveFilter` seeds THE ARCHIVED-ITEMS LAW's default for every consumer
 * the catalog will ever register. It is honoured ONCE, at creation: the user
 * preference rehydrates after first paint, so `AgentCatalogHost` owns the
 * late-knob reconciliation for consumers that registered before the knob
 * landed (and for every later change of it).
 */
export function getAgentCatalog(options?: {
  archiveFilter?: AgentArchFilter;
}): AgentCatalog {
  const existing = getRegisteredAgentCatalog();
  if (existing) return existing;

  const store = getStoreSingleton();
  if (!store) throw new AgentCatalogNotReadyError();

  return createAgentCatalog({
    ...(options?.archiveFilter
      ? { defaults: { archiveFilter: options.archiveFilter } }
      : {}),
    // supabase-js satisfies the package's structural client as-is; the cast
    // narrows this app's generated `Database` generics onto the package's
    // deliberately generic seam (it types over `unknown` on purpose).
    client: supabase as unknown as AgentCatalogClient,
    identity: { requireUserId },
    transport: createMatrxTransport(store.getState as () => RootState, {
      source: "agentCatalog",
    }),
    errorSink: (event) => {
      captureError({
        source: "agent-catalog",
        message: event.message,
        code: event.code,
        ...(event.context ? { raw: event.context } : {}),
      });
    },
    notifier: (event) => {
      if (event.level === "error") toast.error(event.title, { description: event.message });
      else toast.warning(event.title, { description: event.message });
    },
  });
}
