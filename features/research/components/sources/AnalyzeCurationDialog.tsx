"use client";

import { useState } from "react";
import { Scissors, RotateCcw, Brain, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full scraped content to curate (empty string if none yet). */
  content: string;
  /**
   * Run analysis. `curated` = the trimmed/edited text to save + analyze, or
   * `null` to analyze the full stored content as-is.
   */
  onAnalyze: (curated: string | null) => void;
  busy?: boolean;
}

/**
 * The "10 seconds of help" before an expensive analysis: let the human chop the
 * junk (nav, boilerplate, comment sludge) off a scraped page so the model — and
 * downstream RAG — only see what matters. Trimming is saved (the original is
 * backed up server-side and recoverable), or the user can analyze as-is.
 */
export function AnalyzeCurationDialog({
  open,
  onOpenChange,
  content,
  onAnalyze,
  busy,
}: Props) {
  const original = content ?? "";
  const len = original.length;
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [text, setText] = useState(original);

  // Reset trims when the dialog opens — React's "adjust state on prop change"
  // pattern (set during render, guarded), not a setState-in-effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStart(0);
      setEnd(0);
      setText(original);
    }
  }

  const applyTrim = (s: number, e: number) => {
    const ns = Math.max(0, Math.min(s, len));
    const ne = Math.max(0, Math.min(e, len - ns));
    setStart(ns);
    setEnd(ne);
    setText(original.slice(ns, len - ne));
  };

  const removed = Math.max(0, len - text.length);
  const pct = len > 0 ? Math.round((text.length / len) * 100) : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Scissors className="h-4 w-4 text-primary" />
            Curate content before analysis
          </DialogTitle>
          <DialogDescription className="text-xs">
            Trim the junk so the model — and downstream RAG — only see what
            matters. The original scrape is backed up and recoverable.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
          <span>
            <b className="text-foreground">{text.length.toLocaleString()}</b>{" "}
            chars to analyze
          </span>
          <span>
            of {len.toLocaleString()} ({pct}%)
          </span>
          {removed > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              −{removed.toLocaleString()} trimmed
            </span>
          )}
        </div>

        {len > 0 && (
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
                Trim start
              </span>
              <Slider
                value={[start]}
                min={0}
                max={len}
                step={1}
                onValueChange={(v) => applyTrim(v[0] ?? 0, end)}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
                Trim end
              </span>
              <Slider
                value={[end]}
                min={0}
                max={len}
                step={1}
                onValueChange={(v) => applyTrim(start, v[0] ?? 0)}
                className="flex-1"
              />
            </div>
            <button
              type="button"
              onClick={() => applyTrim(0, 0)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to full
            </button>
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder="No scraped content for this source."
          className="w-full resize-y rounded-lg border border-border bg-background p-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => onAnalyze(null)}
            disabled={busy}
          >
            Analyze full as-is
          </Button>
          <Button
            onClick={() => onAnalyze(text)}
            disabled={busy || text.trim().length === 0}
            className="gap-1.5"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Brain className="h-3.5 w-3.5" />
            )}
            Analyze curated
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
