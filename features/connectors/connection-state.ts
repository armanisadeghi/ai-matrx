/**
 * The ONE truthful answer to "is this MCP server usable right now?".
 *
 * Arman, 2026-09-13: "the user is also blind as to the MCPs that are attached
 * … the ui lies as well since I see a checkmark for git but don't actually
 * have the mcp connected according to the agent."
 *
 * Every indicator in the chat hierarchy (the run tool picker, the agent tools
 * manager, the connector strip) used to decide from `tool.mcp_user_conn.status`
 * alone. That single field lies in three separate ways:
 *
 *  1. a row still saying `connected` whose `token_expires_at` passed days ago;
 *  2. `refresh_failed` / `error`, which needs the user, not a retry;
 *  3. slug `github`, whose bearer comes from the FIRST-PARTY GitHub App
 *     connection (`users.integration_connections`) — its MCP connection row
 *     says nothing at all about whether GitHub works.
 *
 * aidream owns the authoritative machine (`describe_mcp_availability`, served
 * by `GET /api/mcp-connections/availability`) because only the server can see
 * whether a stored refresh token exists. This module is the same machine's
 * catalog-only form: it is what a surface renders before (or without) that
 * answer, and the server's answer always wins when it is present.
 *
 * NO hardcoded provider list lives here. GitHub is not special-cased by slug:
 * a first-party integration status is passed in by whoever holds it, keyed by
 * the server's own slug.
 */

import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";

/** What a person may be told about one MCP server. Exactly three states. */
export type McpConnectionState =
  /** Usable on the next run: no auth needed, token valid, or renewable. */
  | "connected"
  /** A connection exists but only the user can restore it. */
  | "needs_reauth"
  /** Nothing usable on file — the one-click offer. */
  | "not_connected";

export interface McpConnectionTruth {
  state: McpConnectionState;
  /** Plain-English why, for every state but a plain healthy `connected`. */
  reason: string | null;
  /** `server` when aidream answered; `catalog` when derived from DB rows. */
  source: "server" | "catalog";
}

/** The server's per-user answer (`GET /api/mcp-connections/availability`). */
export interface McpAvailability {
  slug: string;
  server_id: string | null;
  state: McpConnectionState;
  reason: string | null;
  tool_count: number;
}

/**
 * A first-party integration connection's status, as
 * `users.integration_connections.status` records it. Supplied by the surface
 * that already reads those rows; never fetched here.
 */
export type FirstPartyStatus = string | null | undefined;

export interface DeriveOptions {
  /** aidream's answer for this slug. Authoritative when present. */
  availability?: McpAvailability | null;
  /**
   * The status of a first-party integration connection carrying this server's
   * bearer, when one exists (GitHub today). `null` means "this server has a
   * first-party path and the user has no connection on it".
   */
  firstPartyStatus?: FirstPartyStatus;
  /** True when this server's bearer comes from a first-party connection. */
  hasFirstPartyPath?: boolean;
  /** Injected for tests. */
  now?: Date;
}

const REAUTH_CONNECTION_STATUSES = new Set(["refresh_failed", "error"]);
/** Server statuses a user can actually use — the same set aidream enforces. */
const USABLE_SERVER_STATUSES = new Set(["active", "beta", "community"]);
const REAUTH_FIRST_PARTY_STATUSES = new Set([
  "expired",
  "revoked",
  "error",
  "needs_reauth",
]);

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toISOString().slice(0, 10);
}

/**
 * Derive the truthful state for one catalog entry.
 *
 * Order of authority: aidream's answer → the first-party connection (when the
 * server has one) → the server's own auth strategy → the MCP connection row.
 */
export function deriveMcpConnectionState(
  entry: Pick<
    McpCatalogEntry,
    "slug" | "authStrategy" | "connectionStatus" | "tokenExpiresAt"
  > & { serverStatus?: McpCatalogEntry["serverStatus"] },
  options: DeriveOptions = {},
): McpConnectionTruth {
  const availability = options.availability;
  if (availability) {
    return {
      state: availability.state,
      reason: availability.reason,
      source: "server",
    };
  }

  // A server nobody can use yet is never "connected", whatever a leftover
  // connection row says. Mirrors aidream's USABLE_SERVER_STATUSES.
  if (entry.serverStatus && !USABLE_SERVER_STATUSES.has(entry.serverStatus)) {
    return {
      state: "not_connected",
      reason: `The ${entry.slug} server is ${entry.serverStatus.replace("_", " ")}, not usable yet.`,
      source: "catalog",
    };
  }

  if (options.hasFirstPartyPath) {
    const status = options.firstPartyStatus;
    if (!status) {
      return {
        state: "not_connected",
        reason: `Connect ${entry.slug} to your account before agents can use it.`,
        source: "catalog",
      };
    }
    if (REAUTH_FIRST_PARTY_STATUSES.has(status)) {
      return {
        state: "needs_reauth",
        reason: `Your ${entry.slug} connection is ${status} — reconnect it.`,
        source: "catalog",
      };
    }
    if (status === "connected") {
      return { state: "connected", reason: null, source: "catalog" };
    }
    return {
      state: "not_connected",
      reason: `Your ${entry.slug} connection is ${status}, not connected.`,
      source: "catalog",
    };
  }

  // A server that needs no authorization is reachable by everyone; no
  // connection row is required and none should be demanded.
  if (entry.authStrategy === "none") {
    return { state: "connected", reason: null, source: "catalog" };
  }

  const status = entry.connectionStatus;
  if (!status || status === "disconnected") {
    return {
      state: "not_connected",
      reason: `You have not connected ${entry.slug}.`,
      source: "catalog",
    };
  }
  if (REAUTH_CONNECTION_STATUSES.has(status)) {
    return {
      state: "needs_reauth",
      reason: `Your ${entry.slug} connection is ${status.replace("_", " ")} — reconnect it.`,
      source: "catalog",
    };
  }
  if (status === "expired") {
    return {
      state: "needs_reauth",
      reason: `Your ${entry.slug} authorization expired — reconnect it.`,
      source: "catalog",
    };
  }
  // status === "connected": believe it only while the token is still valid.
  // Whether an expired one can be renewed without the user is a fact only the
  // server can see (a stored refresh token), so until it answers we say the
  // honest thing rather than paint a checkmark over a dead token.
  const expiresAt = entry.tokenExpiresAt;
  if (expiresAt) {
    const now = options.now ?? new Date();
    const expiry = new Date(expiresAt);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime()) {
      return {
        state: "needs_reauth",
        reason: `Your ${entry.slug} access token expired on ${formatDate(expiresAt)} — reconnect it if the connection stops working.`,
        source: "catalog",
      };
    }
  }
  return { state: "connected", reason: null, source: "catalog" };
}

/** Short label for a state. One vocabulary across every surface. */
export const MCP_STATE_LABEL: Record<McpConnectionState, string> = {
  connected: "Connected",
  needs_reauth: "Needs re-auth",
  not_connected: "Not connected",
};
