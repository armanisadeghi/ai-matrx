/**
 * Google connection health — ONE place that turns a connection row into an
 * exact, admin-grade sentence.
 *
 * Why this exists: on 2026-07-25 a GSC sync failed with
 * "CanonicalGscSync failed unexpectedly. Please try again or adjust your
 * settings." The real cause was already known to the DB — the connection row
 * had lost its vault credential reference while still reporting
 * `status = 'connected'`. Nothing in the UI said so, before OR after the
 * failure. Health is therefore DERIVED (see `connectionSummary`) and explained
 * here, so both the connections hub and every per-site binding surface state
 * the same truth in the same words.
 */
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";

export interface GoogleConnectionDiagnosis {
  /** Short badge label. */
  label: string;
  /** Exactly what is wrong, in one sentence — never "something went wrong". */
  reason: string;
  /** The single action that fixes it, when there is one. */
  remedy: string | null;
  /** True when nothing can authorize against this connection right now. */
  blocking: boolean;
}

export function diagnoseGoogleConnection(
  connection: GoogleConnectionSummary,
): GoogleConnectionDiagnosis {
  const account =
    connection.account_email || connection.account_name || "this Google account";

  if (connection.health === "revoked") {
    return {
      label: "Revoked",
      reason: `Access for ${account} was revoked. Nothing can read Search Console or Analytics with it.`,
      remedy: "Connect Google again to restore access.",
      blocking: true,
    };
  }

  if (!connection.credential_present) {
    return {
      label: "Needs re-authentication",
      reason:
        `${account} has no vault credential on file (no credential item and no legacy vault key), ` +
        "so the server cannot mint a Google access token. Every sync and collection using it fails.",
      remedy: `Reconnect ${account} to mint a new refresh-token credential.`,
      blocking: true,
    };
  }

  if (connection.status === "needs_attention") {
    return {
      label: "Needs attention",
      reason:
        connection.last_error?.trim() ||
        `The server flagged ${account} after a failed request but recorded no reason.`,
      remedy: `Reconnect ${account}, then retry the sync.`,
      blocking: true,
    };
  }

  if (!connection.credential_stable) {
    return {
      label: "Legacy credential",
      reason:
        `${account} still resolves through the legacy vault key rather than a stable ` +
        "credential item, which is a deprecated path scheduled for removal.",
      remedy: `Reconnect ${account} to mint a stable credential reference.`,
      blocking: false,
    };
  }

  return {
    label: "Connected",
    reason: `${account} has a stable vault credential and can authorize Google requests.`,
    remedy: null,
    blocking: false,
  };
}

/** Every field an admin needs to explain this connection, as label/value rows. */
export function googleConnectionDiagnostics(
  connection: GoogleConnectionSummary,
): Array<[string, string]> {
  return [
    ["Connection id", connection.id],
    ["Account", connection.account_email || connection.account_name || "—"],
    ["Owner", connection.owner_type === "organization" ? "Organization" : "Personal"],
    ["Stored status", connection.status],
    ["Derived health", connection.health],
    [
      "Vault credential",
      connection.credential_present
        ? connection.credential_stable
          ? "stable credential item"
          : "legacy vault key"
        : "MISSING",
    ],
    ["Scopes", connection.scopes.length ? connection.scopes.join(", ") : "—"],
    ["Last verified", connection.last_verified_at ?? "never"],
    ["Last recorded error", connection.last_error ?? "none"],
  ];
}

/**
 * Collapse duplicate picker entries for the SAME Google account.
 *
 * A personal connection and an org-shared connection to the same Google
 * account (same `provider_subject`) are the same authorization at Google —
 * the server resolves them interchangeably ("they both should resolve the
 * same damn thing"). Showing both as separate choices is noise and reads as
 * two different things. This keeps ONE entry per Google identity:
 *
 *   1. the currently-selected connection (never hide the bound row),
 *   2. else a healthy one over an unhealthy one,
 *   3. else an organization-owned one over a personal one,
 *   4. else the most recently updated (input order).
 *
 * Distinct Google accounts always stay distinct entries.
 */
export function dedupeGoogleConnectionsForPicker(
  connections: GoogleConnectionSummary[],
  selectedConnectionId?: string | null,
): GoogleConnectionSummary[] {
  const groups = new Map<string, GoogleConnectionSummary[]>();
  for (const connection of connections) {
    const key = connection.provider_subject || connection.id;
    const group = groups.get(key);
    if (group) group.push(connection);
    else groups.set(key, [connection]);
  }
  const result: GoogleConnectionSummary[] = [];
  for (const group of groups.values()) {
    const selected = selectedConnectionId
      ? group.find((connection) => connection.id === selectedConnectionId)
      : undefined;
    if (selected) {
      result.push(selected);
      continue;
    }
    const preferred =
      group.find(
        (connection) =>
          connection.health === "connected" &&
          connection.owner_type === "organization",
      ) ??
      group.find((connection) => connection.health === "connected") ??
      group.find((connection) => connection.owner_type === "organization") ??
      group[0];
    result.push(preferred);
  }
  return result;
}
