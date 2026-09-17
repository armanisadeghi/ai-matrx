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
 *
 * 🚨 THE SERVER'S OWN WORDS NEVER BECOME A PERSON'S SENTENCE (VERIFY-U-P2-R3,
 * N9). `last_error` is written by aidream for an OPERATOR — "the vault item
 * google_oauth_…_refresh for Google connection 7f3e2b41-… could not be resolved
 * (KeyError: 'secret')". Until 2026-09-17 the `needs_attention` branch returned
 * that column VERBATIM as its `reason`, so the vault item's name, the connection
 * UUID and a Python exception class rendered eleven times on one connector card
 * in front of a non-technical person. Now the column is CLASSIFIED into a typed
 * fault (`classifyGoogleAccountFault`) whose sentence and remedy are written
 * here, and anything unclassifiable gets one honest generic sentence. The raw
 * column survives in `googleConnectionDiagnostics` only — the admin-grade
 * label/value list on the super-admin connections workspace, where an operator
 * is the reader. This holds whatever the server writes tomorrow: a reason we do
 * not recognise never reaches a screen.
 */
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";

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

export type GoogleResourceBindingState =
  "ready" | "connection_missing" | "scope_missing" | "resource_missing";

export interface GoogleResourceBindingDiagnosis {
  state: GoogleResourceBindingState;
  blocking: boolean;
  reason: string;
  recoverableConnectionId: string | null;
}

/**
 * Prove a Google binding from the same live inventory the picker renders.
 * A UUID + property-shaped string is configuration syntax, not proof that
 * the selected connection can actually read that resource.
 */
export function diagnoseGoogleResourceBinding({
  connectionId,
  resourceRef,
  resourceType,
  requiredScope,
  connections,
  resources,
}: {
  connectionId: string;
  resourceRef: string;
  resourceType: GoogleConnectionResource["resource_type"];
  requiredScope: string;
  connections: GoogleConnectionSummary[];
  resources: GoogleConnectionResource[];
}): GoogleResourceBindingDiagnosis {
  const connection = connections.find((row) => row.id === connectionId);
  const equivalentResource = resources.find(
    (resource) =>
      resource.resource_type === resourceType &&
      resource.resource_ref === resourceRef &&
      connections.some(
        (candidate) =>
          candidate.id === resource.connection_id &&
          candidate.health === "connected" &&
          candidate.scopes.includes(requiredScope),
      ),
  );
  if (!connection) {
    return {
      state: "connection_missing",
      blocking: true,
      reason:
        "The Google connection saved on this site is no longer active. Restore Analytics access or choose a currently discovered property.",
      recoverableConnectionId: equivalentResource?.connection_id ?? null,
    };
  }
  if (
    connection.health !== "connected" ||
    !connection.scopes.includes(requiredScope)
  ) {
    return {
      state: "scope_missing",
      blocking: true,
      reason:
        requiredScope === GOOGLE_SCOPE.analyticsReadonly
          ? "This Google connection does not grant Analytics read access, so it cannot discover or sync GA4 properties."
          : "This Google connection does not grant the access required for this resource.",
      recoverableConnectionId: equivalentResource?.connection_id ?? null,
    };
  }
  const exactResource = resources.some(
    (resource) =>
      resource.connection_id === connectionId &&
      resource.resource_type === resourceType &&
      resource.resource_ref === resourceRef,
  );
  if (!exactResource) {
    return {
      state: "resource_missing",
      blocking: true,
      reason:
        "The saved property was not returned by discovery for this Google connection. Run discovery again or choose one of the properties that was returned.",
      recoverableConnectionId: equivalentResource?.connection_id ?? null,
    };
  }
  return {
    state: "ready",
    blocking: false,
    reason: "The connection and discovered resource match.",
    recoverableConnectionId: null,
  };
}

/**
 * THE ACCOUNT FAULT VOCABULARY — every way a Google connection can stop
 * authorizing, as a typed code with words we wrote. The set is derived from what
 * `aidream/aidream/services/google_integrations/service.py` actually records
 * through `_record_credential_failure` (read 2026-09-17), plus `unknown`, which
 * is the honest answer for anything else — including whatever the server starts
 * writing next.
 */
