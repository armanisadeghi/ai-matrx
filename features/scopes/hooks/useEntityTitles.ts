// features/scopes/hooks/useEntityTitles.ts
//
// React binding for the entity-title resolver. Give it the (token, id, label)
// rows a surface is about to render; it returns a resolver that ALWAYS yields
// a human title — edge label first, fetched title second, `Untitled <type>`
// last. Fetches are batched per token and memoized in the service cache, so
// re-renders and sibling surfaces are free.

"use client";

import { useEffect, useState } from "react";
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
  /** True while any needed titles are still being fetched. */
  loading: boolean;
}

export function useEntityTitles(refs: EntityTitleRef[]): UseEntityTitlesReturn {
  const [resolved, setResolved] = useState<Record<string, string>>({});
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

  return { titleFor, loading };
}
