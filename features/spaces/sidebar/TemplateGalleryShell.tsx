"use client";

// features/spaces/sidebar/TemplateGalleryShell.tsx — the ONE template picker frame (list on the left, preview on the
// right, "Use template" on top), shared by the page templates (TemplateGallery) and the board templates
// (features/board/templates). Each caller supplies its entries, its preview and what "Use" does; the frame knows
// nothing about pages or boards. The class names default to plain tokens (usable outside the Spaces root) and the
// Spaces gallery passes its own `spaces-*` classes so its look does not change.

import { Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { ErrorNotice } from "@ai-matrx/design-system";
import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export interface TemplateEntry {
  key: string;
  title: string;
  icon: ReactNode;
}

export interface TemplateGalleryClasses {
  content: string;
  body: string;
  list: string;
  head: string;
  rows: string;
  preview: string;
  bar: string;
  page: string;
  row: string;
}

export const PLAIN_GALLERY_CLASSES: TemplateGalleryClasses = {
  content: "max-w-[min(1100px,96vw)] h-[82dvh] gap-0 p-0 overflow-hidden",
  body: "grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,38%)_minmax(0,1fr)] md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-1",
  list: "flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r",
  head: "flex min-h-14 items-center px-3 pr-12 text-sm text-muted-foreground",
  rows: "flex-1 overflow-y-auto px-1",
  preview: "flex min-h-0 flex-col",
  bar: "flex items-center gap-2 border-b border-border py-2.5 pl-3.5 pr-12",
  page: "flex-1 overflow-y-auto p-5 md:px-14 md:py-10",
  row: "flex min-h-[30px] w-full items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent data-[active=true]:text-primary",
};

export function TemplateGalleryShell({
  open,
  onOpenChange,
  heading = "Templates",
  entries,
  loading,
  error,
  picked,
  onPick,
  previewTitle,
  preview,
  previewLoading,
  usable,
  using,
  onUse,
  classes = PLAIN_GALLERY_CLASSES,
  extraClassName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading?: string;
  entries: readonly TemplateEntry[];
  loading: boolean;
  error: string | null;
  picked: string;
  onPick: (key: string) => void;
  previewTitle: string | null;
  preview: ReactNode;
  previewLoading: boolean;
  usable: boolean;
  using: boolean;
  onUse: () => void;
  classes?: TemplateGalleryClasses;
  extraClassName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${classes.content} ${extraClassName}`}>
        <DialogTitle className="sr-only">{heading}</DialogTitle>
        <div className={classes.body}>
          <aside className={classes.list}>
            <div className={classes.head}>{heading}</div>
            <div className={classes.rows}>
              {entries.map((e) => (
                <div
                  key={e.key}
                  role="button"
                  tabIndex={0}
                  data-clickable=""
                  className={classes.row}
                  data-active={picked === e.key ? "true" : undefined}
                  onClick={() => onPick(e.key)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onPick(e.key);
                    }
                  }}
                >
                  <span className="spaces-menu-row-icon">{e.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-left">{e.title}</span>
                </div>
              ))}
              {loading ? <RegionSkeleton shape="rows" count={3} aria-label="Loading templates" /> : null}
              {error ? <ErrorNotice title="Templates could not be listed" message={error} size="compact" /> : null}
            </div>
          </aside>
          <div className={classes.preview}>
            <div className={classes.bar}>
              <span className="min-w-0 flex-1 truncate type-title">{previewTitle || "Untitled"}</span>
              <Button variant="primary" disabled={!usable || using} onClick={onUse}>
                {using ? "Adding…" : "Use template"}
              </Button>
            </div>
            <div className={classes.page}>
              {previewLoading ? <RegionSkeleton shape="rows" count={8} aria-label="Loading the template" /> : preview}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
