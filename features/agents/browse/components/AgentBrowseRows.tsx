"use client";

// features/agents/browse/components/AgentBrowseRows.tsx
//
// The dense list view — maximum names per screen, for the user who knows what
// they're looking for. Built on the canonical ItemRow, so it gets inline
// rename, the hover-revealed kebab, and right-click for free, all driven by
// the SAME menu config the table and cards use.

import { Star, Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { ItemRow } from "@/components/official/item/ItemRow";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentBrowseRow } from "../types";

interface Props {
  rows: AgentBrowseRow[];
  density: "compact" | "comfortable";
  menuFor: (row: AgentBrowseRow) => () => ItemMenuConfig;
  onRename: (row: AgentBrowseRow, next: string) => Promise<void>;
}

export function AgentBrowseRows({ rows, density, menuFor, onRename }: Props) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-0.5 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <ItemRow
          key={row.id}
          label={row.name}
          size={density === "compact" ? "sm" : "md"}
          href={`/agents/${row.id}/run`}
          onOpen={() => router.push(`/agents/${row.id}/run`)}
          secondaryLabel={row.category ?? undefined}
          leading={
            <Star
              className={cn(
                "h-3.5 w-3.5",
                row.is_favorite
                  ? "fill-amber-400 text-amber-500"
                  : "text-transparent",
              )}
            />
          }
          trailing={
            row.is_archived ? (
              <Badge variant="outline" className="text-[10px] py-0">
                <Archive className="h-2.5 w-2.5" />
              </Badge>
            ) : undefined
          }
          menu={menuFor(row)}
          rename={
            row.is_owner
              ? { onCommit: (next) => onRename(row, next), emptyFallback: row.name }
              : undefined
          }
        />
      ))}
    </div>
  );
}
