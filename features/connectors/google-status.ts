// features/connectors/google-status.ts
//
// The ONE mapping from first-party Google OAuth scopes to what a person can do,
// and the ONE reader of "what has this user connected".
//
// Since 2026-09-17 it is DERIVED from `provider-config.ts` rather than listing
// scopes of its own: the provider config declares each product's grant bundle,
// and this module projects it two ways — by product key (the connector
// primitive: card, dialog, health rows) and by the older connector-registry id
// (the chat strip and the directory cards). Two maps of the same fact is how a
// new product lights up in one surface and stays dark in the other, so there is
// exactly one, here, and it is generated.

import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import {
  GOOGLE_CONNECTOR_PROVIDER,
  productGrantScopes,
} from "./provider-config";
import type { ConnectorId } from "./types";

/**
 * Product key → the scope whose presence on a live connection proves it.
 *
 * A product's FIRST non-identity scope is the one that cannot be absent if the
 * product works (YouTube needs `youtube.readonly` before its reports mean
 * anything). Every scope the product needs is still checked — by `health.ts`,
 * which is where "partly connected" is decided; this map answers the narrower
 * question the strip and the cards ask: is it on at all.
 */
export const GOOGLE_PRODUCT_SCOPES: Readonly<Record<string, string>> =
  Object.fromEntries(
    GOOGLE_CONNECTOR_PROVIDER.products
      .map((product) => {
        const [primary] = productGrantScopes(GOOGLE_CONNECTOR_PROVIDER, product);
        return primary ? ([product.key, primary] as const) : null;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );

/**
 * The connectors-registry ids that are Google-backed, and the product each one
 * IS. The registry predates the provider config and keeps its own ids because
 * they address stored rotation state; this is the join, not a second map.
 */
const CONNECTOR_ID_PRODUCT = {
  "google-workspace": "workspace_files",
  gmail: "gmail",
  "google-search-console": "search_console",
} as const;

export type GoogleConnectorId = keyof typeof CONNECTOR_ID_PRODUCT;

/** Connector id → the scope whose presence on a live connection lights it up. */
export const GOOGLE_CONNECTOR_SCOPES: Readonly<
  Record<GoogleConnectorId, string>
> = {
  "google-workspace": GOOGLE_PRODUCT_SCOPES.workspace_files,
  gmail: GOOGLE_PRODUCT_SCOPES.gmail,
  "google-search-console": GOOGLE_PRODUCT_SCOPES.search_console,
};

export function isGoogleConnectorId(id: ConnectorId): id is GoogleConnectorId {
  return id in CONNECTOR_ID_PRODUCT;
}

/** The product key a Google-backed connector id stands for. */
export function googleProductKeyFor(id: GoogleConnectorId): string {
  return CONNECTOR_ID_PRODUCT[id];
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

/** The live connection a PRODUCT would use, or undefined. */
export function googleConnectionForProduct<Row extends ScopeRow>(
  productKey: string,
  rows: readonly Row[],
): Row | undefined {
  const scope = GOOGLE_PRODUCT_SCOPES[productKey];
  if (!scope) return undefined;
  return rows.find(
    (row) => row.health === "connected" && row.scopes.includes(scope),
  );
}

/** Every Google-backed connector id the given connections light up. */
export function googleConnectedIds(rows: readonly ScopeRow[]): ConnectorId[] {
  return (Object.keys(CONNECTOR_ID_PRODUCT) as GoogleConnectorId[]).filter(
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
