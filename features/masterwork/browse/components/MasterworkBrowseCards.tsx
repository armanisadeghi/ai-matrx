"use client";

// features/masterwork/browse/components/MasterworkBrowseCards.tsx
//
// The CARD view of /masterwork/all — one card per Rulebook, carrying the
// Masterworks built from it.
//
// Arman, 2026-08-21: the list must show both, and it must offer more than a
// table ("agents allows three: small cards, big cards, and a table"). Shape
// chosen deliberately: a Masterwork cannot exist without a Rulebook, so a flat
// mixed list would show the same work twice under two names. The Rulebook is
// the row; every Masterwork it produced is a chip on it — named, and a door.
//
// Modelled on AgentBrowseCards: a few NAMED actions plus the same complete "…"
// menu the table row has. No icon quizzes.

import Link from "next/link";
import { BookOpen, Hammer, Play, MoreHorizontal, Sparkle } from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { cleanMarkdownPreview } from "@/utils/markdown-processors/clean-markdown-to-text";
import type { Masterwork, RulebookListRow } from "../../types";

interface Props {
  rows: RulebookListRow[];
  density: "compact" | "comfortable";
  menuFor: (row: RulebookListRow) => () => ItemMenuConfig;
  hrefFor: (row: RulebookListRow) => string | undefined;
  masterworksBy: Record<string, Masterwork[]>;
}

/** The Masterworks built from this Rulebook — each one named and openable. */
function MasterworkChips({ items }: { items: Masterwork[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Not built into a system yet.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 4).map((mw) => (
        <Link
          key={mw.id}
          href={`/masterwork/${mw.built_from_rulebook}/masterworks`}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
            mw.released_at
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
          title={mw.released_at ? "Released — Operators can run it" : "Draft"}
        >
          {mw.released_at ? (
            <Play className="h-3 w-3 shrink-0" />
          ) : (
            <Hammer className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{mw.name}</span>
        </Link>
      ))}
      {items.length > 4 ? (
        <span className="text-xs text-muted-foreground">
          +{items.length - 4} more
        </span>
      ) : null}
    </div>
  );
}

export function MasterworkBrowseCards({
  rows,
  density,
  menuFor,
  hrefFor,
  masterworksBy,
}: Props) {
  return (
    <div
      className={cn(
        "grid gap-3",
        density === "compact"
          ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
          : "grid-cols-1 lg:grid-cols-2",
      )}
    >
      {rows.map((row) => {
        const href = hrefFor(row);
        const built = masterworksBy[row.id] ?? [];
        const released = built.filter((m) => m.released_at).length;
        return (
          <div
            key={row.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                {href ? (
                  <Link
                    href={href}
                    className="block truncate text-sm font-semibold text-foreground hover:underline"
                  >
                    {row.name}
                  </Link>
                ) : (
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {row.name}
                  </span>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {row.rule_count} {row.rule_count === 1 ? "rule" : "rules"}
                  </Badge>
                  {released > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 px-1.5 py-0 text-[10px] text-emerald-700 dark:text-emerald-400"
                    >
                      {released} released
                    </Badge>
                  ) : null}
                </div>
              </div>
              <ItemMenu config={menuFor(row)()}>
                <button
                  type="button"
                  aria-label={`Actions for ${row.name}`}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </ItemMenu>
            </div>

            {row.description ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {cleanMarkdownPreview(row.description)}
              </p>
            ) : null}

            <div className="mt-auto space-y-1.5 border-t border-border pt-2.5">
              <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkle className="h-3 w-3" />
                Built into
              </span>
              <MasterworkChips items={built} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
