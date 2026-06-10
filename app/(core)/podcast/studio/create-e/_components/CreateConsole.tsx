"use client";

// app/(core)/podcast/studio/create-e/_components/CreateConsole.tsx
//
// Redesigned compose surface — variation E ("the Studio Console").
//
// Modeled after: Spotify for Podcasters' "Create" studio crossed with a
// Linear/Stripe two-pane settings console. Persona: consumer-creator paying
// for the product, working on a large monitor, who wants to feel like they are
// building a real artifact — not filling out a form.
//
// Layout (desktop):
//   ┌──────────────┬───────────────────────────────┬────────────────────┐
//   │ SOURCE RAIL  │           STAGE                │   LIVE EPISODE      │
//   │ (8 inputs,   │   the source input + the       │   PREVIEW           │
//   │  grouped)    │   inline production options    │   (what you'll get) │
//   └──────────────┴───────────────────────────────┴────────────────────┘
//
// Design moves vs. the current /create and vs. variant A:
//   • Source is a labeled, grouped LIST in a fixed rail (Type / Paste / Link /
//     Library) — every one of the 8 sources is first-class and visible, not
//     hidden in a popover segmented control. Selecting one reshapes the stage.
//   • The middle "stage" is the focused work surface: one adaptive input plus a
//     compact production rail (Format · Language · Hosts · Processing · Show)
//     rendered as a real settings list, not floating pills.
//   • The right "live preview" continuously renders the episode artifact you're
//     about to make — cover placeholder, title-from-source, format/lang badges,
//     a production manifest (script → cover art → video → audio). It turns the
//     act of configuring into watching an artifact take shape.
//   • Mobile: rail + preview collapse into stacked drawers; the stage is the
//     single scroll surface. Never a nine-screen column.
//   • Every option is real and first-class — no "soon" chips, no disabled tiles.
//   • Demo: Generate routes to /podcast/studio/run-e (no backend).

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AudioLines,
  Loader2,
  Radio,
  FileText,
  ImageIcon,
  Clapperboard,
  Telescope,
  X,
  SlidersHorizontal,
  Disc3,
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
import { SourceRail } from "./SourceRail";
import { ProductionRail } from "./ProductionRail";
import { EpisodePreview } from "./EpisodePreview";

/**
 * True below the given width. The 3-pane studio layout needs real width
 * (≥1024px) — below it we collapse the rails into drawers so the center stage
 * never gets crushed (the 768–1024 dead zone the JS mobile flag missed).
 */
function useBelow(maxWidth: number): boolean {
  const [below, setBelow] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < maxWidth,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
    const onChange = () => setBelow(window.innerWidth < maxWidth);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [maxWidth]);
  return below;
}

