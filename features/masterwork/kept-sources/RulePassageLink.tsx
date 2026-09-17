"use client";

// features/masterwork/kept-sources/RulePassageLink.tsx
//
// THE JUMP, from a rule to the words it came out of.
//
// Shown ONLY when the source's raw material was actually kept. Every rule
// written before 2026-09-17 points at a source that was read and discarded, and
// offering all of them a link that lands on "these words weren't kept" would
// put a disappointment on every old rule in the Rulebook. The reader still
// answers honestly if somebody arrives there by URL — this decides whether to
// INVITE them.
//
// The rulebook id comes from the route rather than a prop because `RuleRow` is
// rendered from several places and threading an id through all of them to
// decorate one line would be a worse change than reading the one thing the URL
// already knows.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Quote } from "lucide-react";
import { listKeptSourceKeys } from "./service";
import type { RulebookRule } from "../types";

/** Kept-source keys per Rulebook, read once per mounted Rulebook. */
const cache = new Map<string, Set<string>>();

export function RulePassageLink({ rule }: { rule: RulebookRule }) {
  const params = useParams();
  const rulebookId = typeof params?.id === "string" ? params.id : null;
  const sourceKey = rule.source_ref?.source ?? null;
  const [kept, setKept] = useState<Set<string> | null>(
    rulebookId ? (cache.get(rulebookId) ?? null) : null,
  );

  useEffect(() => {
    if (!rulebookId || !sourceKey || cache.has(rulebookId)) return;
    let cancelled = false;
    listKeptSourceKeys(rulebookId)
      .then((keys) => {
        cache.set(rulebookId, keys);
        if (!cancelled) setKept(keys);
      })
      .catch((err: unknown) => {
        // A failed read means we do not KNOW whether the words were kept, so
        // the link stays hidden. Never a link we cannot stand behind.
        console.error("[masterwork] kept-source keys read failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [rulebookId, sourceKey]);

  if (!rulebookId || !sourceKey || !kept?.has(sourceKey)) return null;

  return (
    <Link
      href={`/masterwork/${rulebookId}/sources/kept/${encodeURIComponent(
        sourceKey,
      )}?rule=${encodeURIComponent(rule.id)}`}
      data-tap-target
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      title="Read this rule's own words in the source they came from"
    >
      <Quote className="h-3 w-3" />
      Read the passage
    </Link>
  );
}
