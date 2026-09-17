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

// ---------------------------------------------------------------------------
// Connect-time PRE-FLIGHT: the property type vs the site's canonical URL
// ---------------------------------------------------------------------------

/**
 * THE PRE-FLIGHT (google-native PLAN §4.8, the Search Console champion gap:
 * "nobody pre-flights property-type mismatch — domain vs URL-prefix vs www —
 * at connect time").
 *
 * Search Console treats `https://example.com/`, `https://www.example.com/`,
 * `http://example.com/` and `sc-domain:example.com` as FOUR different
 * properties. Binding the wrong one is silent: the API answers 200 with zeros
 * or with a fraction of the traffic, and every screen downstream reports a
 * healthy connection and a dead site. So the mismatch is named HERE, at the
 * moment of choosing, with the exact property to pick instead.
 *
 * This is deliberately NOT a second copy of THE DOMAIN-PROPERTY RULE above: a
 * domain property that covers this site is always `ok` here — never nudged
 * toward a URL version, which that rule forbids (Arman, 2026-08-29). What this
 * adds is the four refusals the rule never covered: a www/non-www swap, a
 * scheme swap, a path prefix that excludes the site, and an unrelated host.
 */

export type GscPreflightVerdict = "ok" | "advisory" | "mismatch";

export interface GscPropertyPreflight {
  verdict: GscPreflightVerdict;
  /** One sentence naming BOTH sides — the site and the property picked. */
  headline: string;
  /** What to pick instead, or why this choice is still fine. */
  detail: string;
  /** The property ref this site should bind, when we can name it. */
  suggestedRef: string | null;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function bareDomain(host: string): string {
  return normalizeHost(host).replace(/^www\./, "");
}

/** The site's canonical origin, from `root_url` when it parses, else `domain`. */
export function siteCanonicalUrl(site: {
  root_url?: string | null;
  domain: string;
}): { origin: string; host: string; path: string; display: string } {
  const raw = (site.root_url ?? "").trim();
  try {
    const url = new URL(raw);
    return {
      origin: url.origin.toLowerCase(),
      host: normalizeHost(url.hostname),
      path: url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "/"),
      display: `${url.origin}${url.pathname === "/" ? "/" : url.pathname}`,
    };
  } catch {
    const host = normalizeHost(site.domain);
    return {
      origin: `https://${host}`,
      host,
      path: "/",
      display: `https://${host}/`,
    };
  }
}

/**
 * Judge one property choice against the site it is about to be bound to.
 * `null` is never returned: an unparseable ref is itself a mismatch.
 */
export function preflightGscProperty(
  resourceRef: string,
  site: { root_url?: string | null; domain: string },
): GscPropertyPreflight {
  const ref = resourceRef.trim();
  const canonical = siteCanonicalUrl(site);
  const siteBare = bareDomain(canonical.host);
  const domainRef = gscDomainPropertyRef(siteBare);

  if (!ref) {
    return {
      verdict: "mismatch",
      headline: `No Search Console property is picked for ${canonical.display}.`,
      detail: `Pick ${domainRef} if you own the whole domain in Search Console, or the URL-prefix property that matches this site exactly (${canonical.display}).`,
      suggestedRef: domainRef,
    };
  }

  if (isGscDomainProperty(ref)) {
    const picked = bareDomain(ref.slice("sc-domain:".length));
    if (picked === siteBare) {
      return {
        verdict: "ok",
        headline: `${ref} covers ${canonical.display}.`,
        detail:
          "A domain property covers every version of the domain — http and https, www and non-www — so no traffic can hide in a version this site is not bound to.",
        suggestedRef: ref,
      };
    }
    if (siteBare.endsWith(`.${picked}`)) {
      return {
        verdict: "advisory",
        headline: `${ref} is the whole domain, and this site is only ${canonical.host}.`,
        detail: `Every subdomain of ${picked} reports into ${ref}, so this site's numbers will include traffic that belongs to other subdomains. Bind it only if that is what you want; otherwise pick the URL-prefix property ${canonical.display}.`,
        suggestedRef: ref,
      };
    }
    return {
      verdict: "mismatch",
      headline: `This site is ${canonical.display}; you picked the domain property ${picked}, which is a different domain.`,
      detail: `${ref} reports on ${picked} and will never contain a single row for ${canonical.host}. Pick ${domainRef} if you own ${siteBare} in Search Console, or the URL-prefix property ${canonical.display}.`,
      suggestedRef: domainRef,
    };
  }

  let picked: URL;
  try {
    picked = new URL(ref);
  } catch {
    return {
      verdict: "mismatch",
      headline: `“${ref}” is not a Search Console property.`,
      detail: `A property is either a domain property (${domainRef}) or a full URL prefix (${canonical.display}). Pick one of those.`,
      suggestedRef: domainRef,
    };
  }

  const pickedHost = normalizeHost(picked.hostname);
  if (bareDomain(pickedHost) !== siteBare) {
    return {
      verdict: "mismatch",
      headline: `This site is ${canonical.display}; you picked ${ref}, which is a different site.`,
      detail: `Search Console will answer for ${pickedHost} and report nothing about ${canonical.host}. Pick ${domainRef} if you own the whole domain, or the URL-prefix property ${canonical.display}.`,
      suggestedRef: domainRef,
    };
  }
  if (pickedHost !== canonical.host) {
    return {
      verdict: "mismatch",
      headline: `This site is ${canonical.display}; you picked ${ref}, and Search Console treats www and non-www as two separate properties.`,
      detail: `${ref} will report nothing for ${canonical.host} pages. Pick ${domainRef}, which covers both, or the URL-prefix property ${canonical.display}.`,
      suggestedRef: domainRef,
    };
  }
  if (picked.protocol.replace(":", "") !== canonical.origin.split(":")[0]) {
    return {
      verdict: "mismatch",
      headline: `This site is ${canonical.display}; you picked ${ref}, and Search Console treats http and https as two separate properties.`,
      detail: `${ref} will report nothing for ${canonical.origin} pages. Pick ${domainRef}, which covers both schemes, or the URL-prefix property ${canonical.display}.`,
      suggestedRef: domainRef,
    };
  }
  const pickedPath = picked.pathname === "/" ? "/" : picked.pathname.replace(/\/+$/, "/");
  if (pickedPath !== "/" && !canonical.path.startsWith(pickedPath)) {
    return {
      verdict: "mismatch",
      headline: `This site starts at ${canonical.display}; you picked ${ref}, which only covers URLs under ${pickedPath}.`,
      detail: `A URL-prefix property reports only on pages beneath its own path, so this site's pages fall outside it. Pick ${domainRef}, or the URL-prefix property ${canonical.display}.`,
      suggestedRef: domainRef,
    };
  }
  return {
    verdict: "ok",
    headline: `${ref} matches ${canonical.display}.`,
    detail:
      "A URL-prefix property reports only on this exact scheme and host. If Google also offers you the domain property, that one covers every version of the domain.",
    suggestedRef: ref,
  };
}
