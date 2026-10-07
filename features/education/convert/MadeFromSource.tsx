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

import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import Link from "next/link";
import { FileText, CornerUpLeft, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { kitHref, readKit } from "@/features/education/kits/kitService";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  listGeneratedFrom,
  readArtifactOrigins,
  recordedOrigins,
  type ArtifactOrigin,
  type GeneratedArtifact,
} from "./lineage";
import { LineageArtifactList } from "./LineageArtifactList";
import { Chip } from "@ai-matrx/design-system/controls";
import { readDeckSourceDrafts } from "@/features/flashcards/data/deckSourceSet";

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
  // Read once per artifact (`useStoreRead`): a remount or a wake renders the kept answer.
  const read = useStoreRead<{ origins: ArtifactOrigin[]; siblings: GeneratedArtifact[]; kit?: ArtifactOrigin }>(
    `education.made_from:${entityType}:${entityId}`,
    async () => {
      // Every Source it was made from (a deck from a PDF and a note has two).
      const edges = await readArtifactOrigins(entityType, entityId);
      // A deck records every Source it was made from, as chosen — tables and
      // pick lists included, which no lineage edge can carry. That is the list.
      const recorded = entityType === "fc_set" ? await readDeckSourceDrafts(entityId) : null;
      const allOrigins = recorded
        ? recordedOrigins(
            recorded.flatMap((d) =>
              d.ref
                ? [{ resourceType: d.ref.resource_type, resourceId: d.ref.resource_id, label: d.label, fileId: d.fileId }]
                : [],
            ),
            edges,
          )
        : edges;
      // The kit is found from a real lineage edge (siblings share its anchor).
      const found = edges[0] ?? allOrigins[0];
      if (!found) return { origins: allOrigins, siblings: [], kit: undefined };
      // A multi-source kit: the kit is the door, its aids are the siblings.
      if (found.kitId) {
        const kit = await readKit("scope", found.kitId);
        return {
          origins: allOrigins,
          kit: { edgeId: `kit:${found.kitId}`, entityType: "scope", entityId: found.kitId, href: undefined, title: kit?.title ?? null },
          siblings: (kit?.artifacts ?? []).filter((a) => a.artifactId !== entityId),
        };
      }
      const all = await listGeneratedFrom(found.entityType, found.entityId);
      // The rest of the KIT — the artifacts, not their parts. Every generated
      // flashcard also writes its own card-level lineage edge to the anchor
      // file, so an unfiltered read of a source's incoming edges returns the
      // whole deck one card at a time. A converter artifact is exactly the edge
      // `recordSourceLineage` stamped with a `targetKind`; a card-level edge has
      // none, which is the honest discriminator rather than a type blocklist.
      return {
        origins: allOrigins,
        kit: found,
        siblings: all.filter((a) => a.targetKind !== null && a.artifactId !== entityId),
      };
    },
  );
  const origins = read.data?.origins ?? [];
  const siblings = read.data?.siblings ?? [];
  const kit = read.data?.kit ?? origins[0];

  // No lineage edge means this artifact genuinely has no recorded origin
  // (hand-made, or made before lineage was recorded). Say nothing rather than
  // claim a source we cannot open.
  const origin = origins[0];
  if (!origin) return null;

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
          Made from
        </span>
        {origins.map((o) => {
          const OriginIcon = tryGetEntityInfo(o.entityType)?.Icon ?? FileText;
          const name = o.title || "Source";
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
        {/* The KIT door. The sibling list answers "what else exists"; this
            answers "take me to the whole thing", which is the page the learner
            actually wants when they arrive on one piece of it. */}
        <Chip asChild tone="primary" icon={<Package />} label="Related" title="Everything made from this material">
          <Link href={kitHref((kit ?? origin).entityType, (kit ?? origin).entityId)} />
        </Chip>
      </div>

      <LineageArtifactList
        heading="Also made from it"
        items={siblings}
        className="mt-2 border-t border-border/60 pt-2"
      />
    </div>
  );
}
