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
        "flex h-11 w-11 items-center justify-center rounded-md ring-1 transition-colors lg:h-8 lg:w-8",
        active
          ? "bg-primary text-primary-foreground ring-primary/30"
          : "text-muted-foreground ring-transparent hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
