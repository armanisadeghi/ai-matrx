"use client";

import { type MouseEvent } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenFlashcardSubcardsWindow } from "@/features/overlays/openers/flashcardSubcardsWindow";
import type { FlashcardSubcard } from "./flashcard-subcards";
import { subcardsWindowTitle } from "./flashcard-subcards";

export interface FlashcardGoDeeperPayload {
  subcards: FlashcardSubcard[];
  title: string;
  parentFront?: string;
}

export interface FlashcardGoDeeperTriggerProps {
  subcards: FlashcardSubcard[];
  /** Parent card front — used for the window title. */
  parentFront?: string;
  className?: string;
  disabled?: boolean;
  /** Override open behavior (e.g. inline drawer). Default: window panel. */
  onOpen?: (payload: FlashcardGoDeeperPayload) => void;
}

export function FlashcardGoDeeperTrigger({
  subcards,
  parentFront,
  className,
  disabled = false,
  onOpen,
}: FlashcardGoDeeperTriggerProps) {
  const openSubcardsWindow = useOpenFlashcardSubcardsWindow();

  if (subcards.length === 0) return null;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;

    const payload: FlashcardGoDeeperPayload = {
      subcards,
      parentFront,
      title: subcardsWindowTitle(parentFront, subcards.length),
    };

    if (onOpen) {
      onOpen(payload);
      return;
    }

    openSubcardsWindow({
      subcards,
      title: payload.title,
      parentFront,
    });
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      title={`Explore ${subcards.length} deeper card${subcards.length === 1 ? "" : "s"}`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-green-300/70 bg-green-100/90 px-1.5 py-0.5 text-[10px] font-medium text-green-800 shadow-sm transition-colors",
        "hover:bg-green-200/90 disabled:opacity-50",
        "dark:border-green-700/70 dark:bg-green-900/60 dark:text-green-200 dark:hover:bg-green-900/80",
        className,
      )}
    >
      <Layers className="h-3 w-3 shrink-0" />
      <span className="whitespace-nowrap">Go deeper</span>
    </button>
  );
}