export function CreateConsole() {
  const router = useRouter();
  const isMobile = useBelow(1024);
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

  // ── Processing + advanced. ──
  const [preProcessing, setPreProcessing] = useState<string[]>([]);
  const [postProcessing, setPostProcessing] = useState<string[]>([]);
  const [prepMessage, setPrepMessage] = useState("");
  const [firstShowInfo, setFirstShowInfo] = useState("");
  const [truncate, setTruncate] = useState(true);

  // Mobile drawer state.
  const [mobilePane, setMobilePane] = useState<null | "source" | "preview">(
    null,
  );

  const activeSource = SOURCE_OPTIONS.find((o) => o.kind === sourceKind)!;
  const isRtl = isRtlLanguage(language);
  const isUrlSource = activeSource.control === "urls";
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);

  const canGenerate = isUrlSource
    ? cleanUrls.length > 0
    : text.trim().length > 0;

  // The preview's working title: first meaningful line of the source, or a
  // sensible default so the artifact never looks empty.
  const derivedTitle = useMemo(() => {
    const raw = isUrlSource ? cleanUrls[0] ?? "" : text;
    const firstLine = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    if (!firstLine) return "";
    return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
  }, [text, cleanUrls, isUrlSource]);

  const handleGenerate = () => {
    if (!canGenerate || busy) return;
    setBusy(true);
    startTransition(() => router.push("/podcast/studio/run-e"));
  };

  const sourceRail = (
    <SourceRail
      value={sourceKind}
      onChange={(k) => {
        setSourceKind(k);
        setMobilePane(null);
      }}
    />
  );

  const preview = (
    <EpisodePreview
      title={derivedTitle}
      sourceKind={sourceKind}
      language={language}
      format={format}
      hostCount={hostCount}
      showId={showId}
      hasSource={canGenerate}
    />
  );

  return (
    <div className="flex h-full flex-col">
      {/* ── Top utility bar ──────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-3 pr-14 backdrop-blur-sm sm:px-4">
        <Link
          href="/podcast/studio"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back to studio"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <AudioLines className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold text-foreground">
              New episode
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              Source → script → cover → video → audio
            </p>
          </div>
        </div>

        {/* Mobile pane toggles */}
        {isMobile && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMobilePane("source")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Source
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("preview")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground"
            >
              <Disc3 className="h-3.5 w-3.5 text-primary" />
              Preview
            </button>
          </div>
        )}

        {!isMobile && (
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || busy}
            className="ml-auto h-9 shrink-0 gap-2 shadow-sm"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radio className="h-4 w-4" />
            )}
            {busy ? "Starting…" : "Generate episode"}
          </Button>
        )}
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1">
        {/* Left rail (desktop) */}
        {!isMobile && (
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-card/40 scrollbar-thin">
            {sourceRail}
          </aside>
        )}

        {/* Center stage */}
        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6">
            <SourceStage
              source={activeSource}
              text={text}
              onText={setText}
              urls={urls}
              onUrls={setUrls}
              isRtl={isRtl}
            />

            <ProductionRail
              language={language}
              onLanguage={setLanguage}
              format={format}
              onFormat={setFormat}
              hostCount={hostCount}
              onHostCount={setHostCount}
              showId={showId}
              onShow={setShowId}
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

            {/* Mobile generate (sticky bottom) */}
            {isMobile && (
              <div className="sticky bottom-0 -mx-4 mt-6 border-t border-border bg-card/90 px-4 py-3 pb-safe backdrop-blur-sm">
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate || busy}
                  className="w-full gap-2"
                  size="lg"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Radio className="h-4 w-4" />
                  )}
                  {busy ? "Starting…" : "Generate episode"}
                </Button>
              </div>
            )}
          </div>
        </main>

        {/* Right preview (desktop) */}
        {!isMobile && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card/40 scrollbar-thin">
            {preview}
          </aside>
        )}

        {/* Mobile drawers */}
        {isMobile && mobilePane && (
          <div className="absolute inset-0 z-20 flex flex-col bg-background">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold text-foreground">
                {mobilePane === "source" ? "Choose a source" : "Episode preview"}
              </span>
              <button
                type="button"
                onClick={() => setMobilePane(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {mobilePane === "source" ? sourceRail : preview}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── The center stage: the adaptive source input. ───────────────────────────

function SourceStage({
  source,
  text,
  onText,
  urls,
  onUrls,
  isRtl,
}: {
  source: (typeof SOURCE_OPTIONS)[number];
  text: string;
  onText: (v: string) => void;
  urls: string[];
  onUrls: (next: string[]) => void;
  isRtl: boolean;
}) {
  const Icon = source.icon;
  const isUrl = source.control === "urls";

  return (
    <section>
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            {source.label}
          </h2>
          <p className="text-xs leading-snug text-muted-foreground">
            {source.helper}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {isUrl ? (
          <div className="space-y-2 p-3">
            {urls.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={url}
                  onChange={(e) =>
                    onUrls(urls.map((u, idx) => (idx === i ? e.target.value : u)))
                  }
                  placeholder="https://…/document.pdf"
                  inputMode="url"
                  className="h-10"
                />
                {urls.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onUrls(urls.filter((_, idx) => idx !== i))}
                    className="shrink-0 text-muted-foreground"
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
              onClick={() => onUrls([...urls, ""])}
              className="text-muted-foreground"
            >
              Add another file URL
            </Button>
          </div>
        ) : (
          <ProTextarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder={source.placeholder ?? "Paste or type your source…"}
            rows={source.kind === "topic" ? 4 : 9}
            dir={isRtl ? "rtl" : undefined}
            autoGrow
            minHeight={source.kind === "topic" ? 120 : 220}
            className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
            showCopyButton={false}
          />
        )}
      </div>

      {/* What the producer will make — quiet manifest under the input. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Telescope className="h-3 w-3" /> Researched &amp; scripted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="h-3 w-3" /> Show notes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3" /> Cover art
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clapperboard className="h-3 w-3" /> Video clip
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AudioLines className="h-3 w-3" /> Two-host audio
        </span>
      </div>
    </section>
  );
}
