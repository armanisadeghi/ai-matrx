// features/tasks/provenance-door.ts
//
// 🚨 A PROVENANCE LINK IS A DOOR ONLY WHEN IT OPENS A PAGE.
//
// Every task carries generic `origin` / `source_type` / `source_url` columns, and
// the ONE provenance chip turned any `source_url` that did not start with `/`
// into `<a target="_blank">` titled "Open source: …". The Google Tasks import
// writes `source_url = https://tasks.googleapis.com/tasks/v1/lists/<list>/tasks/
// <id>` — an API resource, whose own constant says *"It is an identity, NOT a
// page — a client must not render it as 'open in Google Tasks'."* Measured
// unauthenticated on 2026-09-17: that URL answers **HTTP 401** with a JSON error
// body, so every imported Google task shipped a clickable chip that landed a
// non-technical expert on an API error (VERIFY-B1-B2-R2 N5).
//
// The guard was written as a comment in the import panel — which correctly shows
// no such link — instead of in the shared chip that actually renders the column.
// This module is that guard, in the shared layer, so every surface that renders
// provenance inherits it: THE DOOR LAW is "every identity the UI names opens",
// and a link to a 401 does not open — it lies.
//
// Pure: no React.

/** What a surface may do with a `source_url`. */
export type ProvenanceDoor =
  /** An in-app route: `<Link href>`. */
  | { kind: "internal"; href: string }
  /** A real web page elsewhere: `<a target="_blank">`. */
  | { kind: "external"; href: string }
  /**
   * There is a source, but it is a machine address, not a page. The chip is
   * rendered WITHOUT a door and says so, rather than being hidden (the
   * provenance is still true) or linked (it would not open).
   */
  | { kind: "not-a-page"; reason: string };

/**
 * Hosts whose URLs are API endpoints, never pages a person may open. Matched on
 * the host, so a path change cannot walk past it.
 */
const API_HOSTS = [
  /(^|\.)googleapis\.com$/i,
  /(^|\.)apis\.google\.com$/i,
  /^api\./i,
];

/** Path shapes that are an API even on a host that also serves pages. */
const API_PATHS = [/^\/v\d+(\/|$)/i, /^\/api(\/|$)/i, /\.json$/i];

/**
 * Decide what a `source_url` is. A value that is not an absolute http(s) URL and
 * not an in-app path is not a door either: it is an identity we cannot open.
 */
export function provenanceDoorFor(sourceUrl: string): ProvenanceDoor {
  const value = sourceUrl.trim();
  if (!value) {
    return { kind: "not-a-page", reason: "There is no link recorded." };
  }
  if (value.startsWith("/")) return { kind: "internal", href: value };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      kind: "not-a-page",
      reason:
        "The recorded source is an identifier, not a web address, so there is nothing to open.",
    };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      kind: "not-a-page",
      reason: "The recorded source is not a web address, so there is nothing to open.",
    };
  }
  if (
    API_HOSTS.some((pattern) => pattern.test(url.hostname)) ||
    API_PATHS.some((pattern) => pattern.test(url.pathname))
  ) {
    return {
      kind: "not-a-page",
      reason:
        "The link the provider gives us is a data address, not a page — opening it would show an error, so it is not a link here.",
    };
  }
  return { kind: "external", href: value };
}
