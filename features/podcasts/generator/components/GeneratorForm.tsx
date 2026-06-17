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
//   1. Source        ("What's your source?")  — every tile is functional:
//        topic / rough notes / full script → text; file → URLs;
//        website / note / YouTube / audio file → SourceResolverPanel resolves
//        external content into editable text that's sent as input_data.
//   2. Processing     (pre-script · post-script — both ComingSoon)
//   3. Language       (Gemini 2.5 TTS locales — English + Persian live, rest Soon)
//   4. Format         (all wired via the multihost script agent) + theme
//   5. Hosts          (1–20 wired + optional per-host names & voices)
//   6. Show picker
//   7. Advanced       (extra instruction, show blurb, Test mode)
//
// Request fields sent: input_data / file_urls, input_data_type, podcast_type
// (derived from Language + Format), language, format, theme, host_count,
// speakers (only when customized), post_prep_option, show_id,
// prep_user_message, first_show_info_text, truncate_audio_for_testing.

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
  Images,
  Clapperboard,
  type LucideIcon,
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
import { SourceResolverPanel } from "./SourceResolverPanel";
import {
  SOURCE_OPTIONS,
  LANGUAGE_OPTIONS,
  DEFAULT_LANGUAGE,
  isRtlLanguage,
  deriveBackendPodcastType,
  FORMAT_OPTIONS,
  HOST_COUNT_OPTIONS,
  HOST_COUNT_DEFAULT,
  MAX_HOST_COUNT,
  PRE_SCRIPT_PROCESSING_OPTIONS,
  POST_SCRIPT_PROCESSING_OPTIONS,
} from "../constants";
import { buildCast, type SpeakerDraft } from "../voices";
import { SpeakerCastEditor } from "./SpeakerCastEditor";
import type {
  PodcastGenerateRequest,
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
} from "../types";
import type { PcShow } from "@/features/podcasts/types";
import { DictionaryIndicatorButton } from "@/features/dictionary/components/DictionaryIndicatorButton";
import { useDictionaryContext } from "@/features/dictionary/hooks/useDictionaryContext";

/** Surface key the podcast studio persists its dictionary selection under. */
const PODCAST_DICTIONARY_SURFACE = "matrx-user/podcast-studio";

interface GeneratorFormProps {
  shows: PcShow[];
  onShowCreated: (show: PcShow) => void;
  onGenerate: (body: PodcastGenerateRequest) => void;
  busy: boolean;
}

const SECTION_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/** Per-media-type generation limit. `all` = full set, `one` = a single asset,
 *  `skip` = none. Maps to the backend's `max_images` / `max_videos` integer cap. */
type MediaLimitMode = "all" | "one" | "skip";

const MEDIA_LIMIT_MODES: { value: MediaLimitMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "one", label: "One" },
  { value: "skip", label: "Skip" },
];

/** Map a media-limit mode to the server cap. `all` returns undefined so the
 *  field is omitted and the server keeps its full default count. */
function mediaModeToCap(mode: MediaLimitMode): number | undefined {
  if (mode === "one") return 1;
  if (mode === "skip") return 0;
  return undefined;
}

