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
 * THE catalog. Created on first use and shared across loader graphs by the
 * package's own `globalThis` registry.
 */
export function getAgentCatalog(): AgentCatalog {
  const existing = getRegisteredAgentCatalog();
  if (existing) return existing;

  const store = getStoreSingleton();
  if (!store) throw new AgentCatalogNotReadyError();

  return createAgentCatalog({
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