export const GOOGLE_ACCOUNT_FAULT_CODES = [
  /** No saved permission on file at all. */
  "credential_missing",
  /** A saved permission exists and could not be read back. */
  "credential_unreadable",
  /** Our own app configuration was rejected; a reconnect cannot help. */
  "platform_configuration",
  /** Google will not renew the approval — expired, withdrawn or revoked. */
  "grant_expired_or_revoked",
  /** The approval is missing something the work needs. */
  "scope_missing",
  /** Connected, but the products asked for did not answer when checked. */
  "discovery_incomplete",
  /** Connected before we recorded which app it was approved for. */
  "client_configuration_missing",
  /** Google itself misbehaved while renewing; nothing is broken here. */
  "provider_unavailable",
  /** Connected, and some of what Google found could not be saved. */
  "resources_not_saved",
  /** Something we cannot classify. One honest sentence, never the raw text. */
  "unknown",
] as const;

export type GoogleAccountFault = (typeof GOOGLE_ACCOUNT_FAULT_CODES)[number];

export interface GoogleAccountFaultLanguage {
  /** Short badge word. */
  label: string;
  /** What is wrong, in one sentence a non-technical person can act on. */
  reason: string;
  /** The single action that fixes it, or null when pressing anything is futile. */
  remedy: string | null;
}

/**
 * THE SERVER'S OWN TYPED CODE, WHEN IT WRITES ONE. aidream stamps
 * `metadata.credential_failure.code` beside the row (its own declared
 * vocabulary), which is a fact rather than prose — so it is read FIRST, and a
 * code we do not know falls back to the text, and then to `unknown`. Nothing
 * here depends on the server having done it: today many rows carry only prose.
 */
const SERVER_FAULT_CODES: Record<string, GoogleAccountFault> = {
  credential_missing: "credential_missing",
  credential_unreadable: "credential_unreadable",
  client_configuration_missing: "client_configuration_missing",
  platform_configuration: "platform_configuration",
  grant_expired_or_revoked: "grant_expired_or_revoked",
  provider_unavailable: "provider_unavailable",
  resources_not_saved: "resources_not_saved",
  scope_missing: "scope_missing",
  discovery_incomplete: "discovery_incomplete",
};

export function serverRecordedAccountFault(
  metadata: Record<string, unknown> | null | undefined,
): GoogleAccountFault | null {
  const recorded = metadata?.credential_failure;
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) {
    return null;
  }
  const code = (recorded as Record<string, unknown>).code;
  return typeof code === "string" ? (SERVER_FAULT_CODES[code] ?? null) : null;
}

/**
 * Read the server's operator text and say WHICH fault it is. Matching on the
 * recorded phrasing is deliberate and its failure mode is safe: an unrecognised
 * reason is `unknown`, which speaks one generic sentence rather than the text.
 * Order matters — the platform-configuration and credential shapes both mention
 * a connection id, so the narrower phrase is tested first.
 */
export function classifyGoogleAccountFault(
  rawError: string | null | undefined,
): GoogleAccountFault {
  const text = (rawError ?? "").trim();
  if (!text) return "unknown";
  if (/missing required scope/i.test(text)) return "scope_missing";
  if (/\bno vault credential\b|\bno credential item\b|has no credential/i.test(text)) {
    return "credential_missing";
  }
  if (
    /oauth_client_id|oauth client configuration|platform repair|invalid_client/i.test(
      text,
    )
  ) {
    return "platform_configuration";
  }
  if (/could not be resolved|could not be read/i.test(text)) {
    return "credential_unreadable";
  }
  if (
    /refresh (?:failed|for connection|returned)|invalid_grant|no access token|token refresh/i.test(
      text,
    )
  ) {
    return "grant_expired_or_revoked";
  }
  if (/could not be discovered|none of the requested product apis/i.test(text)) {
    return "discovery_incomplete";
  }
  return "unknown";
}

/**
 * THE ONE PLACE A FAULT BECOMES WORDS. Every sentence here is a constant plus
 * the account's own label, so no identifier, code or exception class can travel
 * through it however the server phrased itself.
 */
