"use client";

/**
 * Pick a page, see what will change, confirm.
 *
 * The shared shell behind every "send this thing to a page" action. Actions
 * differ only in what they preview and what they write, so they pass a
 * `preview` renderer and an `onConfirm` — they never re-implement the search,
 * the list, the empty/error states, or the busy handling.
 *
 * Search is cross-site on purpose: these actions start from content that has
 * no site context (an agent generated it in chat), which site-scoped
 * `listPages` cannot serve.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, Search } from "lucide-react";

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
import { searchPagesForMetaApply } from "@/features/marketing/data/service";
import type { MetaApplyTarget } from "@/features/marketing/types";

/** Host of a page URL — the site it belongs to, without a second query. */
function siteLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown site";
  }
}

export interface PagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Rendered under the list once a page is chosen — the before/after. */
  preview?: (page: MetaApplyTarget) => ReactNode;
  /**
   * Returning the saved row lets the picker refresh the optimistic-lock
   * version in place. Without it a second attempt re-sends the stale version
   * and can never succeed.
   */
  onConfirm: (page: MetaApplyTarget) => Promise<{ version: number } | void>;
}

export function PagePickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  preview,
  onConfirm,
}: PagePickerDialogProps) {
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebounce(term, 250);
  const [pages, setPages] = useState<MetaApplyTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MetaApplyTarget | null>(null);
  const [busy, setBusy] = useState(false);

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
        // A refined search can drop the chosen page out of the list; keeping a
        // selection the user can no longer see is how you confirm the wrong one.
        setSelected((current) =>
          current && rows.some((row) => row.id === current.id) ? current : null,
        );
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
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

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setTerm("");
      setPages([]);
      setSelected(null);
      setLoadError(null);
    }
  };

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await onConfirm(selected);
      close(false);
    } catch {
      // Stays open so the user can retry or pick another page (the action owns
      // surfacing the error) — but a stale optimistic-lock version would make
      // every retry fail identically, so re-read the row before letting them.
      const [fresh] = await searchPagesForMetaApply(selected.url, 1).catch(
        () => [],
      );
      if (fresh) {
        setSelected(fresh);
        setPages((current) =>
          current.map((row) => (row.id === fresh.id ? fresh : row)),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
            <div className="px-3 py-6 text-sm text-destructive">{loadError}</div>
          ) : pages.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              {debouncedTerm.trim()
                ? `No pages matching “${debouncedTerm.trim()}”.`
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
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">
                    {page.url}
                  </span>
                  {/* An agency user reads many clients' sites. An unlabeled
                      list is how one client's metadata lands on another's. */}
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {siteLabel(page.url)}
                  </span>
                </span>
                {selected?.id === page.id ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : null}
              </button>
            ))
          )}
        </div>

        {selected && preview ? (
          <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3">
            {preview(selected)}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button disabled={!selected || busy} onClick={confirm}>
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
