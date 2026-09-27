"use client";

import { CircleAlert } from "lucide-react";
import type { NodeSource } from "../board/document";

/**
 * A saved tile whose kind no registered item type renders (a type that was
 * renamed or is not built in this version). Says so, instead of an empty box:
 * the tile and its reference are kept, so it comes back when the type does.
 */
export function UnavailableItemBody({ source }: { source: NodeSource }) {
  const what = source.kind === "entity" ? `a ${source.entity}` : `a ${source.kind}`;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <CircleAlert className="h-6 w-6 text-warning" />
      <p className="text-sm font-medium text-foreground">This tile can&apos;t be shown here yet</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        It holds {what}, which this board does not know how to open. The tile is kept, so it comes back when that is
        supported. You can take it off the board from its menu.
      </p>
    </div>
  );
}
