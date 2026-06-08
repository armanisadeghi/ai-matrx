"use client";

// features/podcasts/generator/components/TranscriptPanel.tsx
// Collapsible full transcript with copy. RTL-aware for Persian episodes.

import { useState } from "react";
import { toast } from "sonner";
import { FileText, ChevronDown, Copy, Check } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface TranscriptPanelProps {
  script: string;
  rtl?: boolean;
}

export function TranscriptPanel({ script, rtl }: TranscriptPanelProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!script.trim()) return null;

  const wordCount = script.trim().split(/\s+/).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
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
        <div className="flex items-center justify-between px-4 py-3">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            Transcript
            <span className="text-xs font-normal text-muted-foreground">
              {wordCount.toLocaleString()} words
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copy
          </button>
        </div>
        <CollapsibleContent>
          <div
            dir={rtl ? "rtl" : undefined}
            className="max-h-96 overflow-y-auto border-t border-border px-4 py-3 text-sm leading-relaxed text-foreground/90"
          >
            <p className="whitespace-pre-wrap">{script}</p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
