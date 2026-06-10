"use client";

// app/(core)/podcast/studio/create-c/_components/CreateComposer.tsx
//
// Create-c redesign — modeled after Notion's "new page" composer + Linear's
// issue composer: one calm, dominant input surface with a single horizontal
// row of compact setting pills underneath. Everything the old form exposed is
// still reachable (source, language, format, hosts, show, processing layers,
// advanced) — just progressively disclosed instead of stacked.
//
// Bake-off variation C: the Generate button routes to /podcast/studio/run-c
// (the mock demo run page); it does NOT submit to the backend.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Languages,
  Plus,
  X,
  Users,
  Workflow,
  SlidersHorizontal,
  Library,
  FlaskConical,
  Check,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SettingPill, PillHeader } from "./SettingPill";
import {
  SOURCE_TILES,
  FORMAT_TILES,
  LANGUAGE_TILES,
  HOST_TILES,
  PRE_SCRIPT_PROCESSING,
  POST_SCRIPT_PROCESSING,
  type SourceTile,
} from "./source-data";
import type {
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";

// A few demo shows so the Show pill is fully interactive in the bake-off.
const DEMO_SHOWS = [
  { id: "s1", title: "The Deep Dive" },
  { id: "s2", title: "Field Notes" },
  { id: "s3", title: "Morning Brief" },
];

export function CreateComposer() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [routing, setRouting] = useState(false);

  // Source
  const [sourceKind, setSourceKind] = useState<PodcastSourceKind>("topic");
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);
  const [resolveValue, setResolveValue] = useState("");

  // Settings
  const [language, setLanguage] = useState<PodcastLanguageCode>("en-US");
  const [format, setFormat] = useState<PodcastFormat>("educational");
  const [hostCount, setHostCount] = useState("2");
  const [showId, setShowId] = useState<string | null>(null);
  const [preProcessing, setPreProcessing] = useState<string[]>([]);
  const [postProcessing, setPostProcessing] = useState<string[]>([]);

  // Advanced
  const [prepMessage, setPrepMessage] = useState("");
  const [firstShowInfo, setFirstShowInfo] = useState("");
  const [testMode, setTestMode] = useState(true);

  const activeSource = useMemo<SourceTile>(
    () => SOURCE_TILES.find((s) => s.kind === sourceKind)!,
    [sourceKind],
  );
  const isRtl =
    LANGUAGE_TILES.find((l) => l.code === language)?.rtl ?? false;

  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  const canGenerate =
    activeSource.control === "urls"
      ? cleanUrls.length > 0
      : activeSource.control === "resolve"
        ? resolveValue.trim().length > 0
        : text.trim().length > 0;

  const langLabel = LANGUAGE_TILES.find((l) => l.code === language)?.label ?? "";
  const formatLabel =
    FORMAT_TILES.find((f) => f.value === format)?.label ?? "";
  const hostLabel = HOST_TILES.find((h) => h.value === hostCount)?.label ?? "";
  const showLabel = showId
    ? DEMO_SHOWS.find((s) => s.id === showId)?.title ?? "Show"
    : "Standalone";
  const processingCount = preProcessing.length + postProcessing.length;
  const advancedActive =
    prepMessage.trim().length > 0 || firstShowInfo.trim().length > 0 || !testMode;

  const handleGenerate = () => {
    if (!canGenerate) return;
    setRouting(true);
    startTransition(() => router.push("/podcast/studio/run-c"));
  };

  const toggle = (
    list: string[],
    set: (v: string[]) => void,
    value: string,
  ) => set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="space-y-4">
      {/* ── Composer card: source picker + the matching input ─────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Source segmented strip — scrollable, every tile first-class. */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-2.5 py-2 scrollbar-hide">
          {SOURCE_TILES.map((tile) => {
            const Icon = tile.icon;
            const selected = sourceKind === tile.kind;
            return (
              <button
                key={tile.kind}
                type="button"
                onClick={() => {
                  setSourceKind(tile.kind);
                  setResolveValue("");
                }}
                title={tile.helper}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  selected
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tile.label}
              </button>
            );
          })}
        </div>

        {/* The input control for the active source. */}
        <div className="p-4">
          <p className="mb-2 text-xs text-muted-foreground">
            {activeSource.helper}
          </p>
          {activeSource.control === "text" ? (
            <ProTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={activeSource.placeholder}
              rows={sourceKind === "topic" ? 3 : 7}
              dir={isRtl ? "rtl" : undefined}
              autoGrow
              minHeight={sourceKind === "topic" ? 88 : 176}
              className="text-base"
            />
          ) : activeSource.control === "urls" ? (
            <div className="space-y-2">
              {urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={url}
                    onChange={(e) =>
                      setUrls((prev) =>
                        prev.map((u, idx) => (idx === i ? e.target.value : u)),
                      )
                    }
                    placeholder="https://…/document.pdf"
                    inputMode="url"
                  />
                  {urls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setUrls((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      aria-label="Remove URL"
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
                onClick={() => setUrls((prev) => [...prev, ""])}
                className="gap-1.5 text-muted-foreground"
              >
                <Plus className="h-4 w-4" />
                Add another file URL
              </Button>
            </div>
          ) : (
            <Input
              value={resolveValue}
              onChange={(e) => setResolveValue(e.target.value)}
              placeholder={activeSource.placeholder}
              dir={isRtl ? "rtl" : undefined}
            />
          )}
        </div>
      </div>

      {/* ── Settings bar: one row of pills, each opens its full option set. ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Language */}
        <SettingPill
          icon={Languages}
          label="Language"
          value={langLabel}
          width="w-64"
        >
          <PillHeader title="Language" hint="Speech is voiced by Gemini 2.5 TTS." />
          <div className="max-h-72 overflow-y-auto p-1.5 scrollbar-thin">
            {LANGUAGE_TILES.map((l) => {
              const selected = language === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                    selected
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent/50",
                  )}
                >
                  <span className="flex-1">{l.label}</span>
                  <span
                    className="text-xs text-muted-foreground"
                    dir={l.rtl ? "rtl" : undefined}
                  >
                    {l.native}
                  </span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </SettingPill>

        {/* Format */}
        <SettingPill
          icon={Layers}
          label="Format"
          value={formatLabel}
          width="w-72"
        >
          <PillHeader title="Format" hint="The conversational style of the episode." />
          <div className="p-1.5">
            {FORMAT_TILES.map((f) => {
              const Icon = f.icon;
              const selected = format === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-primary/10" : "hover:bg-accent/50",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selected ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        selected ? "text-primary" : "text-foreground",
                      )}
                    >
                      {f.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {f.helper}
                    </span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </SettingPill>

        {/* Hosts */}
        <SettingPill icon={Users} label="Hosts" value={hostLabel} width="w-64">
          <PillHeader title="Hosts" hint="How many voices in the conversation." />
          <div className="grid grid-cols-2 gap-1.5 p-1.5">
            {HOST_TILES.map((h) => {
              const selected = hostCount === h.value;
              return (
                <button
                  key={h.value}
                  type="button"
                  onClick={() => setHostCount(h.value)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/10"
                      : "border-border hover:bg-accent/50",
                  )}
                >
                  <span
                    className={cn(
                      "text-lg font-semibold",
                      selected ? "text-primary" : "text-foreground",
                    )}
                  >
                    {h.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {h.helper}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingPill>

        {/* Show */}
        <SettingPill
          icon={Library}
          label="Show"
          value={showLabel}
          active={!!showId}
          width="w-64"
        >
          <PillHeader title="Add to a show" hint="Group this episode under a series." />
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => setShowId(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                !showId ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/50",
              )}
            >
              <span className="flex-1">Standalone episode</span>
              {!showId && <Check className="h-4 w-4" />}
            </button>
            {DEMO_SHOWS.map((s) => {
              const selected = showId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShowId(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/50",
                  )}
                >
                  <span className="flex-1 truncate">{s.title}</span>
                  {selected && <Check className="h-4 w-4" />}
                </button>
              );
            })}
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              New show
            </button>
          </div>
        </SettingPill>

        {/* Processing */}
        <SettingPill
          icon={Workflow}
          label="Processing"
          value={processingCount > 0 ? `${processingCount} active` : "None"}
          active={processingCount > 0}
          width="w-80"
        >
          <PillHeader
            title="Processing layers"
            hint="Transform the content as it moves through the pipeline."
          />
          <div className="space-y-3 p-3">
            <ProcessingGroup
              caption="Source"
              target="Script"
              options={PRE_SCRIPT_PROCESSING}
              selected={preProcessing}
              onToggle={(v) => toggle(preProcessing, setPreProcessing, v)}
            />
            <ProcessingGroup
              caption="Script"
              target="Audio"
              options={POST_SCRIPT_PROCESSING}
              selected={postProcessing}
              onToggle={(v) => toggle(postProcessing, setPostProcessing, v)}
            />
          </div>
        </SettingPill>

        {/* Advanced */}
        <SettingPill
          icon={SlidersHorizontal}
          label="Advanced"
          value={advancedActive ? "Customized" : "Defaults"}
          active={advancedActive}
          width="w-80"
        >
          <PillHeader title="Advanced options" />
          <div className="space-y-3.5 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Extra instruction to the research agent
              </Label>
              <ProTextarea
                value={prepMessage}
                onChange={(e) => setPrepMessage(e.target.value)}
                placeholder="Optional — e.g. focus on practical takeaways"
                rows={2}
                showCopyButton={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Show intro / blurb
              </Label>
              <ProTextarea
                value={firstShowInfo}
                onChange={(e) => setFirstShowInfo(e.target.value)}
                placeholder="Optional — a short intro for the show"
                rows={2}
                showCopyButton={false}
              />
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
                <FlaskConical className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="test-mode"
                    className="text-sm font-medium text-foreground"
                  >
                    Test mode
                  </Label>
                  <Switch
                    id="test-mode"
                    checked={testMode}
                    onCheckedChange={setTestMode}
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Trims audio to ~one line per host for fast, cheap runs.
                </p>
              </div>
            </div>
          </div>
        </SettingPill>
      </div>

      {/* ── Generate ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-muted-foreground">
          {testMode ? "Test mode is on — a short preview episode." : "Full-length episode."}
        </p>
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={!canGenerate || routing}
          className="gap-2 shadow-md"
        >
          <AudioLines className="h-4.5 w-4.5" />
          {routing ? "Starting…" : "Generate episode"}
        </Button>
      </div>
    </div>
  );
}

function ProcessingGroup({
  caption,
  target,
  options,
  selected,
  onToggle,
}: {
  caption: string;
  target: string;
  options: { value: string; label: string; helper: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">{caption}</span>
        <ArrowRight className="h-3 w-3" />
        <span className="rounded bg-muted px-1.5 py-0.5">{target}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              title={o.helper}
              onClick={() => onToggle(o.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                on
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
