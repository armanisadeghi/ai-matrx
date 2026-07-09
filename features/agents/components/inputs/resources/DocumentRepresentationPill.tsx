"use client";

/**
 * The quick representation chooser shown next to an attached processed-document
 * chip in the composer. Detects nothing itself — it's rendered only for
 * `processed_document` resources (see SmartAgentResourceChips). Lets the user
 * flip the PRIMARY representation (Clean / Raw) placed in the agent's context,
 * or drop back to attaching the raw binary file. Non-blocking, per-chip — so
 * attaching many documents never interrupts the flow.
 */

import { useState } from "react";
import { Check, ChevronDown, FileType2, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
import {
  availableRepresentations,
  representationLabel,
  type ProcessedDocumentSource,
} from "@/features/agents/utils/processedDocumentContext";

interface DocumentRepresentationPillProps {
  source: ProcessedDocumentSource;
  representation: DocumentRepresentation;
  onChange: (rep: DocumentRepresentation) => void;
  onAttachAsFile: () => void;
}

export function DocumentRepresentationPill({
  source,
  representation,
  onChange,
  onAttachAsFile,
}: DocumentRepresentationPillProps) {
  const [open, setOpen] = useState(false);
  const options = availableRepresentations(source);

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          aria-label={`Representation: ${representationLabel(representation)}`}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border px-1.5",
            "text-[11px] font-medium transition-colors",
            "bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <FileType2 className="h-3 w-3 shrink-0" />
          <span>{representationLabel(representation)}</span>
          <ChevronDown className="h-2.5 w-2.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={6} className="w-60 p-1">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Attach as
        </div>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={(e) => {
              stop(e);
              onChange(opt.value);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Check
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                representation === opt.value ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="min-w-0">
              <span className="block text-foreground">
                {opt.label}
                {opt.disabled ? " (processing…)" : ""}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {opt.hint}
              </span>
            </span>
          </button>
        ))}
        {/* Only offer the binary escape when there's an origin file to fall back
            to — otherwise the switch would remove the chip and add nothing. */}
        {source.file_id ? (
          <>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                onAttachAsFile();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>Attach as file instead</span>
            </button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