/** One labelled row with an All · One · Skip segmented control. */
function MediaLimitField({
  icon: Icon,
  label,
  help,
  value,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  help: string;
  value: MediaLimitMode;
  onChange: (next: MediaLimitMode) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <p className="text-xs text-muted-foreground">{help}</p>
        </div>
      </div>
      <div
        role="group"
        aria-label={`${label} count`}
        className="flex shrink-0 overflow-hidden rounded-lg border border-border"
      >
        {MEDIA_LIMIT_MODES.map((m, i) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={value === m.value}
            onClick={() => onChange(m.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              i > 0 && "border-l border-border",
              value === m.value
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent/40",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GeneratorForm({
  shows,
  onShowCreated,
  onGenerate,
  busy,
}: GeneratorFormProps) {
  const [sourceKind, setSourceKind] = useState<PodcastSourceKind>("topic");
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);
  /** Editable text resolved from a `resolve` source (website/note/YouTube/audio). */
  const [resolvedText, setResolvedText] = useState("");
  /** True while a resolve source is fetching/cleaning — blocks Generate. */
  const [resolverBusy, setResolverBusy] = useState(false);
  const [language, setLanguage] = useState<PodcastLanguageCode>(DEFAULT_LANGUAGE);
  const [format, setFormat] = useState<PodcastFormat>("educational");
  const [theme, setTheme] = useState("");
  const [hostCount, setHostCount] = useState(HOST_COUNT_DEFAULT);
  /** Per-host drafts (name / gender / voice). Untouched fields fall back to the
   *  matching default cast — the request ALWAYS sends a complete, explicit cast. */
  const [speakerDrafts, setSpeakerDrafts] = useState<
    Record<number, SpeakerDraft>
  >({});
  const [showId, setShowId] = useState<string | null>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedHostsOpen, setAdvancedHostsOpen] = useState(false);
  // Custom Dictionary for this run (selection persists per-user for the podcast surface).
  const { consumption: dictConsumption } = useDictionaryContext(PODCAST_DICTIONARY_SURFACE);
  const [truncate, setTruncate] = useState(true);
  /** Per-run image/video caps — default to the full set; the user dials them
   *  down to One or Skip for fast, cheap test runs. */
  const [imageMode, setImageMode] = useState<MediaLimitMode>("all");
  const [videoMode, setVideoMode] = useState<MediaLimitMode>("all");
  const [prepMessage, setPrepMessage] = useState("");
  const [firstShowInfo, setFirstShowInfo] = useState("");

  const activeSource = SOURCE_OPTIONS.find((o) => o.kind === sourceKind)!;
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  const isRtl = isRtlLanguage(language);

  const canGenerate =
    !busy &&
    !resolverBusy &&
    !!activeSource.inputDataType &&
    (activeSource.control === "urls"
      ? cleanUrls.length > 0
      : activeSource.control === "resolve"
        ? resolvedText.trim().length > 0
        : text.trim().length > 0);

  const handleGenerate = () => {
    if (!canGenerate || !activeSource.inputDataType) return;
    const body: PodcastGenerateRequest = {
      input_data_type: activeSource.inputDataType,
      podcast_type: deriveBackendPodcastType(language, format),
      language,
      format,
      host_count: hostCount,
      truncate_audio_for_testing: truncate,
      post_prep_option: "none",
      show_id: showId,
    };
    if (theme.trim()) body.theme = theme.trim();
    // The studio ALWAYS sends a complete, explicit cast — name + gender + voice
    // for every host — filled from the user's choices or the matching
    // server-mirrored defaults. The server honors pinned voices/genders and
    // fills any gaps from its own palette.
    body.speakers = buildCast(hostCount, speakerDrafts);
    if (activeSource.control === "urls") {
      body.file_urls = cleanUrls;
    } else if (activeSource.control === "resolve") {
      body.input_data = resolvedText.trim();
    } else {
      body.input_data = text.trim();
    }
    if (prepMessage.trim()) body.prep_user_message = prepMessage.trim();
    if (firstShowInfo.trim()) body.first_show_info_text = firstShowInfo.trim();
    // Media caps ride along only when the user limited them — `all` keeps the
    // server's full default count.
    const maxImages = mediaModeToCap(imageMode);
    if (maxImages !== undefined) body.max_images = maxImages;
    const maxVideos = mediaModeToCap(videoMode);
    if (maxVideos !== undefined) body.max_videos = maxVideos;
    // Attach the resolved dictionary so script + audio agents spell/pronounce
    // terms correctly. Only when there's something to apply.
    const dictEntries = dictConsumption?.resolved.entries ?? [];
    if (dictEntries.length > 0) {
      body.dictionary = {
        entries: dictEntries.map((e) => ({
          term: e.term,
          sounds_like: e.sounds_like,
          pronunciation: e.pronunciation,
          ipa: e.ipa,
          definition: e.definition,
          category: e.category,
        })),
        max_inline_chars: dictConsumption?.resolved.effective_max_inline_chars ?? null,
        source_count: dictConsumption?.resolved.source_count ?? 0,
      };
    }
    onGenerate(body);
  };

  /** Switch source — clear the per-source text so stale content never leaks. */
  const handleSourceChange = (kind: PodcastSourceKind) => {
    setSourceKind(kind);
    setResolvedText("");
    setResolverBusy(false);
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
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() => handleSourceChange(opt.kind)}
                className={cn(
                  "group relative flex h-full w-full flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
                  selected
                    ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
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
              </button>
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
          ) : activeSource.control === "resolve" && activeSource.resolveKind ? (
            <SourceResolverPanel
              resolveKind={activeSource.resolveKind}
              value={resolvedText}
              onChange={setResolvedText}
              rtl={isRtl}
              onBusyChange={setResolverBusy}
            />
          ) : null}
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
          English and Persian are live today. Other languages preview
          Gemini&apos;s 24 supported voices — wiring lands soon.
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
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Theme / framing (optional)
          </Label>
          <Input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder={'e.g. "skeptic vs optimist" or "keep it beginner-friendly"'}
          />
        </div>
      </section>

      {/* ── 5. HOSTS ──────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <Label className={cn(SECTION_LABEL, "flex items-center gap-2")}>
          <Users className="h-3.5 w-3.5" />
          Hosts
        </Label>
        <div className="grid grid-cols-5 gap-2.5">
          {HOST_COUNT_OPTIONS.map((opt) => {
            const isLarge = opt.value === "5+";
            const selected = isLarge
              ? hostCount >= 5
              : hostCount === Number(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setHostCount(isLarge ? Math.max(hostCount, 5) : Number(opt.value))}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all",
                  selected
                    ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
                )}
              >
                <span className="text-base font-semibold text-foreground">
                  {isLarge && hostCount >= 5 ? hostCount : opt.label}
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
        {hostCount >= 5 && (
          <div className="flex items-center gap-2.5">
            <Label className="text-xs text-muted-foreground">Exact count</Label>
            <Select
              value={String(hostCount)}
              onValueChange={(v) => setHostCount(Number(v))}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: MAX_HOST_COUNT - 4 }, (_, i) => i + 5).map(
                  (n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">
              Large casts run a moderated roundtable format.
            </span>
          </div>
        )}

        {/* Advanced hosts — optional per-host name + voice. Anything left on
            auto gets the server's defaults; everything here is optional. */}
        <Collapsible
          open={advancedHostsOpen}
          onOpenChange={setAdvancedHostsOpen}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <span className="flex items-center gap-1.5">
              <UserCog className="h-3.5 w-3.5" />
              Host names, genders &amp; voices
              <span className="text-[11px] font-normal text-muted-foreground">
                optional
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                advancedHostsOpen && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <SpeakerCastEditor
              hostCount={hostCount}
              drafts={speakerDrafts}
              onChange={(i, patch) =>
                setSpeakerDrafts((d) => ({ ...d, [i]: { ...d[i], ...patch } }))
              }
            />
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
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">Dictionary</Label>
              <p className="text-[11px] text-muted-foreground">
                Apply your terminology &amp; pronunciation so names are spelled and spoken correctly.
              </p>
            </div>
            <DictionaryIndicatorButton surfaceKey={PODCAST_DICTIONARY_SURFACE} variant="labeled" />
          </div>
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
                Use the controls below to also limit images and videos. Turn off
                for a full-length episode.
              </p>
            </div>
          </div>

          {/* Media output — cap or skip the (expensive) image/video fan-out so a
              test run is fast and cheap without touching audio or the script. */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3.5">
            <div>
              <Label className="text-sm font-medium text-foreground">
                Images &amp; videos
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Limit or skip media generation for faster, cheaper test runs.
              </p>
            </div>
            <MediaLimitField
              icon={Images}
              label="Images"
              help="Cover art & scene stills"
              value={imageMode}
              onChange={setImageMode}
            />
            <MediaLimitField
              icon={Clapperboard}
              label="Videos"
              help="Generated motion clips"
              value={videoMode}
              onChange={setVideoMode}
            />
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
