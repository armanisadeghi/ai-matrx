"use client";

// TileProjectMarker — header chip for project-flavored tiles. Always visible
// (unlike TileFlavorBadge which hides on tight grid cells) and links to the
// full project workspace at /projects/[id].

import Link from "next/link";
import { ExternalLink, FolderKanban, Loader2 } from "lucide-react";
import { useTileProject } from "@/features/war-room/hooks/useTileProject";
import { cn } from "@/lib/utils";

export function TileProjectMarker({
  tileId,
  className,
  size = "sm",
}: {
  tileId: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { isProjectTile, projectId, project, loading } = useTileProject(tileId);

  if (!isProjectTile || !projectId) return null;

  const label = project?.name?.trim() || "Project";

  return (
    <Link
      href={`/projects/${projectId}`}
      onClick={(e) => e.stopPropagation()}
      title={`Open project: ${label}`}
      className={cn(
        "inline-flex max-w-[14rem] shrink-0 items-center gap-1 rounded-md border border-primary/70 px-1.5 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-accent/60",
        size === "md" && "text-[11px] px-2 py-1",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="size-2.5 shrink-0 animate-spin" />
      ) : (
        <FolderKanban className="size-2.5 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      <ExternalLink className="size-2.5 shrink-0 opacity-60" />
    </Link>
  );
}
