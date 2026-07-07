"use client";

// features/education/tutor/components/AskTutorButton.tsx
//
// The shared "I'm confused — ask my tutor" entry primitive (P2, VISION §4:
// "no re-explaining, no context switching"). Drop it on ANY study surface
// (flashcard study, quiz results, notes) and it opens the full AI Tutor in a
// side panel, pre-loaded with the local context you pass as `seed` — so the
// tutor already knows the exact card/item/set the learner is stuck on, on top
// of their cross-session memory.
//
// Reuses EducationTutorClient in `embedded` mode (own focus scope, no URL
// promotion). The conversation still persists under the education-tutor
// source_feature, so a learner can reopen it later from /education/tutor.

import { useState } from "react";
import { GraduationCap, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { TutorGroundingSeed } from "../grounding";
import { EducationTutorClient } from "./EducationTutorClient";

export interface AskTutorButtonProps {
  /** The local context to ground the tutor in (the card/item/set the user is on). */
  seed: TutorGroundingSeed;
  label?: string;
  iconOnly?: boolean;
  variant?: "outline" | "secondary" | "ghost" | "default";
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function AskTutorButton({
  seed,
  label = "Ask my tutor",
  iconOnly = false,
  variant = "outline",
  size = "sm",
  className,
}: AskTutorButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn("gap-1.5 text-xs", className)}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {!iconOnly && label}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="flex-row items-center justify-between space-y-0 border-b border-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
              AI Tutor
            </SheetTitle>
            <a
              href="/education/tutor"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Open full tutor
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            {open && (
              <EducationTutorClient embedded seed={seed} hideLanding />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
