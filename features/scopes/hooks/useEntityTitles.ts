// features/scopes/hooks/useEntityTitles.ts
//
// React binding for the entity-title resolver. Give it the (token, id, label)
// rows a surface is about to render; it returns a resolver that ALWAYS yields
// a human title — edge label first, fetched title second, `Untitled <type>`
// last. Fetches are batched per token and memoized in the service cache, so
// re-renders and sibling surfaces are free.
//
// `isUnresolved` is the LOUD half: the resolver deliberately omits ids the
// viewer cannot read (deleted row, or no access), and "Untitled Note" for a
// record that is actually gone reads as a healthy row. A surface that can tell
// the difference must say so — never render an edge as fine when its target
// could not be resolved.

"use client";

import { useEffect, useState } from "react";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  entityTitleCacheKey,
  entityTitleFallback,
  fetchEntityTitles,
  getCachedEntityTitle,
} from "@/features/scopes/service/entityTitles";

export interface EntityTitleRef {
  token: string;
  id: string;
  /** The edge label (or any already-known title) — wins when present. */
  label?: string | null;
}

export interface UseEntityTitlesReturn {
  /** Resolve the display title for one ref (never a UUID). */
  titleFor: (ref: EntityTitleRef) => string;
  /**
   * True when this ref's target could NOT be resolved after a settled fetch —
   * the row is gone or the viewer has no access, and `titleFor` is returning a
   * generic fallback. Surfaces MUST render this loudly (and offer the detach).
   * Always false for tokens with no registered title column (nothing to
   * resolve there — silence is correct, not a failure).
   */
  isUnresolved: (ref: EntityTitleRef) => boolean;
  /** True while any needed titles are still being fetched. */
  loading: boolean;
}

export function useEntityTitles(refs: EntityTitleRef[]): UseEntityTitlesReturn {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  // Keys we have already asked the resolver for and it has answered. A key that
  // is attempted but absent from `resolved`/cache is genuinely unreachable.
  const [attempted, setAttempted] = useState<Record<string, true>>({});
  const [loading, setLoading] = useState(false);

  // The refs that actually need a fetch: no label, not already cached.
  const needed = refs.filter(
    (r) =>
      !(r.label && r.label.trim()) && getCachedEntityTitle(r.token, r.id) == null,
  );
  // Stable dependency for the effect — the set of unresolved keys.
  const neededKey = needed
    .map((r) => entityTitleCacheKey(r.token, r.id))
    .sort()
    .join("|");

  useEffect(() => {
    if (!neededKey) return;
    let cancelled = false;
    setLoading(true);

    const byToken = new Map<string, string[]>();
    for (const key of neededKey.split("|")) {
      const sep = key.indexOf(":");
      const token = key.slice(0, sep);
      const id = key.slice(sep + 1);
      const list = byToken.get(token) ?? [];
      list.push(id);
      byToken.set(token, list);
    }

    void Promise.all(
      [...byToken.entries()].map(async ([token, ids]) => {
        const titles = await fetchEntityTitles(token, ids);
        return [token, titles] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      setResolved((prev) => {
        const next = { ...prev };
        for (const [token, titles] of results) {
          for (const [id, title] of titles) {
            next[entityTitleCacheKey(token, id)] = title;
          }
        }
        return next;
      });
      setAttempted((prev) => {
        const next = { ...prev };
        for (const key of neededKey.split("|")) next[key] = true;
        return next;
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [neededKey]);

  const titleFor = (ref: EntityTitleRef): string => {
    if (ref.label && ref.label.trim()) return ref.label;
    const key = entityTitleCacheKey(ref.token, ref.id);
    return (
      resolved[key] ??
      getCachedEntityTitle(ref.token, ref.id) ??
      entityTitleFallback(ref.token)
    );
  };

  const isUnresolved = (ref: EntityTitleRef): boolean => {
    if (ref.label && ref.label.trim()) return false;
    // No title column registered → the resolver was never going to answer.
    if (!tryGetEntityInfo(ref.token)?.titleColumn) return false;
    const key = entityTitleCacheKey(ref.token, ref.id);
    if (resolved[key] || getCachedEntityTitle(ref.token, ref.id)) return false;
    return attempted[key] === true;
  };

  return { titleFor, isUnresolved, loading };
}
