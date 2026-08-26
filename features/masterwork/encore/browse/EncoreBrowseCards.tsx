"use client";

import Link from "next/link";
import { MoreHorizontal, Play } from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeCell } from "@/lib/entity-list/columns";
import type { EncoreListRow } from "./types";

export function EncoreBrowseCards({
  rows,
  density,
  menuFor,
  hrefFor,
}: {
  rows: EncoreListRow[];
  density: "compact" | "comfortable";
  menuFor: (row: EncoreListRow) => () => ItemMenuConfig;
  hrefFor: (row: EncoreListRow) => string | undefined;
}) {
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
        const href = hrefFor(row) ?? `/masterwork/encore/${row.id}`;
        return (
          <div
            key={row.id}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-1">
              <div className="min-w-0">
                <Link
                  href={href}
                  className="block truncate text-sm font-semibold text-foreground hover:underline"
                >
                  {row.name}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {row.rulebook ? <span>By {row.rulebook.expert}</span> : null}
                  {row.rule_count !== null ? (
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {row.rule_count} rules
                    </Badge>
                  ) : null}
                  {row.auditionScore !== null ? (
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      Match {Math.round(row.auditionScore)}/100
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-2 text-xs">{timeCell(row.updated_at)}</div>
              </div>
              <Button asChild size="icon" className="h-8 w-8">
                <Link href={href} aria-label={`Run ${row.name}`}>
                  <Play className="h-4 w-4" />
                </Link>
              </Button>
              <ItemMenu config={menuFor(row)()}>
                <button
                  type="button"
                  aria-label={`Actions for ${row.name}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </ItemMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}
