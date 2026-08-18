"use client";

import Link from "next/link";
import { ExternalLink, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenMasterworkYourWordsWindow } from "@/features/overlays/openers/masterworkYourWordsWindow";
import { cn } from "@/lib/utils";

export interface YourWordsActionsProps {
  rulebookId: string;
  compact?: boolean;
  variant?: "ghost" | "outline";
}

/** Window-first record action with an explicit, state-preserving new-tab door. */
export function YourWordsActions({
  rulebookId,
  compact = false,
  variant = "outline",
}: YourWordsActionsProps) {
  const openYourWords = useOpenMasterworkYourWordsWindow();

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label="Your words"
    >
      <Button
        size="sm"
        variant={variant}
        className={cn(compact && "h-7")}
        onClick={() => openYourWords({ rulebookId })}
      >
        <Quote className="h-3.5 w-3.5" />
        Your words
      </Button>
      <Button
        asChild
        size="icon"
        variant={variant}
        className={cn(compact ? "h-7 w-7" : "h-9 w-9")}
        title="Open Your words in a new tab"
      >
        <Link
          href={`/masterwork/${rulebookId}/record`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open Your words in a new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
