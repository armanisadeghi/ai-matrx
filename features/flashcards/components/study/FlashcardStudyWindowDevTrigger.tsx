"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import { useOpenFlashcardStudyWindow } from "@/features/overlays/openers/flashcardStudyWindow";

interface FlashcardStudyWindowDevTriggerProps {
  setId: string;
  title?: string;
  /** Icon-only square vs labeled button for toolbars. */
  variant?: "icon" | "labeled";
  className?: string;
  disabled?: boolean;
}

/** Admin-only dev trigger — opens the sidebar study WindowPanel. */
export function FlashcardStudyWindowDevTrigger({
  setId,
  title,
  variant = "labeled",
  className,
  disabled = false,
}: FlashcardStudyWindowDevTriggerProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const openStudyWindow = useOpenFlashcardStudyWindow();

  if (!isAdmin) return null;

  const open = () =>
    openStudyWindow({
      setId,
      title: title ?? "Study",
    });

  if (variant === "icon") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        className={cn(
          "h-8 w-8 p-0 text-destructive ring-1 ring-destructive/50 hover:bg-destructive/15 animate-pulse",
          className,
        )}
        onClick={open}
        title="[DEV] Open study session in window panel"
      >
        <TriangleAlert className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className={cn(
        "border-destructive/50 text-destructive hover:bg-destructive/10 animate-pulse",
        className,
      )}
      onClick={open}
      title="[DEV] Open study session in window panel (sidebar + stats)"
    >
      <TriangleAlert className="mr-1.5 h-4 w-4" />
      Study window
    </Button>
  );
}
