/**
 * GSC property preference + connection-failure classification — ONE home.
 *
 * Two rules live here, both Arman rulings (2026-08-29):
 *
 * 1. THE DOMAIN-PROPERTY RULE. When Google's discovery returns a domain
 *    property (`sc-domain:<domain>`) for a site's own domain, that property
 *    is THE default binding — it covers every protocol/host version of the
 *    site. The UI auto-selects it, recommends it, and a user who insists on
 *    a URL-prefix version must answer THREE separate warnings before the
 *    save goes through. The system must never *suggest* a URL version while
 *    the domain property exists.
 *
 * 2. A BROKEN GOOGLE CONNECTION IS NAMED, EVERYWHERE, WITH ITS DOOR. On
 *    2026-08-27→29 the nightly GSC collection failed 24 times across 8 sites
 *    (`ResourceBindingError` — the connection's discovered properties were
 *    gone pending re-consent) and no user-facing surface said so: the
 *    dashboard said "data is 3 days old", Sync produced a raw-error toast,
 *    and the repair page was undiscoverable. `classifyGscAccessFailure`
 *    turns those error strings into a plain sentence, and every surface that
 *    shows it must also show the door (site Integrations settings or
 *    /marketing/connections/google) — never a cause without its fix.
 */

import type { GoogleConnectionResource } from "@/features/marketing/google/types";

/** The canonical domain-property ref for a site's domain. */
export function gscDomainPropertyRef(domain: string): string {
  return `sc-domain:${domain.trim().toLowerCase()}`;
}

export function isGscDomainProperty(resourceRef: string): boolean {
  return resourceRef.trim().toLowerCase().startsWith("sc-domain:");
}

/** True when `resourceRef` IS the domain property for this site's domain. */
export function isSiteDomainProperty(
  resourceRef: string,
  domain: string | null | undefined,
): boolean {
  if (!domain) return false;
  return resourceRef.trim().toLowerCase() === gscDomainPropertyRef(domain);
}

/** True when a URL-prefix property's hostname matches the site's domain. */
export function gscUrlPropertyMatchesDomain(
  resourceRef: string,
  domain: string,
): boolean {
  try {
    const host = new URL(resourceRef.trim().toLowerCase()).hostname;
    const target = domain.trim().toLowerCase();
    return host === target || host === `www.${target}`;
  } catch {
    return false;
  }
}

/**
 * The property this site should bind by default, in preference order:
 * the domain property → a URL version whose hostname matches → a single
 * discovered property (nothing to choose between).
 */
export function preferredGscProperty(
  resources: GoogleConnectionResource[],
  connectionId: string,
  domain: string,
): GoogleConnectionResource | null {
  const candidates = resources.filter(
    (resource) =>
      resource.connection_id === connectionId &&
      resource.resource_type === "search_console_property",
  );
  return (
    candidates.find((resource) =>
      isSiteDomainProperty(resource.resource_ref, domain),
    ) ??
    candidates.find((resource) =>
      gscUrlPropertyMatchesDomain(resource.resource_ref, domain),
    ) ??
    (candidates.length === 1 ? candidates[0] : null)
  );
}

/** The discovered domain property for this site under a connection, if any. */
export function discoveredDomainProperty(
  resources: GoogleConnectionResource[],
  connectionId: string,
  domain: string | null | undefined,
): GoogleConnectionResource | null {
  if (!domain) return null;
  return (
    resources.find(
      (resource) =>
        resource.connection_id === connectionId &&
        resource.resource_type === "search_console_property" &&
        isSiteDomainProperty(resource.resource_ref, domain),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Connection/binding failure classification
// ---------------------------------------------------------------------------

export interface GscAccessFailure {
  /** Plain-English cause a non-technical reader can act on. */
  reason: string;
  /** What clicking the fix door will let them do. */
  remedy: string;
}

/**
 * Patterns that mean "Google access itself is broken — no retry helps, a
 * human must reconnect or rebind." Sourced from REAL recorded failures:
 * aidream's `ResourceBindingError` / credential-resolution messages and
 * Google OAuth's own vocabulary.
 */
const ACCESS_FAILURE_PATTERNS: readonly RegExp[] = [
  /ResourceBindingError/i,
  /no live discovered/i,
  /needs? re-?authentication/i,
  /no vault credential/i,
  /invalid_grant/i,
  /insufficient.*(scope|permission)/i,
  /unauthorized_client/i,
  /access.*(revoked|denied)/i,
  /token.*(expired|revoked)/i,
  /connection.*(revoked|missing|no longer active)/i,
];

/**
 * Classify an error string (a collection run's `last_run_error`, a sync
 * failure's cause chain, …) as a Google-access failure. Returns null for
 * everything else — quota blips, transient 5xx, empty windows — so ordinary
 * failures keep their ordinary rendering.
 */
export function classifyGscAccessFailure(
  text: string | null | undefined,
): GscAccessFailure | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  if (!ACCESS_FAILURE_PATTERNS.some((pattern) => pattern.test(value))) {
    return null;
  }
  return {
    reason:
      "Google is refusing this site's Search Console connection, so data collection has stopped. This is not a temporary glitch — syncing again will keep failing until the connection is repaired.",
    remedy:
      "Reconnect Google (re-approve access when Google asks) and confirm the site's Search Console property binding.",
  };
}
