"use client";

// features/education/convert/MadeFromSource.tsx
//
// "Made from YOUR material" — the strip that proves a generated artifact came
// out of the student's own upload, and opens it.
//
// The gap it closes (reported 2026-08-21): a student uploaded a 77-slide PDF,
// landed on the generated deck, and said "I don't even see that it's connected
// to the original data." The lineage edge was there the whole time; every
// artifact page rendered only the FORWARD direction (things generated FROM this
// artifact) and never the backward one. So the grounding the whole education
// platform is built on was invisible at exactly the moment it mattered.
//
// It renders two things, because a student who asks "where did this come from"
// is usually also asking "where is the rest of what you made me":
//   1. The SOURCE, as a link that opens it (THE DOOR LAW).
//   2. The SIBLINGS — every other artifact from the same source, i.e. the rest
//      of the kit — each opening too.
//
// ONE component, used by every artifact surface. Its forward-direction twin is
// `GeneratedFromChips`; do not grow a third lineage renderer.

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, CornerUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  listGeneratedFrom,
  readArtifactOrigin,
  type ArtifactOrigin,
  type GeneratedArtifact,
} from "./lineage";

export function MadeFromSource({
  /** The artifact's canonical token ("fc_set", "study_media", "note", "assessment"). */
  entityType,
  entityId,
  className,
}: {
  entityType: string;
  entityId: string;
  className?: string;
}) {
  const [origin, setOrigin] = useState<ArtifactOrigin | null>(null);
  const [siblings, setSiblings] = useState<GeneratedArtifact[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const found = await readArtifactOrigin(entityType, entityId);
      if (!active) return;
      setOrigin(found);
      if (!found) return;
      const all = await listGeneratedFrom(found.entityType, found.entityId);
      if (!active) return;
      // Everything else the same source produced: the rest of the kit.
      setSiblings(all.filter((a) => a.artifactId !== entityId));
    })();
    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  // No lineage edge means this artifact genuinely has no recorded origin
  // (hand-made, or made before lineage was recorded). Say nothing rather than
  // claim a source we cannot open.
  if (!origin) return null;

  const OriginIcon = tryGetEntityInfo(origin.entityType)?.Icon ?? FileText;
  const originLabel = origin.href
    ? "Open the material this was made from"
    : "The material this was made from";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/40 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          Made from your material
        </span>
        {origin.href ? (
          <Link
            href={origin.href}
            title={originLabel}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
          >
            <OriginIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">Open the source</span>
          </Link>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <OriginIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{originLabel}</span>
          </span>
        )}
      </div>

      {siblings.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Also made from it:
          </span>
          {siblings.map((s) => (
            <Link
              key={s.edgeId}
              href={s.href}
              className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-muted"
            >
              <span className="truncate">{s.title}</span>
              {s.detail && (
                <span className="shrink-0 text-muted-foreground">
                  · {s.detail}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
