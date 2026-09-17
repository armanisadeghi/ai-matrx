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

/**
 * The canonical domain-property ref for a site's domain — ONE normalizer,
 * shared with every host comparison in this file (`normalizeHost`).
 *
 * WHY IT NORMALIZES (round-2 verdict NEW-B2): Google stores `example.com`,
 * never `example.com.`, and lowercase only. The URL-prefix branch already
 * stripped the FQDN dot to build the ref it recommends; the domain-ref branch
 * lowercased and trimmed but kept the dot, so `sc-domain:example.com.` compared
 * equal to the site AND was echoed back as the ref to bind — a ref Google does
 * not hold and will never answer for.
 */
export function gscDomainPropertyRef(domain: string): string {
  return `sc-domain:${normalizeHost(domain)}`;
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
  const ref = resourceRef.trim().toLowerCase();
  if (!ref.startsWith("sc-domain:")) return false;
  // Both sides through the one normalizer: a trailing dot or stray case on
  // either side is the same property, and nothing else is.
  return (
    gscDomainPropertyRef(ref.slice("sc-domain:".length)) ===
    gscDomainPropertyRef(domain)
  );
}

/**
 * The property this site should bind by default, in preference order:
 * the domain property → a property THE JUDGE ACCEPTS → a single discovered
 * property (nothing to choose between, and the judge still refuses it
 * downstream if it is wrong).
 *
 * THE ASYMMETRY THIS REMOVED (round-2 verdict NEW-B1, same class): the second
 * rank used to be its own host comparison that accepted `www.<domain>` for a
 * non-www site — a third place where `www` was equated by hand. There is now
 * one rule for "does this property cover this site", `preflightGscProperty`,
 * and the auto-pick asks it instead of re-deciding.
 */
