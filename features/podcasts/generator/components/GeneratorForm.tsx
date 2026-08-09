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
//   2. Processing     (pre-script WIRED → post_prep_option; post-script ComingSoon)
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
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createPodcastStudioScope } from "@/features/surfaces/manifests/podcast-studio.manifest";
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
import {
  DEFAULT_FEATURE_IMAGE_STYLE,
  FEATURE_IMAGE_STYLES,
  toFeatureImageStyle,
  type FeatureImageStyleValue,
} from "../featureImageStyles";
import { SourceResolverPanel } from "./SourceResolverPanel";
import { TopicIdeaHelper } from "./TopicIdeaHelper";
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
import {
  buildCast,
  voicesForProvider,
  type SpeakerDraft,
} from "../voices";
import { useVoices } from "../useVoices";
import { usePodcastCastPreview } from "../usePodcastCastPreview";
import { SpeakerCastEditor, GENDER_OPTIONS } from "./SpeakerCastEditor";
import type {
  PodcastGenerateRequest,
  PodcastPostPrepOption,
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
  PodcastSpeakerGender,
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
  initialTopic?: string;
  initialFormat?: PodcastFormat;
  initialAgentLabel?: string;
  /** Free-text request carried from an entryway composer → seeds prep_user_message. */
  initialInstructions?: string;
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
  initialTopic = "",
  initialFormat = "educational",
  initialAgentLabel,
  initialInstructions,
}: GeneratorFormProps) {
  const [sourceKind, setSourceKind] = useState<PodcastSourceKind>("topic");
  const [text, setText] = useState(initialTopic);
  const [urls, setUrls] = useState<string[]>([""]);
  /** Editable text resolved from a `resolve` source (website/note/YouTube/audio). */
  const [resolvedText, setResolvedText] = useState("");
  /** True while a resolve source is fetching/cleaning — blocks Generate. */
  const [resolverBusy, setResolverBusy] = useState(false);
  const [language, setLanguage] = useState<PodcastLanguageCode>(DEFAULT_LANGUAGE);
  const [format, setFormat] = useState<PodcastFormat>(initialFormat);
  const [theme, setTheme] = useState("");
  const [hostCount, setHostCount] = useState(HOST_COUNT_DEFAULT);
  /** Per-host drafts (name / gender / voice). Untouched fields fall back to the
   *  matching default cast — the request ALWAYS sends a complete, explicit cast. */
  const [speakerDrafts, setSpeakerDrafts] = useState<
    Record<number, SpeakerDraft>
  >({});
  // Live voice catalog (Supabase ai.voices) — shared one fetch, filtered to
  // the current host count's provider band for the cast editor + buildCast.
  const { voices, loading: voicesLoading, error: voicesError, reload: reloadVoices } =
    useVoices();
  const [showId, setShowId] = useState<string | null>(null);
  const castPreview = usePodcastCastPreview(hostCount, showId);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedHostsOpen, setAdvancedHostsOpen] = useState(false);
  // Custom Dictionary for this run (selection persists per-user for the podcast surface).
  const { consumption: dictConsumption } = useDictionaryContext(PODCAST_DICTIONARY_SURFACE);
  const [truncate, setTruncate] = useState(true);
  /** Per-run image/video caps — default to the full set; the user dials them
   *  down to One or Skip for fast, cheap test runs. */
  const [imageMode, setImageMode] = useState<MediaLimitMode>("all");
  const [featureImageStyle, setFeatureImageStyle] =
    useState<FeatureImageStyleValue>(DEFAULT_FEATURE_IMAGE_STYLE);
  const [videoMode, setVideoMode] = useState<MediaLimitMode>("all");
  const [prepMessage, setPrepMessage] = useState(() =>
    [
      initialInstructions?.trim(),
      initialAgentLabel
        ? `Entryway selected agent profile: ${initialAgentLabel}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  const [firstShowInfo, setFirstShowInfo] = useState("");
  // Optional prep→script transform (one at a time; "none" = pass-through).
  const [postPrep, setPostPrep] = useState<PodcastPostPrepOption>("none");
  // Optional audience re-pitch (podcast.audience_adapter, server-side; runs
  // before the transform above). Empty = skipped.
  const [targetAudience, setTargetAudience] = useState("");

  const activeSource = SOURCE_OPTIONS.find((o) => o.kind === sourceKind);
  if (!activeSource) {
    throw new Error(`Unknown podcast source kind: ${sourceKind}`);
  }
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

  /** The exact request the form would submit right now, or null when the
   *  selected source has no wired input type. Shared by Generate and the
   *  surface emitter so `generate_request` can never drift from what is sent. */
  const buildRequestBody = (): PodcastGenerateRequest | null => {
    if (!activeSource.inputDataType) return null;
    const body: PodcastGenerateRequest = {
      input_data_type: activeSource.inputDataType,
      podcast_type: deriveBackendPodcastType(language, format),
      language,
      format,
      host_count: hostCount,
      truncate_audio_for_testing: truncate,
      post_prep_option: postPrep,
      show_id: showId,
    };
    if (theme.trim()) body.theme = theme.trim();
    if (targetAudience.trim()) body.target_audience = targetAudience.trim();
    // The server owns provider routing and the exact default cast. Apply only
    // the user's edits to that preview; if preview is unavailable, send no
    // cast and let the generation server resolve it natively.
    if (castPreview.preview) {
      body.speakers = buildCast(
        hostCount,
        speakerDrafts,
        voices,
        castPreview.preview.provider,
        castPreview.preview.speakers,
      );
    }
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
    // Feature image style. Sent only when it differs from the default so the
    // server stays the single owner of that default.
    if (featureImageStyle !== DEFAULT_FEATURE_IMAGE_STYLE) {
      body.feature_image_style = featureImageStyle;
    }
    // Attach the resolved dictionary so script + audio agents spell/pronounce
    // terms correctly: `entries` is the persistent (global+user rollup) set,
    // `custom_entries` is the per-task additions (override persistent). Send
    // when either is present.
    const dictEntries = dictConsumption?.resolved.entries ?? [];
    const dictCustom = dictConsumption?.customEntries ?? [];
    if (dictEntries.length > 0 || dictCustom.length > 0) {
      const mapEntry = (e: {
        term: string;
        sounds_like?: string[] | null;
        pronunciation?: string | null;
        ipa?: string | null;
        definition?: string | null;
        category?: string | null;
      }) => ({
        term: e.term,
        sounds_like: e.sounds_like ?? [],
        pronunciation: e.pronunciation ?? null,
        ipa: e.ipa ?? null,
        definition: e.definition ?? null,
        category: e.category ?? null,
      });
      body.dictionary = {
        entries: dictEntries.map(mapEntry),
        custom_entries: dictCustom.map(mapEntry),
        max_inline_chars: dictConsumption?.resolved.effective_max_inline_chars ?? null,
        source_count: dictConsumption?.resolved.source_count ?? 0,
      };
    }
    // Saved podcast audio is the high-quality use case → request the HQ model
    // tier on every provider (the backend resolves the latest HQ model id).
    body.tts_quality = "high_quality";
    return body;
  };

  const handleGenerate = () => {
    if (!canGenerate) return;
    const body = buildRequestBody();
    if (!body) return;
    onGenerate(body);
  };

  // ── Surface emitter (matrx-user/podcast-studio) ───────────────────────
  // Built at Run time from live state. NOTE: no media URLs leave this
  // surface — resolved sources are emitted as extracted TEXT, and file
  // sources as the public URLs the user typed.
  const getSurfaceScope = () => {
    const request = buildRequestBody();
    return createPodcastStudioScope({
      source_kind: sourceKind,
      source_resolving: resolverBusy,
      language,
      format,
      host_count: hostCount,
      image_mode: imageMode,
      video_mode: videoMode,
      feature_image_style: featureImageStyle,
      truncate_audio_for_testing: truncate,
      can_generate: canGenerate,
      source_text: activeSource.control === "text" ? text || undefined : undefined,
      source_topic:
        sourceKind === "topic" ? text.trim() || undefined : undefined,
      source_urls: cleanUrls.length > 0 ? cleanUrls : undefined,
      resolved_source_text:
        activeSource.control === "resolve" ? resolvedText || undefined : undefined,
      theme: theme.trim() || undefined,
      speaker_cast: request?.speakers,
      cast_provider: castPreview.preview?.provider,
      voice_catalog_size: voices.length,
      show_id: showId ?? undefined,
      available_shows: shows.map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
      })),
      first_show_info: firstShowInfo.trim() || undefined,
      prep_instructions: prepMessage.trim() || undefined,
      dictionary_entry_count:
        (dictConsumption?.resolved.entries.length ?? 0) +
        (dictConsumption?.customEntries.length ?? 0),
      generate_request: request
        ? (request as unknown as Record<string, unknown>)
        : undefined,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  // ── Surface write handlers (manifest `writeTargets`) ──────────────────
  // The write half of the 360 loop. Every handler validates its input and
  // THROWS on a bad shape — the writeback seam turns throws into safe error
  // envelopes the agent reads and can correct. Each one stages through the
  // SAME setter the user's own typing/clicking uses, so an applied value is
  // an ordinary, editable form value. Nothing here submits: Generate spends
  // money and stays human. Fresh closures per call (getWriteHandlers contract).
  const getSurfaceWriteHandlers = () => ({
    podcast_source_text: (value: unknown) => {
      if (typeof value !== "string" || !value.trim())
        throw new Error("podcast_source_text expects a non-empty string.");
      if (activeSource.control !== "text")
        throw new Error(
          `podcast_source_text only applies to a typed-text source (topic, rough notes, full script). The selected source is "${sourceKind}" — ask the user to switch sources first.`,
        );
      setText(value);
    },
    podcast_theme: (value: unknown) => {
      if (typeof value !== "string")
        throw new Error(
          "podcast_theme expects a string (empty string clears the theme).",
        );
      setTheme(value);
    },
    podcast_format: (value: unknown) => {
      const allowed = FORMAT_OPTIONS.filter((o) => o.enabled).map(
        (o) => o.value as string,
      );
      if (typeof value !== "string" || !allowed.includes(value))
        throw new Error(
          `podcast_format expects one of: ${allowed.join(" | ")}.`,
        );
      setFormat(value as PodcastFormat);
    },
    podcast_speaker_cast: (value: unknown) => {
      const genders = GENDER_OPTIONS.map((g) => g.value as string);
      if (!Array.isArray(value) || value.length !== hostCount)
        throw new Error(
          `podcast_speaker_cast expects an array of exactly ${hostCount} entries — one per host, in turn order (host_count is ${hostCount}).`,
        );
      const entries = value.map((entry, i) => {
        if (typeof entry !== "object" || entry === null)
          throw new Error(
            `podcast_speaker_cast[${i}] expects an object of the shape {name, gender}.`,
          );
        const { name, gender } = entry as Record<string, unknown>;
        if (typeof name !== "string" || !name.trim())
          throw new Error(
            `podcast_speaker_cast[${i}].name expects a non-empty string.`,
          );
        if (typeof gender !== "string" || !genders.includes(gender))
          throw new Error(
            `podcast_speaker_cast[${i}].gender expects one of: ${genders.join(" | ")}.`,
          );
        return { name: name.trim(), gender: gender as PodcastSpeakerGender };
      });
      // Merge per slot exactly as SpeakerCastEditor's onChange does, so each
      // host's existing VOICE choice survives — the server owns voices.
      setSpeakerDrafts((d) => {
        const next = { ...d };
        entries.forEach((entry, i) => {
          next[i] = { ...next[i], name: entry.name, gender: entry.gender };
        });
        return next;
      });
    },
  });

  /** Switch source — clear the per-source text so stale content never leaks. */
  const handleSourceChange = (kind: PodcastSourceKind) => {
    setSourceKind(kind);
    setResolvedText("");
    setResolverBusy(false);
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/podcast-studio"
      getScope={getSurfaceScope}
      isEditable={false}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
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

        {/* Topic-only: agent-assisted idea picker. Fills the topic field via
            the existing setText; zero footprint for every other source. */}
        {sourceKind === "topic" && (
          <TopicIdeaHelper seedConcept={text} onPick={setText} />
        )}
      </section>

      {/* ── 2. PROCESSING ─────────────────────────────────────────────── */}
      {/* Pre-script (source → script) is WIRED: one optional transform, sent
          as post_prep_option and run by its podcast.post_prep_* agent slot.
          Post-script (script → audio) is still display-only. */}
      <section className="space-y-2.5">
        <Label className={cn(SECTION_LABEL, "flex items-center gap-2")}>
          <Workflow className="h-3.5 w-3.5" />
          Processing
        </Label>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <ProcessingLayer
            title="Pre-script processing"
            caption="Source"
            target="Script"
            options={PRE_SCRIPT_PROCESSING_OPTIONS}
            value={postPrep === "none" ? null : postPrep}
            onChange={(v) =>
              setPostPrep(v === null ? "none" : (v as PodcastPostPrepOption))
            }
          />
          <ProcessingLayer
            title="Post-script processing"
            caption="Script"
            target="Audio"
            options={POST_SCRIPT_PROCESSING_OPTIONS}
          />
        </div>
        {/* Audience re-pitch (podcast.audience_adapter) — runs server-side on
            the prepared content, before the transform above, so a translation
            stays the faithful last step. Empty = stage skipped. */}
        <div className="space-y-1">
          <Label htmlFor="target-audience" className="text-xs text-muted-foreground">
            Target audience (optional) — re-pitch the content for a specific listener
          </Label>
          <Input
            id="target-audience"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder='e.g. "curious beginners", "time-pressed executives", "senior engineers"'
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
          Scripts and audio are generated natively in the language you pick.
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
              defaults={castPreview.preview?.speakers ?? []}
              voices={
                castPreview.preview
                  ? voicesForProvider(voices, castPreview.preview.provider)
                  : []
              }
              provider={castPreview.preview?.provider ?? null}
              loading={voicesLoading || castPreview.loading}
              error={castPreview.error ?? voicesError}
              onReload={() => {
                castPreview.reload();
                reloadVoices();
              }}
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

          {/* Feature image — the sixth image, drawn from the finished
              transcript rather than the up-front metadata blurbs. Sits with the
              creative controls, NOT with the media limits below (those are
              explicitly framed as test/cost controls). */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Feature image style
            </Label>
            <Select
              value={featureImageStyle}
              onValueChange={(v) => setFeatureImageStyle(toFeatureImageStyle(v))}
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_IMAGE_STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {imageMode === "skip" ? (
                // The server gates the feature image on the image budget, so
                // "Skip" genuinely skips it — say so rather than promising an
                // image that will never be rendered.
                <>Skipped while Images below is set to Skip.</>
              ) : (
                <>
                  {FEATURE_IMAGE_STYLES.find(
                    (s) => s.value === featureImageStyle,
                  )?.blurb ?? ""}{" "}
                  An extra image rendered from the full transcript.
                </>
              )}
            </p>
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
    </SurfaceRuntimeProvider>
  );
}

// One processing layer. With `onChange` it is INTERACTIVE: a single-select
// option row (click again to clear → pass-through). Without it, it stays the
// dashed display-only preview of a stage that isn't wired yet.
function ProcessingLayer({
  title,
  caption,
  target,
  options,
  value,
  onChange,
}: {
  title: string;
  caption: string;
  target: string;
  options: { value: string; label: string; helper: string }[];
  value?: string | null;
  onChange?: (value: string | null) => void;
}) {
  const interactive = !!onChange;
  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border p-3",
        interactive
          ? "border-border bg-card"
          : "border-dashed border-border bg-muted/20",
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {title}
          {!interactive && <ComingSoonBadge />}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">{caption}</span>
          <ArrowRight className="h-3 w-3" />
          <span className="rounded bg-muted px-1.5 py-0.5">{target}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const selected = interactive && value === o.value;
          return (
            <Tooltip key={o.value}>
              <TooltipTrigger asChild>
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onChange(selected ? null : o.value)}
                    aria-pressed={selected}
                  >
                    <Badge
                      variant={selected ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer text-[11px] font-normal transition-colors",
                        !selected &&
                          "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {o.label}
                    </Badge>
                  </button>
                ) : (
                  <Badge
                    variant="outline"
                    className="cursor-not-allowed border-dashed text-[11px] font-normal text-muted-foreground"
                  >
                    {o.label}
                  </Badge>
                )}
              </TooltipTrigger>
              <TooltipContent>{o.helper}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
