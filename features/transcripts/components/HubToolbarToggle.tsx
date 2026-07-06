"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function HubToolbarToggle({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "h-7 w-7 rounded-md flex items-center justify-center ring-1 transition-colors",
        active
          ? "bg-primary text-primary-foreground ring-primary/30"
          : "text-muted-foreground ring-transparent hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
