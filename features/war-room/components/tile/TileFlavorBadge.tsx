"use client";

// features/war-room/components/tile/TileFlavorBadge.tsx
//
// A compact flavor marker for a tile header. Renders NOTHING for the default
// 'thread' flavor (the common case stays clean), and a quiet pill for task /
// project tiles so the kind reads at a glance next to the title. Flavor is
// orthogonal to the tab-derived accent rail (tileKind), so this is its own thing.

import { FolderKanban, ListChecks } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTileFlavor } from "@/features/war-room/redux/selectors";
import { cn } from "@/lib/utils";

export function TileFlavorBadge({
  tileId,
  className,
}: {
  tileId: string;
  className?: string;
}) {
  const flavor = useAppSelector((s) => selectTileFlavor(tileId)(s));
  if (flavor === "thread") return null;
  const isProject = flavor === "project";
  const Icon = isProject ? FolderKanban : ListChecks;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        isProject
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
        className,
      )}
      title={isProject ? "Project thread" : "Task thread"}
    >
      <Icon className="size-2.5" />
      {isProject ? "Project" : "Task"}
    </span>
  );
}
