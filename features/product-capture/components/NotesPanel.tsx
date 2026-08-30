"use client";

/**
 * NotesPanel — the quick-access text area of the capture screen.
 *
 * Closed, it is just the Notes control in the bottom bar. Open, it slides a
 * translucent panel over the lower stage with the item's one textarea:
 * autosaved continuously (the session hook debounces), "Done" only collapses.
 * Reopening returns the caret to the END of the existing text so the user
 * continues where they left off — the task's exact contract.
 */

import React, { useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";

interface NotesPanelProps {
  open: boolean;
  notes: string;
  saving: boolean;
  transcribing: boolean;
  onChange: (text: string) => void;
  onClose: () => void;
}

export function NotesPanel({
  open,
  notes,
  saving,
  transcribing,
  onChange,
  onClose,
}: NotesPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // On every open: focus with the caret at the end of the existing text.
  useEffect(() => {
    if (!open) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-white/10 bg-black/90 p-3 pb-safe backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-white/90">Item notes</span>
        <span className="text-[11px] text-white/50">
          {transcribing
            ? "Transcribing voice note…"
            : saving
              ? "Saving…"
              : "Saved automatically"}
        </span>
      </div>
      <ProTextarea
        ref={textareaRef}
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type or paste notes for this item…"
        // text-base: mobile-facing field (iOS zoom floor doctrine).
        className="min-h-32 resize-none border-white/15 bg-white/5 text-base text-white placeholder:text-white/40"
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" className="h-10 rounded-full px-5" onClick={onClose}>
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1.5 h-4 w-4" />
          )}
          Done
        </Button>
      </div>
    </div>
  );
}