export function googleAccountFaultLanguage(
  fault: GoogleAccountFault,
  account: string,
): GoogleAccountFaultLanguage {
  switch (fault) {
    case "credential_missing":
      return {
        label: "Needs reconnecting",
        reason: `AI Matrx no longer holds a saved permission for ${account}, so it cannot make any Google request with it.`,
        remedy: `Reconnect ${account} to restore access.`,
      };
    case "credential_unreadable":
      return {
        label: "Needs reconnecting",
        reason: `The saved permission for ${account} could not be read, so nothing can authorize a Google request with it.`,
        remedy: `Reconnect ${account} to restore access.`,
      };
    case "platform_configuration":
      return {
        label: "Ours to repair",
        reason: `Google rejected AI Matrx's own app configuration for ${account}. This one is ours to repair, and approving it again would not help.`,
        remedy: null,
      };
    case "grant_expired_or_revoked":
      return {
        label: "Needs reconnecting",
        reason: `Google would not renew AI Matrx's permission for ${account} — the approval has expired or been withdrawn.`,
        remedy: `Reconnect ${account} and approve what the Google window asks for.`,
      };
    case "scope_missing":
      return {
        label: "Needs reconnecting",
        reason: `${account} has not approved everything AI Matrx needs to do this work.`,
        remedy: `Reconnect ${account} and approve what the Google window asks for.`,
      };
    case "discovery_incomplete":
      return {
        label: "Needs attention",
        reason: `Google connected ${account}, but nothing we asked it about answered when we checked, so we cannot say what works yet.`,
        remedy: `Reconnect ${account}, or try again in a few minutes.`,
      };
    case "client_configuration_missing":
      return {
        label: "Needs reconnecting",
        reason: `${account} was connected before AI Matrx recorded which app it was approved for, so it cannot be used as it is.`,
        remedy: `Reconnect ${account} to restore access.`,
      };
    case "provider_unavailable":
      return {
        label: "Needs attention",
        reason: `Google did not answer properly when AI Matrx renewed ${account}'s access. Nothing about the connection is broken.`,
        remedy: `Try again in a few minutes; if it keeps happening, reconnect ${account}.`,
      };
    case "resources_not_saved":
      return {
        label: "Needs attention",
        reason: `Google connected ${account}, and some of what it found could not be saved, so part of this account may be missing here.`,
        remedy: `Reconnect ${account} to try again.`,
      };
    case "unknown":
      return {
        label: "Needs attention",
        reason: `Google refused ${account} for a reason we cannot put in plain words yet — something on our side needs repair, and we have the details.`,
        remedy: `Try reconnecting ${account}; if it does not clear, tell us and we will repair it.`,
      };
  }
}

/**
 * The account-level refusal as a SENTENCE, for the connector surfaces. Null when
 * the server recorded no refusal on this account. Never the stored text.
 */
export function googleAccountRefusalSentence(
  connection: GoogleConnectionSummary,
): string | null {
  if (!connection.last_error?.trim()) return null;
  const account =
    connection.account_email ||
    connection.account_name ||
    "this Google account";
  return googleAccountFaultLanguage(
    googleAccountFault(connection),
    account,
  ).reason;
}

/** The fault on this connection: the server's typed code first, then its text. */
export function googleAccountFault(
  connection: GoogleConnectionSummary,
): GoogleAccountFault {
  return (
    serverRecordedAccountFault(connection.metadata) ??
    classifyGoogleAccountFault(connection.last_error)
  );
}

export function diagnoseGoogleConnection(
  connection: GoogleConnectionSummary,
): GoogleConnectionDiagnosis {
  const account =
    connection.account_email ||
    connection.account_name ||
    "this Google account";

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
    // The stored reason is operator text. It picks the fault; it never speaks.
    if (!connection.last_error?.trim()) {
      return {
        label: "Needs attention",
        reason: `Google refused ${account} and recorded no reason, so we cannot say yet what needs repairing.`,
        remedy: `Reconnect ${account}, then retry the sync.`,
        blocking: true,
      };
    }
    const language = googleAccountFaultLanguage(
      googleAccountFault(connection),
      account,
    );
    return { ...language, blocking: true };
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
    [
      "Owner",
      connection.owner_type === "organization" ? "Organization" : "Personal",
    ],
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
