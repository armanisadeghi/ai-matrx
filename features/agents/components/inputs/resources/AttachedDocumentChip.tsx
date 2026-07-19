"use client";

import { createElement, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Loader2, X } from "lucide-react";
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
import type { VariableResourceContextConfig } from "@/features/agents/types/agent-definition.types";
import { ResourceFamilyPolicyEditor } from "@/features/agents/components/inputs/resources/ResourceFamilyPolicyEditor";

interface AttachedDocumentChipProps {
  title: string;
  fileId: string | null;
  resourcePolicy?: VariableResourceContextConfig;
  onOpen: () => void;
  onRemove: () => void;
  onPolicyChange: (policy: VariableResourceContextConfig) => Promise<boolean>;
}

function policyLabel(policy: VariableResourceContextConfig | undefined): string {
  const promoted = policy?.promote?.length ?? 0;
  const excluded = policy?.exclude?.length ?? 0;
  if (!promoted && !excluded) return "All";
  return `${promoted} inline${excluded ? ` · ${excluded} off` : ""}`;
}

export function AttachedDocumentChip({
  title,
  fileId,
  resourcePolicy,
  onOpen,
  onRemove,
  onPolicyChange,
}: AttachedDocumentChipProps) {
  const [open, setOpen] = useState(false);
  const [draftPolicy, setDraftPolicy] = useState(resourcePolicy);
  const [saving, setSaving] = useState(false);
  const theme = resolveResourceAttachmentTileTheme("processed_document");

  const commitDraft = async (): Promise<boolean> => {
    if (
      draftPolicy &&
      JSON.stringify(draftPolicy) !== JSON.stringify(resourcePolicy)
    ) {
      setSaving(true);
      try {
        return await onPolicyChange(draftPolicy);
      } finally {
        setSaving(false);
      }
    }
    return true;
  };
  const handleOpenChange = async (next: boolean) => {
    if (saving) return;
    if (next) {
      setDraftPolicy(resourcePolicy);
    } else {
      if (!(await commitDraft())) return;
    }
    setOpen(next);
  };

  const stopBubble = (event: React.SyntheticEvent) => event.stopPropagation();
  const stopRemove = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!saving) onRemove();
  };
  const openDetails = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!(await commitDraft())) return;
    onOpen();
    setOpen(false);
  };

  return (
    <span className="group relative inline-flex shrink-0">
      <Popover
        open={open}
        onOpenChange={(next) => void handleOpenChange(next)}
        modal
      >
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
                Complete resource family
              </div>
              <div className="font-medium text-popover-foreground">{title}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                {policyLabel(resourcePolicy)}
                {fileId ? " · click the right side to configure" : ""}
              </div>
            </TooltipContent>
          </Tooltip>

          <span className="w-px shrink-0 self-stretch bg-border" aria-hidden />
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={stopBubble}
              onPointerDown={stopBubble}
              disabled={!fileId}
              aria-label={`Resource family policy: ${policyLabel(resourcePolicy)}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 px-1.5",
                "transition-colors hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span>{policyLabel(resourcePolicy)}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0" />
            </button>
          </PopoverTrigger>
        </div>

        <PopoverContent
          side="top"
          align="start"
          sideOffset={6}
          className="max-h-[min(32rem,70dvh)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto p-3"
          onClick={stopBubble}
        >
          <ResourceFamilyPolicyEditor
            fileId={fileId}
            value={draftPolicy}
            onChange={setDraftPolicy}
            disabled={saving}
            compact
          />
          <div className="my-2 border-t border-border" />
          {saving ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving context…
            </div>
          ) : null}
          <button
            type="button"
            onClick={(event) => void openDetails(event)}
            disabled={saving}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>See file details</span>
          </button>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={stopRemove}
        disabled={saving}
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
