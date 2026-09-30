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
import { FileText, CornerUpLeft, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { kitHref } from "@/features/education/kits/kitService";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  listGeneratedFrom,
  readArtifactOrigins,
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
  const [origins, setOrigins] = useState<ArtifactOrigin[]>([]);
  const [siblings, setSiblings] = useState<GeneratedArtifact[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      // Every Source it was made from (a deck from a PDF and a note has two).
      const allOrigins = await readArtifactOrigins(entityType, entityId);
      if (!active) return;
      setOrigins(allOrigins);
      const found = allOrigins[0];
      if (!found) return;
      const all = await listGeneratedFrom(found.entityType, found.entityId);
      if (!active) return;
      // The rest of the KIT — the artifacts, not their parts. Every generated
      // flashcard also writes its own card-level lineage edge to the anchor
      // file, so an unfiltered read of a source's incoming edges returns the
      // whole deck one card at a time. A converter artifact is exactly the edge
      // `recordSourceLineage` stamped with a `targetKind`; a card-level edge has
      // none, which is the honest discriminator rather than a type blocklist.
      setSiblings(
        all.filter((a) => a.targetKind !== null && a.artifactId !== entityId),
      );
    })();
    return () => {
      active = false;
    };
  }, [entityType, entityId]);

  // No lineage edge means this artifact genuinely has no recorded origin
  // (hand-made, or made before lineage was recorded). Say nothing rather than
  // claim a source we cannot open.
  const origin = origins[0];
  if (!origin) return null;
  const many = origins.length > 1;

  return (
    <div
      className={cn(
        "matrx-touch-targets rounded-xl border border-border bg-muted/40 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          Made from your material
        </span>
        {/* The KIT door. Siblings as chips answer "what else exists"; this
            answers "take me to the whole thing", which is the page the learner
            actually wants when they arrive on one piece of it. */}
        <Link
          href={kitHref(origin.entityType, origin.entityId)}
          title="Everything made from this material"
          data-tap-target
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <Package className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Everything made from it</span>
        </Link>
        {origins.map((o) => {
          const OriginIcon = tryGetEntityInfo(o.entityType)?.Icon ?? FileText;
          const name = many ? o.title || "Source" : "Open the source";
          const label = o.href
            ? `Open ${o.title ? `"${o.title}"` : "the material this was made from"}`
            : `${o.title ?? "The material this was made from"}`;
          return o.href ? (
            <Link
              key={o.edgeId}
              href={o.href}
              title={label}
              data-tap-target
              className="inline-flex min-w-0 max-w-[16rem] items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
            >
              <OriginIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{name}</span>
            </Link>
          ) : (
            <span
              key={o.edgeId}
              className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
            >
              <OriginIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </span>
          );
        })}
      </div>

      {siblings.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Also made from it:
          </span>
          {siblings.map((s) => (
            <Link
              key={s.edgeId}
              href={s.href}
              title={s.detail ? `${s.title} · ${s.detail}` : s.title}
              data-tap-target
              className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-muted sm:max-w-[24rem]"
            >
              <span className="min-w-0 truncate">{s.title}</span>
              {s.detail && (
                <span className="max-w-[12rem] shrink truncate text-muted-foreground">
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
