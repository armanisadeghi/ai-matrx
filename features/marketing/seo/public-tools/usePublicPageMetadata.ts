"use client";

/**
 * usePublicPageMetadata — the ONE guest-friendly "read this page's meta tags"
 * fetch for the public SEO tools.
 *
 * These pages (`/seo/metadata`, `/seo/social-preview`) are anonymous marketing
 * surfaces: they never offer sign-in, so they may only call endpoints mounted
 * with `require_guest_or_above`. That rules out `/scraper/quick-scrape` —
 * aidream mounts the ENTIRE `/scraper` router behind `require_authenticated`,
 * so an anonymous visitor got a 401 and a "please sign in" toast on a page with
 * nowhere to sign in (FOUND_DEFECTS D137).
 *
 * The public `/seo/public/page-audit` route already fetches the page and runs
 * the canonical `matrx_scraper.seo_audit` extractor, whose result carries every
 * field these tools need — `title`, `meta_description`, `canonical`, and the
 * full `og` / `twitter` tag maps. So this is a reuse, not a new capability:
 * one guest-safe endpoint, no second fetcher anywhere.
 */

import { useCallback } from "react";

import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";

/** Normalize user input for the public tools — a bare domain gets https. */
export function normalizeToolUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

/** The subset of the page-audit payload these tools read. */
export interface PublicPageMetadata {
  /** URL actually fetched, after redirects. */
  fetchedUrl: string;
  /** `<title>` text. */
  title: string;
  /** `<meta name="description">`. */
  description: string;
  /** `rel=canonical`, when the page declares one. */
  canonical: string;
  /** Open Graph tags keyed exactly as authored (`og:title`, …). */
  og: Record<string, string>;
  /** Twitter card tags keyed exactly as authored (`twitter:card`, …). */
  twitter: Record<string, string>;
}

function stringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function tagMap(source: Record<string, unknown>, key: string): Record<string, string> {
  const value = source[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [tag, tagValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof tagValue === "string") out[tag] = tagValue.trim();
  }
  return out;
}

export interface SeoMetaFields {
  url: string;
  title: string;
  description: string;
}

/** Meta title / description / canonical — what a SERP snippet is built from. */
export function toSeoMetaFields(meta: PublicPageMetadata): SeoMetaFields {
  return {
    url: meta.canonical || meta.og["og:url"] || meta.fetchedUrl,
    title: meta.title || meta.og["og:title"] || meta.twitter["twitter:title"] || "",
    description:
      meta.description ||
      meta.og["og:description"] ||
      meta.twitter["twitter:description"] ||
      "",
  };
}

export interface SocialMetaFields {
  url: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogSiteName: string;
  ogType: string;
  twitterCard: string;
}

/** Open Graph + Twitter card tags — what a share preview is built from. */
export function toSocialMetaFields(meta: PublicPageMetadata): SocialMetaFields {
  const { og, twitter } = meta;
  return {
    url: og["og:url"] || meta.canonical || meta.fetchedUrl,
    ogTitle: og["og:title"] || twitter["twitter:title"] || meta.title,
    ogDescription:
      og["og:description"] || twitter["twitter:description"] || meta.description,
    ogImage:
      og["og:image"] ||
      og["og:image:secure_url"] ||
      twitter["twitter:image"] ||
      twitter["twitter:image:src"] ||
      "",
    ogSiteName: og["og:site_name"] || "",
    ogType: og["og:type"] || "",
    twitterCard: twitter["twitter:card"] || "",
  };
}

/**
 * Fetch a page's meta tags through the public (guest-friendly) SEO router.
 * Throws with the backend's own message so callers can toast the real reason.
 */
export function usePublicPageMetadata() {
  const dispatch = useAppDispatch();

  const fetchPageMetadata = useCallback(
    async (url: string): Promise<PublicPageMetadata> => {
      let audit: Record<string, unknown> | null = null;
      let fetchedUrl = url;
      let streamError: string | null = null;

      const response = await dispatch(
        callApi({
          path: "/seo/public/page-audit",
          method: "POST",
          body: { url },
          stream: true,
          onStreamEvent: (evt) => {
            if (evt.event === "error") {
              const data = evt.data as { user_message?: string; message?: string };
              streamError = data.user_message ?? data.message ?? "Fetch failed";
              return;
            }
            if (evt.event !== "data") return;
            const data = evt.data as unknown as Record<string, unknown>;
            // Take the payload from whichever event carries the audit result —
            // the terminal `seo.page_audit_result` on a fresh or replayed run,
            // or the `seo.scoring_completed` stage event that carries the same
            // object. One rule instead of a list of event names.
            const result = data.result as
              | {
                  result_kind?: string;
                  fetched_url?: string;
                  audit?: Record<string, unknown>;
                }
              | undefined;
            if (!result || result.result_kind !== "public.page_audit") return;
            if (typeof result.fetched_url === "string" && result.fetched_url) {
              fetchedUrl = result.fetched_url;
            }
            audit = result.audit ?? null;
          },
        }),
      );

      if (response.error) throw new Error(response.error.message);
      if (streamError) throw new Error(streamError);
      if (!audit) throw new Error("No metadata returned for that URL");

      const source: Record<string, unknown> = audit;
      return {
        fetchedUrl,
        title: stringField(source, "title"),
        description: stringField(source, "meta_description"),
        canonical: stringField(source, "canonical"),
        og: tagMap(source, "og"),
        twitter: tagMap(source, "twitter"),
      };
    },
    [dispatch],
  );

  return { fetchPageMetadata };
}
