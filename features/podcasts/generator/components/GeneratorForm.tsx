"use client";

// features/podcasts/generator/components/GeneratorForm.tsx
//
// The compose surface — the Podcast Studio centerpiece. It shows the full
// product vision: every source, language, format, host-count and processing
// option the platform intends to support. Wired pieces drive the real
// PodcastGenerateRequest; everything else is a ComingSoon placeholder that's
// visible now and trivial to wire later.
//
// Section order (top → bottom):
//   1. Source        ("What's your source?")
//   2. Processing     (pre-script · post-script — both ComingSoon)
//   3. Language       (Gemini 2.5 TTS locales — English wired, rest Soon)
//   4. Format         (Educational + News wired, rest ComingSoon)
//   5. Hosts          (2 wired, rest ComingSoon + Advanced-hosts disclosure)
//   6. Show picker
//   7. Advanced       (extra instruction, show blurb, Test mode)
//
// Only the request fields the backend honors are sent for the wired path:
// input_data / file_urls, podcast_type (derived from Language + Format),
// post_prep_option, show_id, prep_user_message, first_show_info_text,
// truncate_audio_for_testing.

import { useState } from "react";
import {
  AudioLines,
  Plus,
  X,
  ChevronDown,
  SlidersHorizontal,
  FlaskConical,
  Languages,
  Users,
  Workflow,
  ArrowRight,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import { cn } from "@/lib/utils";
import { ShowPicker } from "./ShowPicker";
import {
  SOURCE_OPTIONS,
  LANGUAGE_OPTIONS,
  DEFAULT_LANGUAGE,
  isRtlLanguage,
  deriveBackendPodcastType,
  FORMAT_OPTIONS,
  HOST_COUNT_OPTIONS,
  PRE_SCRIPT_PROCESSING_OPTIONS,
  POST_SCRIPT_PROCESSING_OPTIONS,
} from "../constants";
import type {
  PodcastGenerateRequest,
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
} from "../types";
import type { PcShow } from "@/features/podcasts/types";

interface GeneratorFormProps {
  shows: PcShow[];
  onShowCreated: (show: PcShow) => void;
  onGenerate: (body: PodcastGenerateRequest) => void;
  busy: boolean;
}

const SECTION_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export function GeneratorForm({
  shows,
  onShowCreated,
  onGenerate,
  busy,
}: GeneratorFormProps) {
  const [sourceKind, setSourceKind] = useState<PodcastSourceKind>("topic");
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);
  const [language, setLanguage] = useState<PodcastLanguageCode>(DEFAULT_LANGUAGE);
  const [format, setFormat] = useState<PodcastFormat>("educational");
  const [hostCount, setHostCount] = useState("2");
  const [showId, setShowId] = useState<string | null>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedHostsOpen, setAdvancedHostsOpen] = useState(false);
  const [truncate, setTruncate] = useState(true);
  const [prepMessage, setPrepMessage] = useState("");
  const [firstShowInfo, setFirstShowInfo] = useState("");

  const activeSource = SOURCE_OPTIONS.find((o) => o.kind === sourceKind)!;
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  const isRtl = isRtlLanguage(language);

  const canGenerate =
    !busy &&
    !activeSource.comingSoon &&
    (activeSource.control === "urls"
      ? cleanUrls.length > 0
      : activeSource.control === "text"
        ? text.trim().length > 0
        : false);

  const handleGenerate = () => {
    if (!canGenerate || !activeSource.inputDataType) return;
    const body: PodcastGenerateRequest = {
      input_data_type: activeSource.inputDataType,
      podcast_type: deriveBackendPodcastType(language, format),
      truncate_audio_for_testing: truncate,
      post_prep_option: "none",
      show_id: showId,
    };
    if (activeSource.control === "urls") {
      body.file_urls = cleanUrls;
    } else {
      body.input_data = text.trim();
    }
    if (prepMessage.trim()) body.prep_user_message = prepMessage.trim();
    if (firstShowInfo.trim()) body.first_show_info_text = firstShowInfo.trim();
    onGenerate(body);
  };

  return (
    <div className="space-y-7">
      {/* ── 1. SOURCE ─────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <Label className={SECTION_LABEL}>What&apos;s your source?</Label>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {SOURCE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = sourceKind === opt.kind;
            const tile = (
              <button
                key={opt.kind}
                type="button"
                onClick={() => setSourceKind(opt.kind)}
                className={cn(
                  "group relative flex h-full w-full flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
                  selected
                    ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                    : opt.comingSoon
                      ? "border-dashed border-border bg-muted/20 hover:border-primary/30"
                      : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex items-center gap-1.5 text-sm font-medium leading-tight text-foreground">
                  {opt.label}
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {opt.helper}
                </span>
                {opt.comingSoon && (
                  <ComingSoonBadge className="mt-0.5" />
                )}
              </button>
            );
            // Coming-soon tiles explain themselves in a tooltip on hover.
            return opt.comingSoon ? (
              <Tooltip key={opt.kind}>
                <TooltipTrigger asChild>{tile}</TooltipTrigger>
                <TooltipContent>{opt.helper}</TooltipContent>
              </Tooltip>
            ) : (
              tile
            );
          })}
        </div>

        {/* Matching input control for the selected source. */}
        <div className="pt-0.5">
          {activeSource.control === "text" ? (
            <ProTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={activeSource.placeholder}
              rows={sourceKind === "topic" ? 3 : 7}
              dir={isRtl ? "rtl" : undefined}
              autoGrow
              minHeight={sourceKind === "topic" ? 84 : 168}
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
            // Coming-soon source — placeholder panel where the real control lands.
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <activeSource.icon className="h-4.5 w-4.5" />
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {activeSource.label}
                  <ComingSoonBadge />
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeSource.helper} Pick a wired source above to generate now.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 2. PROCESSING ─────────────────────────────────────────────── */}
      {/* Two pipeline layers, both display-only. Pre-script sits between the
          source and the script; post-script between the script and the audio. */}
      <section className="space-y-2.5">
        <Label className={cn(SECTION_LABEL, "flex items-center gap-2")}>
          <Workflow className="h-3.5 w-3.5" />
          Processing
          <ComingSoonBadge />
        </Label>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <ProcessingLayer
            title="Pre-script processing"
            caption="Source"
            target="Script"
            options={PRE_SCRIPT_PROCESSING_OPTIONS}
          />
          <ProcessingLayer
            title="Post-script processing"
            caption="Script"
            target="Audio"
            options={POST_SCRIPT_PROCESSING_OPTIONS}
          />
        </div>
      </section>

      {/* ── 3. LANGUAGE ───────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <Label className={cn(SECTION_LABEL, "flex items-center gap-2")}>
          <Languages className="h-3.5 w-3.5" />
          Language
        </Label>
        <Select
          value={language}
          onValueChange={(v) => setLanguage(v as PodcastLanguageCode)}
        >
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGE_OPTIONS.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="flex w-full items-center gap-2">
                  <span>{lang.label}</span>
                  <span
                    className="text-xs text-muted-foreground"
                    dir={lang.rtl ? "rtl" : undefined}
                  >
                    {lang.native}
                  </span>
                  {!lang.enabled && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      Soon
                    </Badge>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          English is live today. Other languages preview Gemini&apos;s 24
          supported voices — wiring lands soon.
        </p>
      </section>

      {/* ── 4. FORMAT ─────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <Label className={SECTION_LABEL}>Format</Label>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={!opt.enabled}
                onClick={() => opt.enabled && setFormat(opt.value)}
                className={cn(
                  "relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                  selected
                    ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                    : opt.enabled
                      ? "border-border bg-card hover:border-primary/30 hover:bg-accent/40"
                      : "cursor-not-allowed border-dashed border-border bg-muted/20",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    selected
                      ? "text-primary"
                      : opt.enabled
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60",
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium",
                    opt.enabled ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {opt.helper}
                </span>
                {!opt.enabled && <ComingSoonBadge className="mt-0.5" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 5. HOSTS ──────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <Label className={cn(SECTION_LABEL, "flex items-center gap-2")}>
          <Users className="h-3.5 w-3.5" />
          Hosts
        </Label>
        <div className="grid grid-cols-4 gap-2.5">
          {HOST_COUNT_OPTIONS.map((opt) => {
            const selected = hostCount === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={!opt.enabled}
                onClick={() => opt.enabled && setHostCount(opt.value)}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all",
                  selected
                    ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                    : opt.enabled
                      ? "border-border bg-card hover:border-primary/30 hover:bg-accent/40"
                      : "cursor-not-allowed border-dashed border-border bg-muted/20",
                )}
              >
                <span
                  className={cn(
                    "text-base font-semibold",
                    opt.enabled ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {opt.label}
                </span>
                {opt.helper && (
                  <span className="text-[11px] text-muted-foreground">
                    {opt.helper}
                  </span>
                )}
                {!opt.enabled && <ComingSoonBadge className="mt-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Advanced hosts — per-host name / gender / voice, all display-only. */}
        <Collapsible
          open={advancedHostsOpen}
          onOpenChange={setAdvancedHostsOpen}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <span className="flex items-center gap-1.5">
              <UserCog className="h-3.5 w-3.5" />
              Advanced hosts
              <ComingSoonBadge />
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                advancedHostsOpen && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2.5 pt-3">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="grid gap-2.5 rounded-xl border border-dashed border-border bg-muted/20 p-3 sm:grid-cols-3"
              >
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Host {n} name
                  </Label>
                  <Input disabled placeholder="e.g. Alex" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Gender
                  </Label>
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Voice
                  </Label>
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </section>

      {/* ── 6. SHOW PICKER ────────────────────────────────────────────── */}
      <ShowPicker
        shows={shows}
        value={showId}
        onChange={setShowId}
        onShowCreated={onShowCreated}
      />

      {/* ── 7. ADVANCED ───────────────────────────────────────────────── */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Advanced options
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Extra instruction to the research / extraction agent
            </Label>
            <ProTextarea
              value={prepMessage}
              onChange={(e) => setPrepMessage(e.target.value)}
              placeholder="Optional — e.g. focus on the practical takeaways"
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

          {/* Test mode — hidden in Advanced (defaults ON for fast, cheap runs). */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
              <FlaskConical className="h-4.5 w-4.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="truncate-toggle"
                  className="text-sm font-medium text-foreground"
                >
                  Test mode — short audio
                </Label>
                <Switch
                  id="truncate-toggle"
                  checked={truncate}
                  onCheckedChange={setTruncate}
                />
              </div>
              <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                Trims audio to ~one line per host so runs stay fast and cheap.
                Script, cover art and videos are always full quality. Turn off
                for a full-length episode.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Generate */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="gap-2 shadow-md"
        >
          <AudioLines className="h-4.5 w-4.5" />
          Generate episode
        </Button>
      </div>
    </div>
  );
}

// A single display-only processing layer: a dashed card showing the stage it
// sits between and the (disabled) options it will eventually offer.
function ProcessingLayer({
  title,
  caption,
  target,
  options,
}: {
  title: string;
  caption: string;
  target: string;
  options: { value: string; label: string; helper: string }[];
}) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/20 p-3">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">{caption}</span>
          <ArrowRight className="h-3 w-3" />
          <span className="rounded bg-muted px-1.5 py-0.5">{target}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Tooltip key={o.value}>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="cursor-not-allowed border-dashed text-[11px] font-normal text-muted-foreground"
              >
                {o.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{o.helper}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
