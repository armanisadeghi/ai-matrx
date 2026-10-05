"use client";

import { type MouseEvent } from "react";
import { Layers } from "lucide-react";
import { Chip } from "@ai-matrx/design-system/controls";
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
    <Chip
      asChild
      tone="emerald"
      label="Go deeper"
      icon={<Layers />}
      title={`Explore ${subcards.length} deeper card${subcards.length === 1 ? "" : "s"}`}
      className={className}
    >
      <button type="button" disabled={disabled} onClick={handleClick} />
    </Chip>
  );
}
