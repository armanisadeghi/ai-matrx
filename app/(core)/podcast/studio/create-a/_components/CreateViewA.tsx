"use client";

// app/(core)/podcast/studio/create-a/_components/CreateViewA.tsx
//
// Redesigned compose surface (variation A — "lean").
//
// Modeled after: Descript's "New Project" / ElevenLabs Studio create flow —
// a consumer-creator picks a source first, then tunes a compact settings bar.
//
// Design moves vs. the current /create:
//   • Back link + title share ONE row (no stacked, wasted header).
//   • A single dominant composer ("What do you want to make an episode about?")
//     instead of an 8-tile grid screaming for attention. The source TYPE is a
//     quiet popover-segmented control above the input; the input itself adapts.
//   • Every other axis (Language / Format / Hosts / Show) is a pill in a
//     settings bar; click a pill → a popover with the FULL option set. Nothing
//     is hidden — it's one interaction away, grouped by meaning.
//   • Processing layers + advanced live behind a single "More options"
//     disclosure.
//   • Every option — even "coming soon" — gets first-class treatment. No
//     disabled tiles, no Soon chips, no dashed placeholders. This is the new UI.
//   • Demo: Generate routes to /podcast/studio/run-a (no backend call).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Podcast,
  AudioLines,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SOURCE_OPTIONS,
  DEFAULT_LANGUAGE,
  isRtlLanguage,
} from "@/features/podcasts/generator/constants";
import type {
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";
import { SourcePicker } from "./SourcePicker";
import { SettingsBar } from "./SettingsBar";
import { MoreOptions } from "./MoreOptions";

export function CreateViewA() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  // ── Core request state (mirrors the real GeneratorForm fields). ──
  const [sourceKind, setSourceKind] = useState<PodcastSourceKind>("topic");
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);
  const [language, setLanguage] = useState<PodcastLanguageCode>(DEFAULT_LANGUAGE);
  const [format, setFormat] = useState<PodcastFormat>("educational");
  const [hostCount, setHostCount] = useState("2");
  const [showId, setShowId] = useState<string | null>(null);

  // ── Advanced / processing (kept reachable, hidden by default). ──
  const [preProcessing, setPreProcessing] = useState<string[]>([]);
  const [postProcessing, setPostProcessing] = useState<string[]>([]);
  const [prepMessage, setPrepMessage] = useState("");
  const [firstShowInfo, setFirstShowInfo] = useState("");
  const [truncate, setTruncate] = useState(true);

  const activeSource = SOURCE_OPTIONS.find((o) => o.kind === sourceKind)!;
  const isRtl = isRtlLanguage(language);
  const isUrlSource = activeSource.control === "urls";
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);

  const canGenerate = isUrlSource
    ? cleanUrls.length > 0
    : text.trim().length > 0;

  const handleGenerate = () => {
    if (!canGenerate || busy) return;
    setBusy(true);
    // Demo flow: hand off to the mocked run page.
    startTransition(() => router.push("/podcast/studio/run-a"));
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-5 sm:pt-7">
      {/* Header — back link + title on ONE row, with the primary action mirrored. */}
      <div className="mb-6 flex items-center gap-3 pr-14">
        <Link
          href="/podcast/studio"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to studio"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Podcast className="h-4.5 w-4.5" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          New episode
        </h1>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-glass-edge bg-glass px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-glass backdrop-saturate-glass">
          <Sparkles className="h-3 w-3 text-primary" />
          AI-produced
        </span>
      </div>

      {/* ── The composer — one dominant surface. ─────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
          <p className="text-sm font-medium text-foreground">
            What&apos;s your episode about?
          </p>
          <SourcePicker value={sourceKind} onChange={setSourceKind} />
        </div>

        <div className="p-4">
          {isUrlSource ? (
            <UrlInputs urls={urls} onChange={setUrls} />
          ) : (
            <ProTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                activeSource.placeholder ??
                "Paste or type your source content…"
              }
              rows={sourceKind === "topic" ? 4 : 8}
              dir={isRtl ? "rtl" : undefined}
              autoGrow
              minHeight={sourceKind === "topic" ? 110 : 200}
              className="text-base"
            />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {activeSource.helper}
          </p>
        </div>

        {/* ── Settings bar — every dimension, one tap away. ──────────────── */}
        <div className="border-t border-border/70 bg-muted/20 px-3 py-2.5">
          <SettingsBar
            language={language}
            onLanguage={setLanguage}
            format={format}
            onFormat={setFormat}
            hostCount={hostCount}
            onHostCount={setHostCount}
            showId={showId}
            onShow={setShowId}
          />
        </div>
      </div>

      {/* ── More options — processing + advanced, reachable but quiet. ───── */}
      <MoreOptions
        preProcessing={preProcessing}
        onPreProcessing={setPreProcessing}
        postProcessing={postProcessing}
        onPostProcessing={setPostProcessing}
        prepMessage={prepMessage}
        onPrepMessage={setPrepMessage}
        firstShowInfo={firstShowInfo}
        onFirstShowInfo={setFirstShowInfo}
        truncate={truncate}
        onTruncate={setTruncate}
      />

      {/* ── Generate ─────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 rounded-2xl border border-glass-edge bg-glass px-4 py-3 shadow-glass backdrop-blur-glass backdrop-saturate-glass">
        <p className="text-xs text-muted-foreground">
          Cover art, video, and a two-host audio track — all generated for you.
        </p>
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={!canGenerate || busy}
          className="shrink-0 gap-2 shadow-md"
        >
          {busy ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
          ) : (
            <AudioLines className="h-4.5 w-4.5" />
          )}
          {busy ? "Starting…" : "Generate episode"}
        </Button>
      </div>
    </div>
  );
}

/** Multi-URL input for the "From a file" source. */
function UrlInputs({
  urls,
  onChange,
}: {
  urls: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {urls.map((url, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={url}
            onChange={(e) =>
              onChange(urls.map((u, idx) => (idx === i ? e.target.value : u)))
            }
            placeholder="https://…/document.pdf"
            inputMode="url"
          />
          {urls.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(urls.filter((_, idx) => idx !== i))}
              className={cn("shrink-0 text-muted-foreground")}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange([...urls, ""])}
        className="text-muted-foreground"
      >
        Add another file URL
      </Button>
    </div>
  );
}
