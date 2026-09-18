"use client";

/**
 * Where a test case's material came from, on the sample row itself.
 *
 * `source = 'library'` is a value this list had never seen before the media
 * catalog's "Use as test cases for an agent…" action started writing rows into
 * it, and a sample whose material is somebody's channel is useless if the
 * screen cannot say which channel. THE DOOR LAW applies to both names printed
 * here: the Library opens at /libraries/<id>, and a single catalogued item
 * opens at its own url.
 *
 * It renders NOTHING for every other source (captured, borrowed, bench) —
 * those already carry their own provenance affordance (the "open the run"
 * link), and a second origin line under them would be noise.
 */

import Link from "next/link";
import { ExternalLink, Library } from "lucide-react";
import {
  sampleLibraryOrigin,
  type AgentSampleRow,
} from "@/features/agents/samples/service";

export function SampleOriginLine({
  sample,
}: {
  sample: Pick<AgentSampleRow, "source" | "metadata">;
}) {
  const origin = sampleLibraryOrigin(sample);
  if (!origin) return null;

  const libraryName = origin.libraryName ?? "a Library";
  const itemLabel = origin.item?.title ?? origin.item?.url ?? null;

  return (
    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Library className="h-3 w-3 shrink-0" aria-hidden />
      <span>From</span>
      {origin.libraryId ? (
        <Link
          href={`/libraries/${origin.libraryId}`}
          target="_blank"
          className="font-medium underline underline-offset-2"
        >
          {libraryName}
        </Link>
      ) : (
        <span className="font-medium">{libraryName}</span>
      )}
      {origin.item ? (
        <>
          <span aria-hidden>·</span>
          {origin.item.url ? (
            <Link
              href={origin.item.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-[18rem] items-center gap-1 truncate underline underline-offset-2"
            >
              <span className="truncate">{itemLabel ?? origin.item.url}</span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </Link>
          ) : (
            <span className="max-w-[18rem] truncate">{itemLabel}</span>
          )}
        </>
      ) : origin.itemCount > 1 ? (
        <>
          <span aria-hidden>·</span>
          <span>{origin.itemCount} items</span>
        </>
      ) : null}
    </p>
  );
}
