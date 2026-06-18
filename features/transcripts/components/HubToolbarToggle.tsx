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
        "h-7 w-7 rounded-md flex items-center justify-center transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/30"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
