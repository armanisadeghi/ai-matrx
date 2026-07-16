"use client";

import { useState } from "react";
import { BrushCleaning, Check, ClipboardPaste, Copy, Download, Eraser, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { computeTextCounterMetrics, formatDuration, normalizeCounterText } from "./textCounterMetrics";

const LIMIT_PRESETS = [
  { label: "Custom", value: "custom", limit: null },
  { label: "SMS", value: "sms", limit: 160 },
  { label: "SEO title", value: "seo-title", limit: 60 },
  { label: "Meta description", value: "meta-description", limit: 160 },
  { label: "Push notification", value: "push", limit: 120 },
];

export interface CharacterCounterProps {
  initialText?: string;
  className?: string;
  compact?: boolean;
}

function Metric({ label, value, emphasis = false }: { label: string; value: string | number; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-3 py-2", emphasis && "border-primary/40 bg-primary/5")}>
      <div className="text-lg font-semibold tabular-nums text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

export function CharacterCounter({ initialText = "", className, compact = false }: CharacterCounterProps) {
  const [text, setText] = useState(initialText);
  const [limit, setLimit] = useState<number | null>(null);
  const [preset, setPreset] = useState("custom");
  const [copied, setCopied] = useState(false);
  const metrics = computeTextCounterMetrics(text);
  const remaining = limit === null ? null : limit - metrics.graphemes;
  const percent = limit ? Math.min((metrics.graphemes / limit) * 100, 100) : 0;

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Text copied to clipboard");
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  const pasteText = async () => {
    try {
      setText(await navigator.clipboard.readText());
      toast.success("Text pasted from clipboard");
    } catch {
      toast.error("Allow clipboard access, then paste into the editor");
    }
  };

  const downloadText = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "character-counter-text.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={cn("flex min-h-0 flex-col gap-3", className)} aria-label="Character and word counter">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className={cn("font-semibold tracking-tight", compact ? "text-base" : "text-2xl")}>Character Counter</h1>
          {!compact ? <p className="mt-0.5 text-sm text-muted-foreground">Count text locally—nothing is uploaded or stored.</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={pasteText}><ClipboardPaste className="h-3.5 w-3.5" />Paste</Button>
          <Button variant="outline" size="sm" onClick={() => setText(normalizeCounterText(text))} disabled={!text}><BrushCleaning className="h-3.5 w-3.5" />Clean</Button>
          <Button variant="outline" size="sm" onClick={copyText} disabled={!text}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</Button>
          <Button variant="outline" size="sm" onClick={downloadText} disabled={!text}><Download className="h-3.5 w-3.5" />Download</Button>
          <Button variant="ghost" size="sm" onClick={() => setText("")} disabled={!text}><Eraser className="h-3.5 w-3.5" />Clear</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-h-[18rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type or paste text here…"
            aria-label="Text to count"
            className="min-h-[18rem] flex-1 resize-none rounded-none border-0 bg-transparent p-4 text-base leading-7 shadow-none focus-visible:ring-0"
          />
          <div className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
            Unicode-aware counts: emoji and combined characters count as one visible character.
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-primary" />Length goal</div>
            <div className="flex gap-2">
              <select value={preset} onChange={(event) => { const next = LIMIT_PRESETS.find((item) => item.value === event.target.value) ?? LIMIT_PRESETS[0]; setPreset(next.value); setLimit(next.limit); }} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                {LIMIT_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <Input aria-label="Character limit" type="number" min="1" value={limit ?? ""} onChange={(event) => { setPreset("custom"); setLimit(event.target.value ? Number(event.target.value) : null); }} placeholder="Limit" className="w-24" />
            </div>
            {limit ? <><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-[width]", remaining !== null && remaining < 0 ? "bg-destructive" : percent >= 90 ? "bg-warning" : "bg-primary")} style={{ width: `${percent}%` }} /></div><div className={cn("mt-1.5 text-xs font-medium", remaining !== null && remaining < 0 ? "text-destructive" : "text-muted-foreground")}>{remaining !== null && remaining < 0 ? `${Math.abs(remaining).toLocaleString()} over limit` : `${remaining?.toLocaleString()} remaining`}</div></> : <p className="mt-2 text-xs text-muted-foreground">Set a target to track a limit or minimum.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Characters" value={metrics.graphemes} emphasis />
            <Metric label="Words" value={metrics.words} emphasis />
            <Metric label="No spaces" value={metrics.charactersWithoutWhitespace} />
            <Metric label="Bytes (UTF-8)" value={metrics.bytes} />
            <Metric label="Sentences" value={metrics.sentences} />
            <Metric label="Paragraphs" value={metrics.paragraphs} />
            <Metric label="Lines" value={metrics.lines} />
            <Metric label="Unique words" value={metrics.uniqueWords} />
          </div>
        </aside>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs font-medium text-muted-foreground">Reading time</div><div className="mt-1 text-lg font-semibold">{formatDuration(metrics.readingMinutes)}</div><div className="text-xs text-muted-foreground">at 225 words/minute</div></div>
        <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs font-medium text-muted-foreground">Speaking time</div><div className="mt-1 text-lg font-semibold">{formatDuration(metrics.speakingMinutes)}</div><div className="text-xs text-muted-foreground">at 150 words/minute</div></div>
        <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs font-medium text-muted-foreground">Writing rhythm</div><div className="mt-1 text-lg font-semibold">{metrics.averageSentenceLength.toFixed(1)} words/sentence</div><div className="text-xs text-muted-foreground">{metrics.averageWordLength.toFixed(1)} average word length</div></div>
      </div>

      {!compact ? <div className="rounded-xl border border-border bg-card p-3"><div className="mb-2 text-sm font-medium">Top keywords <span className="font-normal text-muted-foreground">(common English words excluded)</span></div>{metrics.keywordDensity.length ? <div className="flex flex-wrap gap-2">{metrics.keywordDensity.map((keyword) => <span key={keyword.word} className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">{keyword.word} <span className="text-muted-foreground">{keyword.count} · {keyword.percentage.toFixed(1)}%</span></span>)}</div> : <p className="text-sm text-muted-foreground">Add text to see meaningful repeated words and their density.</p>}</div> : null}
    </section>
  );
}
