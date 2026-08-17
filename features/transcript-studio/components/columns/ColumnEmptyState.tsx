"use client";

import { cn } from "@/lib/utils";

interface ColumnEmptyStateProps {
  title: string;
  description?: string;
  className?: string;
}

/**
 * Quiet column guidance. The persistent ColumnHeader already owns the column
 * name and icon, so repeating either here would turn an empty state into echo.
 */
export function ColumnEmptyState({
  title,
  description,
  className,
}: ColumnEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-xs font-medium text-foreground/80">{title}</p>
      {description && (
        <p className="max-w-[24ch] text-[10px] text-muted-foreground/80">
          {description}
        </p>
      )}
    </div>
  );
}
