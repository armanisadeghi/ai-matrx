"use client";

// features/podcasts/generator/components/TranscriptPanel.tsx
// Collapsible transcript rendered as a clean two-host conversation — the raw
// `script` is parsed by its delimiters (JSON header / duration / dialogue tags
// stripped) so only the real speaker turns show. RTL-aware for Persian.

import { useState } from "react";
import { toast } from "sonner";
import { FileText, ChevronDown, Copy, Check, Clock } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { parseScript, speakerSlot } from "../script";

interface TranscriptPanelProps {
  script: string;
  rtl?: boolean;
}

export function TranscriptPanel({ script, rtl }: TranscriptPanelProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!script.trim()) return null;

  const parsed = parseScript(script);
  const hasDialogue = parsed.turns.length > 0;
  const wordCount = (hasDialogue ? parsed.plain : script)
    .trim()
    .split(/\s+/).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        hasDialogue ? parsed.plain : script,
      );
      setCopied(true);
      toast.success("Transcript copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Two rows so the narrow column never wraps: title on top, the
            duration · word-count beneath it; copy (icon-only) + chevron right. */}
        <div className="flex items-center gap-2 px-4 py-3">
          <CollapsibleTrigger className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              Transcript
            </span>
            <span className="flex items-center gap-2 pl-6 text-xs font-normal text-muted-foreground">
              {parsed.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {parsed.duration}
                </span>
              )}
              <span>{wordCount.toLocaleString()} words</span>
            </span>
          </CollapsibleTrigger>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy transcript"
            title="Copy transcript"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <CollapsibleTrigger
            aria-label={open ? "Collapse transcript" : "Expand transcript"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div
            dir={rtl ? "rtl" : undefined}
            className="max-h-[28rem] overflow-y-auto border-t border-border px-4 py-4"
          >
            {hasDialogue ? (
              <div className="space-y-4">
                {parsed.turns.map((turn, i) => {
                  const slot = speakerSlot(turn.speaker, parsed.speakers);
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <span
                        className={cn(
                          "text-xs font-semibold uppercase tracking-wide",
                          slot === 0 ? "text-primary" : "text-secondary",
                        )}
                      >
                        {turn.speaker}
                      </span>
                      <p className="text-sm leading-relaxed text-foreground/90">
                        {turn.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {script}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
