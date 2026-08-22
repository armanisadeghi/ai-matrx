"use client";

// features/masterwork/browse/components/MasterworkBrowseRows.tsx
//
// The ROWS view of /masterwork/all — the dense middle setting between the
// cards and the table (agents ships the same three). One line per Rulebook:
// name, how many rules, and what it has been built into.

import Link from "next/link";
import { BookOpen, MoreHorizontal, Play } from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { cn } from "@/lib/utils";
import type { Masterwork, RulebookListRow } from "../../types";

interface Props {
  rows: RulebookListRow[];
  density: "compact" | "comfortable";
  menuFor: (row: RulebookListRow) => () => ItemMenuConfig;
  hrefFor: (row: RulebookListRow) => string | undefined;
  masterworksBy: Record<string, Masterwork[]>;
}

export function MasterworkBrowseRows({
  rows,
  density,
  menuFor,
  hrefFor,
  masterworksBy,
}: Props) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((row) => {
        const href = hrefFor(row);
        const built = masterworksBy[row.id] ?? [];
        const released = built.filter((m) => m.released_at).length;
        return (
          <div
            key={row.id}
            className={cn(
              "flex items-center gap-3 px-3",
              density === "compact" ? "py-1.5" : "py-2.5",
            )}
          >
            <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              {href ? (
                <Link
                  href={href}
                  className="block truncate text-sm font-medium text-foreground hover:underline"
                >
                  {row.name}
                </Link>
              ) : (
                <span className="block truncate text-sm font-medium text-foreground">
                  {row.name}
                </span>
              )}
              {density === "comfortable" && row.description ? (
                <span className="hidden truncate text-xs text-muted-foreground sm:block">
                  {row.description}
                </span>
              ) : null}
              {/* Mobile: the counts sit UNDER the name instead of squeezing it
                  down to three characters. */}
              <span className="flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
                <span className="tabular-nums">
                  {row.rule_count} {row.rule_count === 1 ? "rule" : "rules"}
                </span>
                {built.length > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Play className="h-3 w-3" />
                    {built.length} built
                    {released > 0 ? ` · ${released} released` : ""}
                  </span>
                ) : (
                  <span>not built yet</span>
                )}
              </span>
            </div>
            <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
              {row.rule_count} {row.rule_count === 1 ? "rule" : "rules"}
            </span>
            {built.length > 0 ? (
              <Link
                href={`/masterwork/${row.id}/masterworks`}
                className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline sm:inline-flex"
                title="The systems built from this Rulebook"
              >
                <Play className="h-3 w-3" />
                {built.length} built
                {released > 0 ? ` · ${released} released` : ""}
              </Link>
            ) : (
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                not built yet
              </span>
            )}
            <ItemMenu config={menuFor(row)()}>
              <button
                type="button"
                aria-label={`Actions for ${row.name}`}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </ItemMenu>
          </div>
        );
      })}
    </div>
  );
}
