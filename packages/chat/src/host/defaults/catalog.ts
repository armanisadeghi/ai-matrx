/**
 * Default catalog: the one already registered in this page, else one built
 * over `db` (registered, so every later reader shares it). Built on first use.
 */

import {
  createAgentCatalog,
  getRegisteredAgentCatalog,
  type AgentCatalog,
  type AgentCatalogClient,
} from "@ai-matrx/agents/catalog";
import type {
  ChatDb,
  ChatDiagnosticsPort,
  ChatIdentityPort,
} from "../contract";

export function createDbCatalogGetter(
  db: ChatDb,
  identity: () => ChatIdentityPort,
  diagnostics: () => ChatDiagnosticsPort,
): () => AgentCatalog {
  return () =>
    getRegisteredAgentCatalog() ??
    createAgentCatalog({
      // supabase-js satisfies the catalog's structural client as-is.
      client: db as unknown as AgentCatalogClient,
      identity: {
        getUserId: () => identity().current().userId,
        requireUserId: () => {
          const userId = identity().current().userId;
          if (!userId)
            throw new Error("The agent catalog needs a signed-in person.");
          return userId;
        },
      },
      errorSink: (event) =>
        diagnostics().capture(new Error(event.message), {
          area: "catalog",
          code: event.code,
          detail: event.context,
        }),
    });
}
