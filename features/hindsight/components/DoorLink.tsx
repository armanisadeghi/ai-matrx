"use client";

/**
 * DoorLink — the Door Law affordance for a Hindsight record: open it, or open
 * it in a new tab without losing this page's state. Never a bare id.
 */
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Door } from "../subject-doors";

export function DoorLink({
  door,
  className,
  size = "sm",
}: {
  door: Door;
  className?: string;
  size?: "sm" | "xs";
}) {
  const classes = cn(
    "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    size === "xs" ? "text-[11px]" : "text-xs",
    className,
  );

  if (door.external) {
    return (
      <a href={door.href} target="_blank" rel="noopener noreferrer" className={classes}>
        {door.label}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Link href={door.href} className={classes}>
        {door.label}
      </Link>
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground"
        title="Open in a new tab"
      >
        <a href={door.href} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3 w-3" />
        </a>
      </Button>
    </span>
  );
}
