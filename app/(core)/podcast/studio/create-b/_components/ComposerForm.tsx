"use client";

// create-b — the redesigned compose surface.
//
// Reference: Spotify-for-Podcasters / Descript "new project" composer, with a
// Linear-style compact settings bar. Persona: a paying consumer who wants to
// get an episode out fast, not study a control panel.
//
// The redesign's two moves:
//   1. The SOURCE is the hero. A segmented source picker + one large composer is
//      all you see first — because that is the only thing that always matters.
//   2. Everything else (Language, Format, Hosts, Show, Processing, Advanced)
//      collapses into a single row of SETTING PILLS that each show their current
//      value and open a popover with the FULL option set. Nothing is hidden,
//      disabled, or demoted — every "coming soon" feature is treated as live.
//
// It reuses the real generator constants + request shape so it stays promotable.

import { useState } from "react";
import {
  Plus,
  X,
  Languages,
  Users,
  Workflow,
  SlidersHorizontal,
  Sparkles,
  FlaskConical,
  ArrowRight,
  Library,
  Check,
  Mic,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  SOURCE_OPTIONS,
  LANGUAGE_OPTIONS,
  DEFAULT_LANGUAGE,
  isRtlLanguage,
  FORMAT_OPTIONS,
  HOST_COUNT_OPTIONS,
  PRE_SCRIPT_PROCESSING_OPTIONS,
  POST_SCRIPT_PROCESSING_OPTIONS,
} from "@/features/podcasts/generator/constants";
import type {
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";
import { SettingPill, PopoverHeader } from "./SettingPill";

export function ComposerForm({ onGenerate }: { onGenerate: () => void }) {
  const [sourceKind, setSourceKind] = useState<PodcastSourceKind>("topic");
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);

  const [language, setLanguage] = useState<PodcastLanguageCode>(DEFAULT_LANGUAGE);
  const [format, setFormat] = useState<PodcastFormat>("educational");
  const [hostCount, setHostCount] = useState("2");
  const [showName, setShowName] = useState<string | null>(null);

  // Processing — multi-select pre/post pipeline layers (treated as fully live).
  const [pre, setPre] = useState<Set<string>>(new Set());
  const [post, setPost] = useState<Set<string>>(new Set());

  // Advanced.
  const [prepMessage, setPrepMessage] = useState("");
  const [firstShowInfo, setFirstShowInfo] = useState("");
  const [truncate, setTruncate] = useState(true);

  const activeSource = SOURCE_OPTIONS.find((o) => o.kind === sourceKind)!;
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  const isRtl = isRtlLanguage(language);
  const langOpt = LANGUAGE_OPTIONS.find((l) => l.code === language)!;
  const fmtOpt = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const hostOpt = HOST_COUNT_OPTIONS.find((h) => h.value === hostCount)!;

  const canGenerate =
    activeSource.control === "urls"
      ? cleanUrls.length > 0
      : text.trim().length > 0;

  const processingCount = pre.size + post.size;

  const toggle = (
    set: Set<string>,
    setSet: (s: Set<string>) => void,
    value: string,
  ) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  };

  return (
    <div className="space-y-5">
      {/* ── HERO: SOURCE ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-glass-edge bg-glass p-1.5 shadow-glass backdrop-blur-glass backdrop-saturate-glass">
        {/* Segmented source picker — every source is first-class, scrolls on small screens. */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide rounded-xl bg-muted/40 p-1">
          {SOURCE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = sourceKind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() => setSourceKind(opt.kind)}
                className={cn(
                  "group flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                  selected
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}
                />
                {opt.label.replace(/^From an? /i, "")}
              </button>
            );
          })}
        </div>

        {/* The composer for the selected source. */}
        <div className="p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {activeSource.helper}
          </p>
          {activeSource.control === "urls" ? (
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
            <ProTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                activeSource.placeholder ?? "Paste or type your source…"
              }
              rows={sourceKind === "topic" ? 3 : 6}
              dir={isRtl ? "rtl" : undefined}
              autoGrow
              minHeight={sourceKind === "topic" ? 88 : 156}
              showCopyButton={false}
              className="text-base"
            />
          )}
        </div>
      </div>

      {/* ── SETTINGS BAR — every other option, one pill each ──────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Language */}
        <SettingPill
          icon={Languages}
          label="Language"
          value={langOpt.label}
          active={language !== DEFAULT_LANGUAGE}
          width="w-72"
        >
          <PopoverHeader
            icon={Languages}
            title="Language"
            hint="The voice locale your hosts speak in."
          />
          <div className="max-h-72 overflow-y-auto scrollbar-thin p-1.5">
            {LANGUAGE_OPTIONS.map((lang) => {
              const selected = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground hover:bg-accent/50",
                  )}
                >
                  <span className="flex-1">{lang.label}</span>
                  <span
                    className="text-xs text-muted-foreground"
                    dir={lang.rtl ? "rtl" : undefined}
                  >
                    {lang.native}
                  </span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </SettingPill>

        {/* Format */}
        <SettingPill
          icon={fmtOpt.icon}
          label="Format"
          value={fmtOpt.label}
          active={format !== "educational"}
          width="w-72"
        >
          <PopoverHeader
            icon={fmtOpt.icon}
            title="Format"
            hint="The conversational style of the episode."
          />
          <div className="grid grid-cols-1 gap-1.5 p-2">
            {FORMAT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = format === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormat(opt.value)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all",
                    selected
                      ? "border-primary/50 bg-primary/5"
                      : "border-transparent hover:bg-accent/50",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      selected ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {opt.label}
                    </span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      {opt.helper}
                    </span>
                  </span>
                  {selected && (
                    <Check className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </SettingPill>

        {/* Hosts */}
        <SettingPill
          icon={Users}
          label="Hosts"
          value={hostOpt.label + (hostOpt.helper ? ` · ${hostOpt.helper}` : "")}
          active={hostCount !== "2"}
          width="w-72"
        >
          <PopoverHeader
            icon={Users}
            title="Hosts"
            hint="How many voices carry the conversation."
          />
          <div className="grid grid-cols-2 gap-1.5 p-2">
            {HOST_COUNT_OPTIONS.map((opt) => {
              const selected = hostCount === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setHostCount(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg border p-3 transition-all",
                    selected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-accent/50",
                  )}
                >
                  <span className="text-lg font-semibold text-foreground">
                    {opt.label}
                  </span>
                  {opt.helper && (
                    <span className="text-[11px] text-muted-foreground">
                      {opt.helper}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </SettingPill>

        {/* Show */}
        <SettingPill
          icon={Library}
          label="Show"
          value={showName ?? "Standalone"}
          active={!!showName}
          width="w-72"
        >
          <PopoverHeader
            icon={Library}
            title="Add to a show"
            hint="Group this episode under one of your shows, or leave it standalone."
          />
          <div className="space-y-1.5 p-2">
            <button
              type="button"
              onClick={() => setShowName(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                !showName ? "bg-primary/10" : "hover:bg-accent/50",
              )}
            >
              <Mic className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-foreground">Standalone episode</span>
              {!showName && <Check className="h-4 w-4 text-primary" />}
            </button>
            {["The Deep Dive", "Morning Brief", "Founder Notes"].map((name) => {
              const selected = showName === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setShowName(name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    selected ? "bg-primary/10" : "hover:bg-accent/50",
                  )}
                >
                  <Library className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-foreground">{name}</span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-1.5 text-muted-foreground"
            >
              <Plus className="h-4 w-4" />
              New show
            </Button>
          </div>
        </SettingPill>

        {/* Processing */}
        <SettingPill
          icon={Workflow}
          label="Processing"
          value={processingCount === 0 ? "None" : `${processingCount} layer${processingCount > 1 ? "s" : ""}`}
          active={processingCount > 0}
          width="w-80"
        >
          <PopoverHeader
            icon={Workflow}
            title="Processing pipeline"
            hint="Optional transforms between source → script → audio."
          />
          <div className="space-y-3 p-3">
            <ProcessingGroup
              caption="Source"
              target="Script"
              options={PRE_SCRIPT_PROCESSING_OPTIONS}
              selected={pre}
              onToggle={(v) => toggle(pre, setPre, v)}
            />
            <ProcessingGroup
              caption="Script"
              target="Audio"
              options={POST_SCRIPT_PROCESSING_OPTIONS}
              selected={post}
              onToggle={(v) => toggle(post, setPost, v)}
            />
          </div>
        </SettingPill>

        {/* Advanced */}
        <SettingPill
          icon={SlidersHorizontal}
          label="Advanced"
          value={truncate ? "Test mode" : "Full length"}
          active={!truncate || !!prepMessage || !!firstShowInfo}
          width="w-96"
        >
          <PopoverHeader
            icon={SlidersHorizontal}
            title="Advanced options"
            hint="Fine-tune the research and run length."
          />
          <div className="space-y-3.5 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Extra instruction to the research agent
              </Label>
              <ProTextarea
                value={prepMessage}
                onChange={(e) => setPrepMessage(e.target.value)}
                placeholder="e.g. focus on the practical takeaways"
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
                placeholder="A short intro for the show"
                rows={2}
                showCopyButton={false}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
                <FlaskConical className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    Test mode — short audio
                  </span>
                  <Switch checked={truncate} onCheckedChange={setTruncate} />
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  Trims audio to ~one line per host for fast, cheap runs. Script,
                  cover art and video stay full quality.
                </span>
              </span>
            </label>
          </div>
        </SettingPill>
      </div>

      {/* ── GENERATE ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-muted-foreground">
          {canGenerate
            ? "Ready — your episode generates in a few minutes."
            : "Add a source to get started."}
        </p>
        <Button
          size="lg"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="gap-2 shadow-md"
        >
          <Sparkles className="h-4.5 w-4.5" />
          Generate episode
          <ArrowRight className="h-4 w-4" />
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
  selected: Set<string>;
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
          const on = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              title={o.helper}
              onClick={() => onToggle(o.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                on
                  ? "border-primary/50 bg-primary/10 text-primary"
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
