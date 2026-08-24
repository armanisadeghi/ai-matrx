// features/connectors/google-status.ts
//
// The ONE mapping from first-party Google OAuth scopes to connector ids.
// ChatConnectorStrip and DirectoryConnectorCards both resolve "what has this
// user connected" through this module — a scope→connector mapping anywhere
// else is a fork of it.

import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import type { ConnectorId } from "./types";

/** Connector id → the scope whose presence on a live connection lights it up. */
export const GOOGLE_CONNECTOR_SCOPES = {
  "google-workspace": GOOGLE_SCOPE.driveFile,
  gmail: GOOGLE_SCOPE.gmailSend,
  "google-search-console": GOOGLE_SCOPE.webmastersReadonly,
} as const;

export type GoogleConnectorId = keyof typeof GOOGLE_CONNECTOR_SCOPES;

export function isGoogleConnectorId(id: ConnectorId): id is GoogleConnectorId {
  return id in GOOGLE_CONNECTOR_SCOPES;
}

type ScopeRow = Pick<GoogleConnectionSummary, "health" | "scopes">;

/** The live connection a connector would use, or undefined. */
export function googleConnectionFor<Row extends ScopeRow>(
  id: GoogleConnectorId,
  rows: readonly Row[],
): Row | undefined {
  return rows.find(
    (row) =>
      row.health === "connected" &&
      row.scopes.includes(GOOGLE_CONNECTOR_SCOPES[id]),
  );
}

/** Every Google-backed connector id the given connections light up. */
export function googleConnectedIds(rows: readonly ScopeRow[]): ConnectorId[] {
  return (Object.keys(GOOGLE_CONNECTOR_SCOPES) as GoogleConnectorId[]).filter(
    (id) => googleConnectionFor(id, rows) !== undefined,
  );
}

/**
 * A connection that once held the scope but is no longer healthy — the
 * "reconnect this account" state, distinct from never-connected. Only
 * meaningful when `googleConnectionFor` returned nothing.
 */
export function googleStaleConnectionFor<Row extends ScopeRow>(
  id: GoogleConnectorId,
  rows: readonly Row[],
): Row | undefined {
  return rows.find(
    (row) =>
      row.health !== "connected" &&
      row.scopes.includes(GOOGLE_CONNECTOR_SCOPES[id]),
  );
}
