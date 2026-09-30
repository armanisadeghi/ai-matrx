"use client";

/**
 * The tags on every listed row, read together (one batch per page of rows) —
 * so a row shows the tags its peek shows, whatever list it came from. Re-read
 * when `version` changes (after a tag or filing write).
 */

import { useEffect, useRef, useState } from "react";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import { actionTarget } from "@/features/knowledge/hub/hubActions";
import { listTagsForItems } from "./tagApi";

export function useRowTags(hits: KnowledgeHit[], enabled: boolean, version: number) {
  const [tags, setTags] = useState<Map<string, string[]>>(new Map());
  const asked = useRef<{ version: number; keys: Set<string> }>({ version: -1, keys: new Set() });
  const targets = enabled ? hits.map(actionTarget) : [];
  const keys = targets.map((t) => `${t.entity}:${t.id}`);
  const missing = asked.current.version === version ? keys.filter((k) => !asked.current.keys.has(k)) : keys;
  const missingKey = [...new Set(missing)].sort().join("|");

  useEffect(() => {
    if (!missingKey) return;
    if (asked.current.version !== version) asked.current = { version, keys: new Set() };
    const wanted = missingKey.split("|");
    wanted.forEach((k) => asked.current.keys.add(k));
    let cancelled = false;
    const items = wanted.map((k) => {
      const i = k.indexOf(":");
      return { entity: k.slice(0, i), id: k.slice(i + 1) };
    });
    listTagsForItems(items)
      .then((m) => {
        if (cancelled) return;
        setTags((prev) => {
          const next = asked.current.version === version && prev.size ? new Map(prev) : new Map<string, string[]>();
          for (const k of wanted) next.set(k, (m.get(k) ?? []).map((t) => t.name));
          return next;
        });
      })
      .catch(() => {
        // A failed read leaves the rows showing the tags their own list carried (never an empty claim).
        wanted.forEach((k) => asked.current.keys.delete(k));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, version]);

  return (hit: KnowledgeHit): string[] | undefined => {
    const t = actionTarget(hit);
    return tags.get(`${t.entity}:${t.id}`);
  };
}
