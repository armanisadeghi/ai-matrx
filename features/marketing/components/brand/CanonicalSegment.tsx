"use client";

/**
 * Canonical-address helpers for the dual-mode marketing segments.
 *
 * Every `[brandId]` / `[siteId]` segment resolves from a UUID **or** a key, but
 * exactly ONE address is canonical: the key. A server layout cannot see the
 * full pathname (only its own params), so it resolves the row, computes the
 * expected segment, and renders one of these. When the address in the URL is
 * not the canonical one, the helper rewrites that single segment in place —
 * `router.replace`, so Back still goes where the user came from, and the query
 * string rides along untouched (a `?site=` picker or `?brief=` handoff must
 * survive canonicalization).
 *
 * Renders nothing. Mount it beside the provider, never instead of it.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

interface CanonicalSegmentProps {
  /** The segment as it appears in the URL right now (an address). */
  param: string;
  /** The canonical segment for the resolved row (`marketingSeg(row)`). */
  expected: string;
}

/**
 * Swap the first `/marketing/…` path segment that equals `param` (index 2 and
 * beyond — `/marketing` itself is never a candidate) for `expected`.
 * Returns null when nothing needs to change.
 */
export function canonicalizePath(
  pathname: string,
  param: string,
  expected: string,
): string | null {
  if (param === expected) return null;
  const segments = pathname.split("/");
  const index = segments.indexOf(param, 2);
  if (index < 2) return null;
  segments[index] = expected;
  return segments.join("/");
}

function useCanonicalSegment(param: string, expected: string): void {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const next = canonicalizePath(pathname, param, expected);
    if (!next) return;
    // Read the query from the document rather than `useSearchParams()`: this
    // component mounts in a layout, and the hook would opt the whole subtree
    // into a Suspense requirement for a value only an effect ever reads.
    const search = window.location.search;
    router.replace(`${next}${search}`, { scroll: false });
  }, [router, pathname, param, expected]);
}

/** Canonicalizes `/marketing/[brandId]` to the brand's key address. */
export function CanonicalBrandSegment({
  param,
  expected,
}: CanonicalSegmentProps) {
  useCanonicalSegment(param, expected);
  return null;
}

/** Canonicalizes a `websites/[siteId]` / `seo/[siteId]` segment to the key. */
export function CanonicalSiteSegment({
  param,
  expected,
}: CanonicalSegmentProps) {
  useCanonicalSegment(param, expected);
  return null;
}