export function preferredGscProperty(
  resources: GoogleConnectionResource[],
  connectionId: string,
  site: { root_url?: string | null; domain: string },
): GoogleConnectionResource | null {
  const candidates = resources.filter(
    (resource) =>
      resource.connection_id === connectionId &&
      resource.resource_type === "search_console_property",
  );
  return (
    candidates.find((resource) =>
      isSiteDomainProperty(resource.resource_ref, site.domain),
    ) ??
    candidates.find(
      (resource) =>
        preflightGscProperty(resource.resource_ref, site).verdict !== "mismatch",
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
  const siteHost = normalizeHost(canonical.host);
  const siteBare = bareDomain(siteHost);
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
    const tail = ref.slice("sc-domain:".length);
    // A DOMAIN PROPERTY COVERS ITS SUBDOMAINS, NEVER ITS PARENT (round-2
    // verdict NEW-B1). The picked host is compared UNSTRIPPED: `bareDomain()`
    // used to strip `www.` from both sides, so `sc-domain:www.example.com`
    // compared equal to a site at `https://example.com/` and was accepted as
    // "ok" — Google will never return a row for `example.com` pages from a
    // `www.example.com` property, and the ~16-month backfill was allowed to
    // start against it.
    const picked = normalizeHost(tail);
    // NORMALIZATION, NAMED: Google's own property refs are lowercase and carry
    // no FQDN dot, so `SC-DOMAIN:EXAMPLE.COM` and `sc-domain:example.com.` are
    // not refs the API accepts — recommending either verbatim would recommend a
    // binding Google refuses. The ref goes through the ONE normalizer
    // (`gscDomainPropertyRef`) and every change is said out loud.
    const normalizedRef = gscDomainPropertyRef(tail);
    const trimmedTail = tail.trim();
    const changes: string[] = [];
    if (trimmedTail !== trimmedTail.toLowerCase()) {
      changes.push("Search Console's property refs are lowercase");
    }
    if (trimmedTail.endsWith(".")) {
      changes.push("Google stores this host without the trailing dot");
    }
    const caseNote =
      normalizedRef === ref || !changes.length
        ? ""
        : ` ${changes.join(", and ")}, so this binds as ${normalizedRef} — “${ref}” exactly as typed is not a ref Google accepts.`;
    // Equal to the site's own host, or to its registrable host (the www twin of
    // a site that lives at www is the same site, and THE DOMAIN-PROPERTY RULE
    // says that property is the right binding).
    if (picked === siteHost || picked === siteBare) {
      return {
        verdict: "ok",
        headline: `${normalizedRef} covers ${canonical.display}.`,
        detail:
          "A domain property covers every version of the domain — http and https, www and non-www — so no traffic can hide in a version this site is not bound to." +
          caseNote,
        suggestedRef: normalizedRef,
      };
    }
    // An ANCESTOR of this site's host: broader than the site, and it does hold
    // the site's rows, so it is an advisory, never a refusal.
    if (siteBare.endsWith(`.${picked}`) || siteHost.endsWith(`.${picked}`)) {
      return {
        verdict: "advisory",
        headline: `${normalizedRef} is the whole domain, and this site is only ${canonical.host}.`,
        detail:
          `Every subdomain of ${picked} reports into ${normalizedRef}, so this site's numbers will include traffic that belongs to other subdomains. Bind it only if that is what you want; otherwise pick the URL-prefix property ${canonical.display}.` +
          caseNote,
        suggestedRef: normalizedRef,
      };
    }
    // Everything else is a property that will never hold one row for this site.
    // The www twin gets its own sentence, because "a different domain" reads as
    // a typo when the two names differ by three letters.
    if (bareDomain(picked) === siteBare) {
      return {
        verdict: "mismatch",
        headline: `This site is ${canonical.display}; you picked the domain property ${normalizedRef}, and Search Console treats www and non-www as two separate properties.`,
        detail: `A domain property covers that domain and everything UNDER it, never the domain above it, so ${normalizedRef} will never contain a single row for ${canonical.host} pages. Pick ${domainRef}, which covers ${siteBare} and every subdomain of it.`,
        suggestedRef: domainRef,
      };
    }
    return {
      verdict: "mismatch",
      headline: `This site is ${canonical.display}; you picked the domain property ${picked}, which is a different domain.`,
      detail: `${normalizedRef} reports on ${picked} and will never contain a single row for ${canonical.host}. Pick ${domainRef} if you own ${siteBare} in Search Console, or the URL-prefix property ${canonical.display}.`,
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

  const rawPickedHost = picked.hostname.trim().toLowerCase();
  const pickedPathRaw =
    picked.pathname === "/" ? "/" : picked.pathname.replace(/\/+$/, "/");
  // A PORT IS A DIFFERENT PROPERTY. Search Console stores `https://example.com/`
  // and `https://example.com:8443/` as two properties; binding the port version
  // answers 200 with zero rows exactly like a www swap does.
  if (picked.port) {
    const withoutPort = `${picked.protocol}//${normalizeHost(rawPickedHost)}${pickedPathRaw}`;
    return {
      verdict: "mismatch",
      headline: `This site is ${canonical.display}; you picked ${ref}, and Search Console treats a property with a port as a separate property.`,
      detail: `Search Console has no property for port ${picked.port} unless you verified one, so ${ref} will report nothing for ${canonical.host} pages. Pick ${domainRef}, which covers the whole domain, or the URL-prefix property ${withoutPort}.`,
      suggestedRef: domainRef,
    };
  }
  // A TRAILING-DOT HOST IS A DIFFERENT PROPERTY, for the same reason: Google
  // stores `example.com`, never `example.com.`.
  if (rawPickedHost.endsWith(".")) {
    const withoutDot = `${picked.protocol}//${normalizeHost(rawPickedHost)}${pickedPathRaw}`;
    return {
      verdict: "mismatch",
      headline: `This site is ${canonical.display}; you picked ${ref}, and the trailing dot in “${rawPickedHost}” makes it a different property.`,
      detail: `Search Console stores this host as ${normalizeHost(rawPickedHost)}, with no trailing dot, so ${ref} matches no property Google will answer for. Pick ${domainRef}, or the URL-prefix property ${withoutDot}.`,
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
  const pickedPath = pickedPathRaw;
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

// ---------------------------------------------------------------------------
// THE CONNECT-TIME REFUSAL — one judge every write path asks
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS (zero-authorship verification, 2026-09-17, defect B-1). The
 * pre-flight above was correct and ran nowhere that mattered: every surface
 * asked for it only once the binding was already `enabled`, so the FIRST
 * Enable — the exact moment PLAN §4.8 was written for — saved whatever
 * property was selected and immediately fired a ~16-month Search Console
 * backfill against it. Live proof: site `d7c4aeb1-…`
 * (`ga4-oauth-qa-00fb6a62a3.invalid`) is bound today to `http://bhrcenter.com/`.
 *
 * So the judgement moved out of the components and into ONE function that
 * every write path asks BEFORE it writes, on the DRAFT, whether or not the
 * binding is enabled:
 *
 *   - the Integrations editor's configuration-issue list (blocks Save),
 *   - the per-provider Enable/Connect button,
 *   - `persistBuiltInProvider` (the single choke point for a one-provider
 *     write, including the auto-bind that follows a Google connection),
 *   - `kickGscFirstImport` (a refused binding never starts a backfill),
 *   - the PAGE-LEVEL Save, which writes the whole integrations blob through
 *     `updateSiteIntegrations` (round-2 verdict NEW-B6: this fifth path had no
 *     judge at all and gated only on the issue list the screen was showing, so
 *     the OAuth-review surface re-saved a hidden mismatch unjudged). It asks
 *     `integrationsWriteRefusal` in `components/integrations/integration-issues.ts`,
 *     which composes this same judge.
 *
 * And `preferredGscProperty` above asks the pre-flight rather than re-deciding
 * host equality, so the auto-pick cannot select a property this judge refuses.
 *
 * `enabled` is deliberately NOT part of the test: saving a binding that is
 * known to point at a different site is refused even when it is switched off,
 * because the next person to flip the switch would inherit it silently.
 */
export interface GscBindingJudgement {
  /** False only when a property is picked and it is a proven mismatch. */
  allowed: boolean;
  /** The refusal, verbatim from the pre-flight, when there is one. */
  refusal: GscPropertyPreflight | null;
  /** The whole refusal as one sentence pair, ready to print or throw. */
  sentence: string | null;
}

/**
 * Judge a Search Console binding about to be WRITTEN. An empty property is not
 * this judge's business (`validateSiteIntegrations` owns "enabled with no
 * property"); a picked property that fails the pre-flight is refused by name.
 */
export function judgeGscBindingWrite(
  binding: { resourceRef?: string | null },
  site: { root_url?: string | null; domain: string },
): GscBindingJudgement {
  const ref = (binding.resourceRef ?? "").trim();
  // Nothing picked, or a site row with no domain to judge against: there is no
  // judgement to make, and inventing one would be a refusal nobody can fix.
  if (!ref || !site.domain) {
    return { allowed: true, refusal: null, sentence: null };
  }
  const preflight = preflightGscProperty(ref, site);
  if (preflight.verdict !== "mismatch") {
    return { allowed: true, refusal: null, sentence: null };
  }
  return {
    allowed: false,
    refusal: preflight,
    sentence: `${preflight.headline} ${preflight.detail}`,
  };
}

/**
 * THE BACKFILL GATE. The on-bind import walks to Google's ~16-month horizon;
 * started against the wrong property it spends the site's daily request
 * allowance filling the site with another site's history. It runs only for a
 * binding that is enabled, complete, never synced — AND not refused.
 */
export function shouldStartGscFirstImport(
  binding: {
    enabled: boolean;
    credentialRef?: string | null;
    resourceRef?: string | null;
  },
  site: { root_url?: string | null; domain: string },
  options: { alreadySynced: boolean },
): boolean {
  if (options.alreadySynced) return false;
  if (!binding.enabled || !binding.credentialRef || !binding.resourceRef) {
    return false;
  }
  return judgeGscBindingWrite(binding, site).allowed;
}
