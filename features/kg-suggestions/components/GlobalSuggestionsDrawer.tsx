// features/kg-suggestions/components/GlobalSuggestionsDrawer.tsx
//
// The global suggestion inbox — every pending KG → scope-item suggestion
// across the user's data, grouped by source kind, plus a dedicated
// "Suggest a scope" section for heavy-hitter rows. Opened from the nav via
// the overlay system (see openers/kgSuggestionsDrawer.tsx); this component is
// rendered (gated) by OverlayController and self-manages its surface chrome.
//
// Mobile-first: a bottom Drawer on phones (useIsMobile), a right-side Sheet on
// desktop. Single scroll area. Accept/reject/defer are non-blocking; results
// are toasts. Nothing here writes global context — these are pure suggestion
// decisions that funnel through the user-scoped /kg-suggestions API.

"use client";

import Link from "next/link";
import { ArrowRight, Lightbulb, Network } from "lucide-react";
import { isLowConfidence } from "@/features/kg-suggestions/constants";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import { KgSuggestionRowItem } from "./KgSuggestionRowItem";
import {
  SourcePreviewProvider,
  useSourcePreviewController,
} from "./source-preview/SourcePreviewContext";
import { SourcePreviewPanel } from "./source-preview/SourcePreviewPanel";
import type {
  KgGlobalFilter,
  KgSuggestionRow,
} from "@/features/kg-suggestions/types";

export interface GlobalSuggestionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  note: "Notes",
  task: "Tasks",
  project: "Projects",
  transcript: "Transcripts",
  scraped: "Scraped pages",
  cld_file: "Files",
  conversation: "Conversations",
  cx_message: "Conversations",
  code_file: "Code files",
};

function sourceLabel(kind: string): string {
  return SOURCE_LABELS[kind] ?? kind;
}

