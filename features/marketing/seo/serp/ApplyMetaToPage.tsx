"use client";

/**
 * Apply a generated title/description to a real page's DESIRED metadata.
 *
 * This closes the loop that used to dead-end: an agent generates five candidate
 * titles in chat, the user reads them, and then has to retype the winner into
 * the marketing Page Workspace by hand. Now the candidate itself is actionable
 * — pick a page, see exactly what changes, write it.
 *
 * Lives in the SERP core (not in the tool renderer) on purpose: ANY surface
 * that renders a SERP entry — chat tool result, page workspace, the Search
 * Appearance analyzer, a future bulk view — gets the same action for free.
 *
 * The write goes through `updatePageIntent`, the ONE canonical desired-metadata
 * path: optimistically locked on `version` and it recomputes
 * `seo_metrics_desired` with the deterministic evaluator, so numbers written
 * from chat are byte-identical to numbers written from the workspace.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, Search, Send } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import { cn } from "@/lib/utils";
import {
  searchPagesForMetaApply,
  updatePageIntent,
} from "@/features/marketing/data/service";
import type { MetaApplyTarget } from "@/features/marketing/types";

export interface ApplyMetaToPageProps {
  title?: string;
  description?: string;
  /** Rendered as the trigger. Omit for the default compact button. */
  className?: string;
}

/** One field's before → after, or null when this apply does not touch it. */
function FieldDiff({
  label,
  current,
  next,
}: {
  label: string;
  current: string | null;
  next?: string;
}) {
  if (!next) return null;
  const unchanged = current === next;
  return (
    <div className="grid gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {current ? (
        <span
          className={cn(
            "text-xs text-muted-foreground",
            !unchanged && "line-through",
          )}
        >
          {current}
        </span>
      ) : (
        <span className="text-xs italic text-muted-foreground">not set</span>
      )}
      <span className="flex items-start gap-1.5 text-sm text-foreground">
        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>{next}</span>
      </span>
      {unchanged ? (
        <span className="text-[11px] text-muted-foreground">
          Already the desired {label.toLowerCase()} on this page.
        </span>
      ) : null}
    </div>
  );
}

export function ApplyMetaToPage({
  title,
  description,
  className,
}: ApplyMetaToPageProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebounce(term, 250);
  const [pages, setPages] = useState<MetaApplyTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MetaApplyTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [appliedUrl, setAppliedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    searchPagesForMetaApply(debouncedTerm, 12, controller.signal)
      .then((rows) => {
        if (cancelled) return;
        setPages(rows);
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        // Loud: a search that silently returns nothing reads as "no pages".
        setLoadError(
          error instanceof Error ? error.message : "Could not load pages.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, debouncedTerm]);

  const reset = () => {
    setTerm("");
    setPages([]);
    setSelected(null);
    setLoadError(null);
  };

  const apply = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const saved = await updatePageIntent({
        siteId: selected.site_id,
        pageId: selected.id,
        expectedVersion: selected.version,
        // Intent save writes all three fields together, so anything this apply
        // does not supply must be preserved, not blanked.
        targetKeyword: selected.target_keyword,
        desiredMetaTitle: title ?? selected.meta_title_desired,
        desiredMetaDescription:
          description ?? selected.meta_description_desired,
      });
      setAppliedUrl(saved.url);
      toast.success("Applied to page", { description: saved.url });
      setOpen(false);
      reset();
    } catch (error) {
      toast.error("Could not apply to page", {
        description:
          error instanceof Error
            ? error.message
            : "The page may have changed in another session.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!title && !description) return null;

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title="Apply this title/description to a page"
        className={cn(
          "flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        {appliedUrl ? (
          <Check className="size-3 text-success" />
        ) : (
          <Send className="size-3" />
        )}
        {appliedUrl ? "Applied" : "Apply to page"}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent
          className="max-w-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Apply to page</DialogTitle>
            <DialogDescription>
              Saves as the page&rsquo;s desired metadata. It does not publish
              anything to the live site.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search pages by URL…"
              className="pl-8"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading pages…
              </div>
            ) : loadError ? (
              <div className="px-3 py-6 text-sm text-destructive">
                {loadError}
              </div>
            ) : pages.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                {term.trim()
                  ? `No pages matching “${term.trim()}”.`
                  : "No pages available yet. Crawl a site first."}
              </div>
            ) : (
              pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setSelected(page)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent/50",
                    selected?.id === page.id && "bg-accent",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {page.url}
                  </span>
                  {selected?.id === page.id ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              ))
            )}
          </div>

          {selected ? (
            <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3">
              <FieldDiff
                label="Title"
                current={selected.meta_title_desired}
                next={title}
              />
              <FieldDiff
                label="Description"
                current={selected.meta_description_desired}
                next={description}
              />
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!selected || saving} onClick={apply}>
              {saving ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : null}
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
