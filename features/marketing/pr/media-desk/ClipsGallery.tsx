"use client";

/**
 * The brand's clips gallery — every finished clip for the brand's sites, newest
 * first, each with its honest note. The "Make clip" action for a pasted link
 * lives in this header.
 */

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useClipsGallery } from "./clips-data";
import { ClipView } from "./ClipView";
import { MakeClipDialog } from "./MakeClipDialog";

export function ClipsGallery({
  siteIds,
  activeSiteId,
  clientName,
}: {
  siteIds: readonly string[];
  /** Where a pasted-link clip is filed (the Press Room's selected site). */
  activeSiteId: string | null;
  clientName: string;
}) {
  const clips = useClipsGallery(siteIds);
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card" data-testid="clips-gallery">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clips</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {clips.data ? `${clips.data.length} made` : ""}
          </span>
          {activeSiteId ? (
            <MakeClipDialog
              siteId={activeSiteId}
              defaultClientName={clientName}
              trigger={
                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
                  Make clip from a link
                </Button>
              }
            />
          ) : null}
        </div>
      </div>
      {clips.isLoading ? (
        <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading clips…
        </p>
      ) : clips.isError ? (
        <div className="px-3 py-4 text-xs text-destructive">
          The clips could not be read ({clips.error instanceof Error ? clips.error.message : String(clips.error)}).{" "}
          <button type="button" className="underline" onClick={() => void clips.refetch()}>
            Try again
          </button>
        </div>
      ) : (clips.data ?? []).length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
          No clips yet. Use &ldquo;Make clip&rdquo; on a piece of coverage below, or paste any article link.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {(clips.data ?? []).map((clip) => (
            <li key={clip.runId} className="p-3">
              <ClipView result={clip.result} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