export function GlobalSuggestionsDrawer({
  isOpen,
  onClose,
}: GlobalSuggestionsDrawerProps) {
  const isMobile = useIsMobile();
  const filter: KgGlobalFilter = { global: true, status: "pending" };
  const { items, count, status, error, accept, reject, defer } =
    useKgSuggestions(filter, { autoFetch: isOpen });

  // Source preview is a separate non-blocking floating panel. Opening it only
  // updates this local target — the inbox surface never unmounts. While a
  // preview is open we also stop outside-clicks / escape from dismissing the
  // inbox, so reviewing the source can't close the drawer out from under you.
  const { target, openPreview, closePreview, isPreviewing } =
    useSourcePreviewController();
  const keepOpenWhilePreviewing = (e: { preventDefault: () => void }) => {
    if (isPreviewing) e.preventDefault();
  };

  // React Compiler is on — no manual memoization. Group rows for render.
  // Low-confidence (<50%) rows are mostly noise — keep them OUT of the normal
  // list and relegate them to a single "view in manager" banner at the bottom.
  const heavyHitters: KgSuggestionRow[] = [];
  const groupMap = new Map<string, KgSuggestionRow[]>();
  let lowQualityCount = 0;
  for (const row of items) {
    if (isLowConfidence(row)) {
      lowQualityCount += 1;
      continue;
    }
    if (row.match_kind === "heavy_hitter") {
      heavyHitters.push(row);
      continue;
    }
    const list = groupMap.get(row.source_kind) ?? [];
    list.push(row);
    groupMap.set(row.source_kind, list);
  }
  // Highest-confidence first, both for heavy hitters and within each group.
  const byConfidenceDesc = (a: KgSuggestionRow, b: KgSuggestionRow) =>
    b.confidence - a.confidence;
  heavyHitters.sort(byConfidenceDesc);
  for (const rows of groupMap.values()) rows.sort(byConfidenceDesc);
  // Order the groups so the one holding the single strongest suggestion leads.
  const grouped = Array.from(groupMap.entries()).sort((a, b) => {
    const maxA = a[1][0]?.confidence ?? 0;
    const maxB = b[1][0]?.confidence ?? 0;
    if (maxB !== maxA) return maxB - maxA;
    return sourceLabel(a[0]).localeCompare(sourceLabel(b[0]));
  });
  // What's actually shown in the list (excludes the relegated low-quality rows).
  const shownCount = count - lowQualityCount;

  const body = (
    <ScrollArea className="flex-1 min-h-0">
      <div className="space-y-4 p-3 pb-safe">
        {status === "loading" && items.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : null}

        {status === "error" ? (
          <div className="text-sm text-destructive">
            Couldn&apos;t load suggestions{error ? `: ${error}` : "."}
          </div>
        ) : null}

        {status === "success" && count === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Lightbulb className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No pending suggestions. As your notes, tasks, and files are
            analyzed, proposed scope fills will appear here.
          </div>
        ) : null}

        {/* Everything left is low-quality — say so rather than look empty. */}
        {status === "success" && count > 0 && shownCount === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Lightbulb className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            You&apos;re caught up on the strong suggestions.
          </div>
        ) : null}

        {/* Heavy hitters — "Suggest a scope" */}
        {heavyHitters.length > 0 ? (
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Network className="h-3.5 w-3.5 text-primary" />
              Suggest a scope ({heavyHitters.length})
            </div>
            {heavyHitters.map((row) => (
              <KgSuggestionRowItem
                key={row.id}
                row={row}
                accept={accept}
                reject={reject}
                defer={defer}
              />
            ))}
          </section>
        ) : null}

        {/* Grouped slot-fill suggestions */}
        {grouped.map(([kind, rows]) => (
          <section key={kind} className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {sourceLabel(kind)} ({rows.length})
            </div>
            {rows.map((row) => (
              <KgSuggestionRowItem
                key={row.id}
                row={row}
                accept={accept}
                reject={reject}
                defer={defer}
              />
            ))}
          </section>
        ))}

        {/* Low-quality (<50%) rows are relegated to the manager, not listed
            here. One quiet banner tells the user they exist without cluttering
            the inbox with noise. */}
        {lowQualityCount > 0 ? (
          <Link
            href="/suggestions"
            onClick={onClose}
            className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            <span>
              {lowQualityCount} more low-confidence{" "}
              {lowQualityCount === 1 ? "suggestion" : "suggestions"} (&lt;50%)
              hidden — review in the manager
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        ) : null}
      </div>
    </ScrollArea>
  );

  const surface = isMobile ? (
    <Drawer open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent
        className="h-dvh max-h-[90dvh]"
        onInteractOutside={keepOpenWhilePreviewing}
        onPointerDownOutside={keepOpenWhilePreviewing}
        onEscapeKeyDown={keepOpenWhilePreviewing}
      >
        <DrawerHeader className="border-b border-border">
          <DrawerTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Suggestions {shownCount > 0 ? `(${shownCount})` : ""}
          </DrawerTitle>
          <Link
            href="/suggestions"
            onClick={onClose}
            className="mt-1 inline-flex items-center gap-1 self-start text-xs text-primary hover:underline"
          >
            Open full manager
            <ArrowRight className="h-3 w-3" />
          </Link>
        </DrawerHeader>
        <div className="flex flex-1 min-h-0 flex-col">{body}</div>
      </DrawerContent>
    </Drawer>
  ) : (
    <MatrxDynamicPanelHost
      open={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="inline-flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          Suggestions {shownCount > 0 ? `(${shownCount})` : ""}
        </span>
      }
      description="Proposed fills from your notes, tasks, and files. Preview the source or open the scope before deciding — nothing changes until you accept."
      expandButtonLabel="Suggestions"
      dismissDisabled={isPreviewing}
      position="right"
      defaultSize={36}
      contentClassName="flex min-h-0 flex-1 flex-col p-0"
      headerActions={
        <Link
          href="/suggestions"
          onClick={onClose}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
        >
          Open full manager
          <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {body}
    </MatrxDynamicPanelHost>
  );

  return (
    <SourcePreviewProvider value={{ openPreview }}>
      {surface}
      <SourcePreviewPanel
        target={target}
        onClose={closePreview}
        position="left"
      />
    </SourcePreviewProvider>
  );
}

export default GlobalSuggestionsDrawer;
