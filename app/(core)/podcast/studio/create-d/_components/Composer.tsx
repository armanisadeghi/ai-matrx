"use client";

// app/(core)/podcast/studio/create-d/_components/Composer.tsx
//
// STUDIO D — Create surface.
// Reference product: Descript "New Project" composer crossed with Spotify for
// Creators. Persona: consumer / prosumer creator. The design idea: the SOURCE is
// the hero (one big focused editor), and every production setting collapses into
// a single compact "console" rail beneath it — chips you tap, not a scrolling
// form wall. A persistent summary footer states, in one plain sentence, exactly
// what will be produced, with the dominant Generate action anchored to it.
//
// Stub only: Generate routes to /podcast/studio/run-d. No backend.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Plus,
  X,
  Lightbulb,
  AudioLines,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import type {
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";
import {
  SOURCE_TILES,
  FORMAT_TILES,
  HOST_TILES,
  LANGUAGES,
  DEFAULT_LANGUAGE,
  TOPIC_SUGGESTIONS,
  languageLabel,
} from "./options";
import { ConsoleRail } from "./ConsoleRail";
import type { MockShow } from "../_mock/shows";

interface ComposerProps {
  shows: MockShow[];
}

export function Composer({ shows }: ComposerProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [launching, setLaunching] = useState(false);

  // Source
  const [sourceKind, setSourceKind] = useState<PodcastSourceKind>("topic");
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);
  const [resolveUrl, setResolveUrl] = useState("");

  // Production settings
  const [language, setLanguage] = useState<PodcastLanguageCode>(DEFAULT_LANGUAGE);
  const [format, setFormat] = useState<PodcastFormat>("educational");
  const [hosts, setHosts] = useState<string>("2");
  const [showId, setShowId] = useState<string | null>(null);
  const [fullLength, setFullLength] = useState(false);

  const active = SOURCE_TILES.find((t) => t.kind === sourceKind)!;
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);

  const hasSource =
    active.control === "urls"
      ? cleanUrls.length > 0
      : active.control === "resolve"
        ? resolveUrl.trim().length > 0
        : text.trim().length > 0;

  const canGenerate = hasSource && !launching;

  const formatLabel =
    FORMAT_TILES.find((f) => f.value === format)?.label ?? "Educational";
  const hostLabel = HOST_TILES.find((h) => h.value === hosts)?.label ?? "Duo";

  const summary = useMemo(() => {
    const fmt = formatLabel.toLowerCase();
    const lang = languageLabel(language);
    const len = fullLength ? "full-length" : "preview-length";
    return `A ${fmt}, ${hostLabel.toLowerCase()}-host episode in ${lang} — ${len} audio with cover art and a video clip.`;
  }, [formatLabel, hostLabel, language, fullLength]);

  const handleGenerate = () => {
    if (!canGenerate) return;
    setLaunching(true);
    startTransition(() => router.push("/podcast/studio/run-d"));
  };

  const handleSourceChange = (kind: PodcastSourceKind) => {
    setSourceKind(kind);
    setResolveUrl("");
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-6 sm:px-6">
      {/* ── Source switcher: segmented, horizontally scrollable ──────────── */}
      <div className="-mx-1 overflow-x-auto scrollbar-hide">
        <div className="flex w-max gap-1.5 px-1">
          {SOURCE_TILES.map((t) => {
            const Icon = t.icon;
            const selected = sourceKind === t.kind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => handleSourceChange(t.kind)}
                className={cn(
                  "group flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-all",
                  selected
                    ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── The hero editor card ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-glass-edge bg-glass shadow-glass backdrop-blur-glass backdrop-saturate-glass">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <active.icon className="h-4 w-4 text-primary" />
              {active.label}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {active.helper}
            </p>
          </div>
        </div>

        <div className="p-5">
          {active.control === "text" ? (
            <ProTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={active.placeholder}
              autoGrow
              minHeight={sourceKind === "topic" ? 96 : 220}
              rows={sourceKind === "topic" ? 3 : 9}
              showCopyButton={false}
              className="border-0 bg-transparent px-0 text-lg leading-relaxed shadow-none focus-visible:ring-0"
            />
          ) : active.control === "urls" ? (
            <div className="space-y-2.5">
              {urls.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={u}
                    onChange={(e) =>
                      setUrls((p) =>
                        p.map((v, idx) => (idx === i ? e.target.value : v)),
                      )
                    }
                    placeholder="https://…/document.pdf"
                    inputMode="url"
                    className="h-11 text-base"
                  />
                  {urls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setUrls((p) => p.filter((_, idx) => idx !== i))
                      }
                      aria-label="Remove file URL"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUrls((p) => [...p, ""])}
                className="gap-1.5 text-muted-foreground"
              >
                <Plus className="h-4 w-4" />
                Add another file
              </Button>
            </div>
          ) : (
            // resolve sources — paste a URL / pick a source to load text
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3.5 py-2.5">
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  value={resolveUrl}
                  onChange={(e) => setResolveUrl(e.target.value)}
                  placeholder={
                    sourceKind === "youtube"
                      ? "https://youtube.com/watch?v=…"
                      : sourceKind === "note"
                        ? "Search your notes…"
                        : sourceKind === "audio_file"
                          ? "Upload or paste an audio link…"
                          : "https://…"
                  }
                  className="h-9 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {active.resolveHint}
              </p>
            </div>
          )}

          {/* Topic quick-starts — only on the empty topic editor */}
          {sourceKind === "topic" && text.trim().length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {TOPIC_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setText(s)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <Lightbulb className="h-3 w-3 text-primary" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Production console: every setting, one compact rail ───────────── */}
      <ConsoleRail
        language={language}
        onLanguage={setLanguage}
        format={format}
        onFormat={setFormat}
        hosts={hosts}
        onHosts={setHosts}
        showId={showId}
        onShow={setShowId}
        shows={shows}
        fullLength={fullLength}
        onFullLength={setFullLength}
        languages={LANGUAGES}
      />

      {/* ── The anchored production footer ────────────────────────────────── */}
      {/* Sticky (not fixed): the page lives inside an overflow-y-auto scroll
          container, and the app shell wraps everything in a transformed root —
          a `fixed` element would anchor to that container, not the viewport, and
          collide with the shell's bottom dock. Sticky keeps it pinned to the
          bottom of THIS scroll area, clear of the shell chrome. */}
      <div className="sticky bottom-0 z-20 mt-auto -mx-4 px-4 pt-3 pb-1 sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-4 rounded-2xl border border-glass-edge bg-glass px-4 py-3 shadow-glass-lg backdrop-blur-glass backdrop-saturate-glass">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <AudioLines className="h-3 w-3" />
              Will produce
            </div>
            <p className="mt-0.5 truncate text-sm text-foreground">
              {hasSource ? (
                summary
              ) : (
                <span className="text-muted-foreground">
                  Add a source above to begin.
                </span>
              )}
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="h-12 shrink-0 gap-2 rounded-xl px-6 text-base font-semibold shadow-md"
          >
            {launching ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Starting…
              </>
            ) : (
              <>
                Generate
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
