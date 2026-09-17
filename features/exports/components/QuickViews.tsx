"use client";

// features/exports/components/QuickViews.tsx
//
// THE FILTERS ARE THE PRODUCT, AND ONE OF THEM IS THE POINT.
//
// "Sent by me, longest first" is the single most valuable view of anybody's
// export — it is every long thing they personally wrote, which is the raw
// material a Rulebook is made of. It is therefore ONE obvious click, first in
// the row, styled as the primary action. Everything else here is a shortcut to
// a filter the Filters & Sort panel also offers; that one is a destination.
//
// These write the URL, not component state, because this surface's config sets
// `urlState: true` — so a quick view is a linkable, refreshable, Back-able
// address, and the sort it sets survives the recipient's stored preference
// (lib/entity-list/urlQuery.ts § "Sort is the one STYLE axis the URL carries").

import { useMemo } from "react";
import { ArrowDownWideNarrow, Clock, Paperclip, Send } from "lucide-react";
import { commitUrlParams, useUrlSearchParams } from "@ai-matrx/kit/url-state";
import { cn } from "@/lib/utils";
import type { EntityFilters } from "@/lib/entity-list/types";

interface QuickView {
  id: string;
  label: string;
  icon: typeof Send;
  primary?: boolean;
  filters: EntityFilters;
  sort: string;
  dir: "asc" | "desc";
  /** Why this view exists, for the control's tooltip. */
  title: string;
}

/**
 * The view that carries the feature.
 *
 * `outboundBy` is how an export whose owner we could NOT identify still gets
 * this view: the person picks themselves out of the correspondents, and the
 * same pill filters by that name instead of by a `direction` the server could
 * not compute. The words on the control change with it, so it never claims a
 * certainty nobody has.
 */
export function sentByMeView(outboundBy: string | null): QuickView {
  return {
    id: "sent-longest",
    label: outboundBy ? `From ${outboundBy}, longest first` : "Sent by me, longest first",
    icon: Send,
    primary: true,
    title:
      "Everything you wrote yourself, longest first — the raw material a Rulebook is made of",
    filters: outboundBy
      ? { author: { kind: "text", value: outboundBy } }
      : { direction: { kind: "select", values: ["outbound"] } },
    sort: "char_count",
    dir: "desc",
  };
}

const OTHER_VIEWS: QuickView[] = [
  {
    id: "newest",
    label: "Newest first",
    icon: Clock,
    title: "Everything in this export, most recent first",
    filters: {},
    sort: "occurred_at",
    dir: "desc",
  },
  {
    id: "longest",
    label: "Longest first",
    icon: ArrowDownWideNarrow,
    title: "Everything in this export, longest first",
    filters: {},
    sort: "char_count",
    dir: "desc",
  },
  {
    id: "attachments",
    label: "With attachments",
    icon: Paperclip,
    title: "Only items that carried a file",
    filters: { attachment_count: { kind: "select", values: ["true"] } },
    sort: "attachment_count",
    dir: "desc",
  },
];

function isActive(
  view: QuickView,
  params: URLSearchParams,
): boolean {
  const filters = params.get("filters") ?? "{}";
  const sort = params.get("sort") ?? "occurred_at";
  const dir = params.get("dir") ?? "desc";
  return (
    filters === (Object.keys(view.filters).length === 0 ? "{}" : JSON.stringify(view.filters)) &&
    sort === view.sort &&
    dir === view.dir
  );
}

export function QuickViews({
  outboundBy,
  className,
}: {
  outboundBy: string | null;
  className?: string;
}) {
  const params = useUrlSearchParams();
  const views = useMemo(
    () => [sentByMeView(outboundBy), ...OTHER_VIEWS],
    [outboundBy],
  );

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto pb-0.5",
        // The row scrolls sideways on a phone rather than wrapping into three
        // lines that push the list off the screen.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {views.map((view) => {
        const active = isActive(view, params);
        const Icon = view.icon;
        return (
          <button
            key={view.id}
            type="button"
            title={view.title}
            aria-pressed={active}
            data-tap-target
            onClick={() =>
              commitUrlParams(
                {
                  filters:
                    Object.keys(view.filters).length === 0
                      ? null
                      : JSON.stringify(view.filters),
                  sort: view.sort,
                  dir: view.dir,
                  page: null,
                },
                "push",
              )
            }
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : view.primary
                  ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
