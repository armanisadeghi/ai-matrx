"use client";

/**
 * Unified composer chip for durable document attachments — one pill per edge.
 * Left: truncated document name (opens the document canvas). Right: the active
 * attach mode (File / Clean / Raw) with a dropdown for mode switches + See Details.
 */

import { createElement, useState } from "react";
import { Check, ChevronDown, ExternalLink, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveResourceAttachmentTileTheme } from "@/features/agents/components/messages-display/user/resourceAttachmentTile.theme";
import {
  attachedDocumentModeLabel,
  attachedDocumentModeOptions,
  type AttachedDocumentMode,
} from "@/features/agents/utils/processedDocumentContext";

interface AttachedDocumentChipProps {
  title: string;
  mode: AttachedDocumentMode;
  hasProcessedDocument: boolean;
  hasCleanContent: boolean;
  hasOriginFile: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onSelectMode: (mode: AttachedDocumentMode) => void;
}

export function AttachedDocumentChip({
  title,
  mode,
  hasProcessedDocument,
  hasCleanContent,
  hasOriginFile,
  onOpen,
  onRemove,
  onSelectMode,
}: AttachedDocumentChipProps) {
  const [open, setOpen] = useState(false);
  const theme = resolveResourceAttachmentTileTheme("processed_document");
  const modeOptions = attachedDocumentModeOptions({
    hasProcessedDocument,
    hasCleanContent,
    hasOriginFile,
  });

  const stopMenuEvent = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const stopTriggerBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };
  const stopRemove = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  };

  const selectMode = (next: AttachedDocumentMode) => {
    if (next === mode) return;
    onSelectMode(next);
    setOpen(false);
  };

  const openDetails = () => {
    onOpen();
    setOpen(false);
  };

  return (
    <span className="group relative inline-flex shrink-0">
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <div
          className={cn(
            "inline-flex h-6 min-w-0 items-stretch overflow-hidden rounded-full border border-border",
            "bg-card text-[11px] font-medium text-muted-foreground",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpen}
                aria-label={`Document: ${title}`}
                className={cn(
                  "inline-flex min-w-0 max-w-[7rem] items-center gap-1 px-2",
                  "transition-colors hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {createElement(FileText, {
                  className: cn("h-3 w-3 shrink-0", theme.icon),
                })}
                <span className="truncate">{title}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[16rem]">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Document
              </div>
              <div className="font-medium text-popover-foreground">{title}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                Attached as {attachedDocumentModeLabel(mode)}
              </div>
            </TooltipContent>
          </Tooltip>

          {modeOptions.length > 0 ? (
            <>
              <span
                className="w-px shrink-0 self-stretch bg-border"
                aria-hidden
              />
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={stopTriggerBubble}
                  onPointerDown={stopTriggerBubble}
                  aria-label={`Attach mode: ${attachedDocumentModeLabel(mode)}`}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-0.5 px-1.5",
                    "transition-colors hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span>{attachedDocumentModeLabel(mode)}</span>
                  <ChevronDown className="h-2.5 w-2.5 shrink-0" />
                </button>
              </PopoverTrigger>
            </>
          ) : null}
        </div>

        {modeOptions.length > 0 ? (
          <PopoverContent
            side="top"
            align="start"
            sideOffset={6}
            className="w-60 p-1"
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Attach as
            </div>
            {modeOptions.map((opt) => (
              <button
                key={opt.mode}
                type="button"
                disabled={opt.disabled}
                onClick={(e) => {
                  stopMenuEvent(e);
                  selectMode(opt.mode);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  "hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <Check
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    mode === opt.mode ? "opacity-100" : "opacity-0",
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
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={(e) => {
                stopMenuEvent(e);
                openDetails();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>See Details</span>
            </button>
          </PopoverContent>
        ) : null}
      </Popover>

      <button
        type="button"
        onClick={stopRemove}
        aria-label={`Remove ${title}`}
        className={cn(
          "absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full",
          "border border-border bg-background text-muted-foreground shadow-sm",
          "transition-opacity hover:bg-destructive hover:text-destructive-foreground",
          "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
          "pointer-coarse:opacity-100",
        )}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
