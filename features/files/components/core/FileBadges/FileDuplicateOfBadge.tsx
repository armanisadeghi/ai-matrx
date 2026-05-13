/**
 * features/files/components/core/FileBadges/FileDuplicateOfBadge.tsx
 *
 * Surfaces "this row is a duplicate of <keeper>" on file rows where the
 * dedup-consolidation script (or a `force_new_copy` upload) stamped
 * `cld_files.duplicate_of_file_id`.
 *
 * When clicked, opens the keeper via the file-actions handler so the
 * user can see the canonical row directly. Renders nothing on rows
 * that aren't duplicates — safe to drop into every chip / row without
 * a conditional.
 *
 * The keeper's name is read live from the cloudFiles slice, so renames
 * propagate to the badge automatically. If the keeper isn't loaded
 * (e.g. it's outside the user's currently-cached tree), the badge
 * falls back to the keeper's id-prefix.
 */

"use client";

import { Link2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { cn } from "@/lib/utils";

export interface FileDuplicateOfBadgeProps {
  /** The keeper's `cld_files.id` (i.e. `file.duplicateOfFileId`). */
  keeperFileId: string | null | undefined;
  /** Click handler — typically opens the keeper in the active preview. */
  onClick?: (keeperFileId: string) => void;
  /** Visual density. Default `"md"`. */
  density?: "sm" | "md";
  className?: string;
}

export function FileDuplicateOfBadge({
  keeperFileId,
  onClick,
  density = "md",
  className,
}: FileDuplicateOfBadgeProps) {
  const keeper = useAppSelector((s) =>
    keeperFileId ? selectFileById(s, keeperFileId) : null,
  );
  if (!keeperFileId) return null;

  const label =
    keeper?.fileName ?? `file:${keeperFileId.slice(0, 8)}`;

  const heightClass = density === "sm" ? "h-4" : "h-5";
  const textClass = density === "sm" ? "text-[9px]" : "text-[10px]";
  const iconClass = density === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  const handleClick = onClick
    ? (event: React.MouseEvent) => {
        event.stopPropagation();
        onClick(keeperFileId);
      }
    : undefined;

  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={handleClick}
      title={`Duplicate of ${label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5",
        heightClass,
        textClass,
        "text-amber-700 dark:text-amber-300 font-medium uppercase tracking-wide",
        onClick && "hover:bg-amber-500/20 cursor-pointer transition-colors",
        className,
      )}
    >
      <Link2 className={iconClass} aria-hidden="true" />
      <span className="max-w-[10ch] truncate normal-case">
        dup of {label}
      </span>
    </Tag>
  );
}
