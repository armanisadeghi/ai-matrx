"use client";

// features/unified-data/table-page/TableFavoriteStar.tsx — lane TABLE-ACTIONS (wave 1, item 9)
//
// THE TABLE PAGE'S STAR, beside its name: the same favorite the Data home row's star and the
// table's ⋯ "Add to favorites" flip (`useTableFavorite`). Champion: Notion's page star and Linear's
// favorite — one press, on the object's own header. Absent until the table's organization is known
// (its favorite id names it), never a star that flips nothing.

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTableFavorite } from "@/features/unified-data/actions/useTableFavorite";

export function TableFavoriteStar({ tableId, organizationId }: { tableId: string; organizationId: string | null }) {
  const favorite = useTableFavorite(tableId, organizationId);
  if (!favorite.known) return null;
  return (
    <button
      type="button"
      aria-label={favorite.isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorite.isFavorite}
      title={favorite.isFavorite ? "Remove from favorites" : "Add to favorites"}
      onClick={favorite.toggle}
      data-table-favorite={favorite.isFavorite ? "on" : "off"}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-amber-500"
    >
      <Star className={cn("h-4 w-4", favorite.isFavorite && "fill-amber-400 text-amber-500")} />
    </button>
  );
}
