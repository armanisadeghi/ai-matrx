"use client";

import { useEffect, useState } from "react";
import { FileCode } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTabById } from "@/features/code/redux/tabsSlice";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import type { HtmlPageRecord } from "@/features/html-pages/types";
import type { RenderPreviewerProps } from "@/features/code/preview/renderPreviewRegistry";

/**
 * Render-preview for `html-page:` library tabs.
 *
 * Mirrors `HtmlPageEditor` preview semantics:
 *  - Dirty / no published URL → `srcDoc` of the live Monaco buffer (unsaved edits).
 *  - Clean + published URL → `src` of `page.url?preview=1` so relative assets
 *    resolve against the public HTML host (mymatrx.com), not aimatrx.com.
 *
 * Metadata columns (title, OG, etc.) are SEO-only and do not affect the iframe
 * unless already embedded in `html_content`. Only `html_content` / the live
 * buffer drives what you see.
 */
export function HtmlPageRenderPreview({
  rowId,
  code,
  sourceTabId,
}: RenderPreviewerProps) {
  const sourceTab = useAppSelector(selectTabById(sourceTabId));
  const isDirty = sourceTab?.dirty === true;
  const [page, setPage] = useState<HtmlPageRecord | null>(null);

  // Load (and re-load after save) so clean-state URL preview picks up the
  // latest published `updated_at` / content. Dirty edits stay on srcDoc.
  useEffect(() => {
    if (isDirty) return undefined;
    let cancelled = false;
    void HTMLPageService.getPage(rowId)
      .then((data) => {
        if (cancelled) return;
        setPage(data as HtmlPageRecord);
      })
      .catch((err: unknown) => {
        // Non-fatal: live buffer still previews via srcDoc.
        console.error(
          "[HtmlPageRenderPreview] failed to load page metadata:",
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [rowId, isDirty]);

  const trimmed = code.trim();
  if (!trimmed) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-neutral-500 dark:text-neutral-400">
          <FileCode size={36} strokeWidth={1.2} />
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Empty HTML buffer
          </div>
          <p className="text-xs leading-relaxed">
            Add HTML in the source tab to see a live preview here.
          </p>
        </div>
      </div>
    );
  }

  // Prefer the published URL when the tab is clean so relative paths / assets
  // match production. Fall back to srcDoc for drafts and when metadata hasn't
  // loaded yet (or the page has no public URL).
  const useLiveUrl = !!page?.url && !isDirty;

  return (
    <iframe
      key={
        useLiveUrl ? `live-${page!.id}-${page!.updated_at}` : `draft-${rowId}`
      }
      title={page?.meta_title || sourceTab?.name || "HTML preview"}
      {...(useLiveUrl
        ? {
            src: `${page!.url}${page!.url.includes("?") ? "&" : "?"}preview=1`,
          }
        : { srcDoc: code })}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      className="block h-full w-full border-0 bg-white dark:bg-zinc-950"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowFullScreen
    />
  );
}
