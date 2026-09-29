"use client";

/**
 * One finished clip — the view for the `press.clip.make` result (and the
 * `press_clip_render` it carries). Used by the Make clip dialog and the clips
 * gallery. Files are opened by `file_id` in the in-app viewer, never by a
 * signed URL (a signed URL is a handoff, never an identity).
 */

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { InlineMediaRef } from "@ai-matrx/media/react";

import { cn } from "@/lib/utils";

import type { MakeClipResult } from "./api";

export function fileViewerHref(fileId: string): string {
  return `/files/f/${encodeURIComponent(fileId)}`;
}

export function ClipView({ result, compact = false }: { result: MakeClipResult; compact?: boolean }) {
  if (result.status === "client_absent" || !result.clip) {
    return (
      <div
        className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs"
        data-testid="clip-client-absent"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div>
          <p className="font-medium text-foreground">No clip made</p>
          <p className="mt-0.5 text-muted-foreground">{result.message}</p>
          <a
            href={result.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
          >
            Read the article <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>
    );
  }
  const clip = result.clip;
  const clean = result.imperfections.length === 0;
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-[96px_minmax(0,1fr)]" : "sm:grid-cols-[160px_minmax(0,1fr)]")} data-testid="clip-view">
      <Link
        href={fileViewerHref(clip.preview_file_id)}
        className="block overflow-hidden rounded-md border border-border bg-white"
        style={{ height: compact ? 120 : 200 }}
        title="Open the full-page preview"
      >
        <InlineMediaRef
          ref={{ file_id: clip.preview_file_id, mime_type: "image/png" }}
          alt={`Preview of the clip: ${clip.headline ?? clip.source_url}`}
          size="fill"
          fit="cover"
          fallback="skeleton"
        />
      </Link>
      <div className="min-w-0 space-y-1.5 text-xs">
        <p className="font-medium text-foreground">{clip.headline ?? "No headline was found on the page"}</p>
        <p className="text-muted-foreground">
          {clip.outlet_name ?? new URL(clip.source_url).hostname}
          {clip.byline ? ` · ${clip.byline}` : " · no byline on the page"}
          {clip.published_at ? ` · ${clip.published_at.slice(0, 10)}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={fileViewerHref(clip.pdf_file_id)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <FileText className="h-3.5 w-3.5" aria-hidden /> Open the PDF
          </Link>
          <a href={clip.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            Original <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          <span className="text-muted-foreground">
            {result.rounds.length} of {result.max_rounds} round{result.max_rounds === 1 ? "" : "s"} · logo:{" "}
            {clip.logo_source.replaceAll("_", " ")}
          </span>
        </div>
        {clean ? (
          <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Clean: the reviewer found nothing left to fix.
          </p>
        ) : (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2" data-testid="clip-imperfections">
            <p className="font-medium text-foreground">Still imperfect</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {result.imperfections.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
