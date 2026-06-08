"use client";

// features/podcasts/generator/components/GeneratorForm.tsx
//
// The compose surface. Collects everything for one PodcastGenerateRequest and
// hands a clean body to the orchestrator. Only the field matching the selected
// input type is sent. Truncate-audio defaults ON (test mode).

import { useState } from "react";
import {
  AudioLines,
  Plus,
  X,
  ChevronDown,
  SlidersHorizontal,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { ShowPicker } from "./ShowPicker";
import {
  INPUT_TYPE_OPTIONS,
  PODCAST_TYPE_OPTIONS,
  AUDIO_STYLE_OPTIONS,
  POST_PREP_OPTIONS,
} from "../constants";
import type {
  PodcastGenerateRequest,
  PodcastInputDataType,
  PodcastType,
  PodcastAudioStyle,
} from "../types";
import type { PcShow } from "@/features/podcasts/types";

interface GeneratorFormProps {
  shows: PcShow[];
  onShowCreated: (show: PcShow) => void;
  onGenerate: (body: PodcastGenerateRequest) => void;
  busy: boolean;
}

export function GeneratorForm({
  shows,
  onShowCreated,
  onGenerate,
  busy,
}: GeneratorFormProps) {
  const [inputType, setInputType] = useState<PodcastInputDataType>("topic");
  const [text, setText] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);
  const [podcastType, setPodcastType] = useState<PodcastType>("educational");
  const [showId, setShowId] = useState<string | null>(null);
  const [truncate, setTruncate] = useState(true);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [audioStyle, setAudioStyle] = useState<PodcastAudioStyle | "auto">("auto");
  const [postPrep, setPostPrep] = useState("none");
  const [prepMessage, setPrepMessage] = useState("");
  const [firstShowInfo, setFirstShowInfo] = useState("");

  const activeInput = INPUT_TYPE_OPTIONS.find((o) => o.value === inputType)!;
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);

  const canGenerate =
    !busy &&
    (activeInput.control === "urls"
      ? cleanUrls.length > 0
      : text.trim().length > 0);

  const handleGenerate = () => {
    if (!canGenerate) return;
    const body: PodcastGenerateRequest = {
      input_data_type: inputType,
      podcast_type: podcastType,
      truncate_audio_for_testing: truncate,
      post_prep_option: "none",
      show_id: showId,
    };
    if (activeInput.control === "urls") {
      body.file_urls = cleanUrls;
    } else {
      body.input_data = text.trim();
    }
    if (audioStyle !== "auto") body.audio_style = audioStyle;
    if (prepMessage.trim()) body.prep_user_message = prepMessage.trim();
    if (firstShowInfo.trim()) body.first_show_info_text = firstShowInfo.trim();
    onGenerate(body);
  };

  const isRtl = podcastType === "persian";

  return (
    <div className="space-y-6">
      {/* Input type — segmented tiles */}
      <div className="space-y-2.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What's your source?
        </Label>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {INPUT_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = inputType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setInputType(opt.value)}
                className={cn(
                  "group relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
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
                <span className="text-sm font-medium leading-tight text-foreground">
                  {opt.label}
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {opt.helper}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Matching input control */}
      <div className="space-y-2">
        {activeInput.control === "text" ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={activeInput.placeholder}
            rows={inputType === "topic" ? 3 : 7}
            dir={isRtl ? "rtl" : undefined}
            className="resize-y text-base"
          />
        ) : (
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
        )}
      </div>

      {/* Podcast type — segmented tiles */}
      <div className="space-y-2.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Format
        </Label>
        <div className="grid grid-cols-3 gap-2.5">
          {PODCAST_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = podcastType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPodcastType(opt.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                  selected
                    ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="text-sm font-medium text-foreground">
                  {opt.label}
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {opt.helper}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Show picker */}
      <ShowPicker
        shows={shows}
        value={showId}
        onChange={setShowId}
        onShowCreated={onShowCreated}
      />

      {/* Advanced */}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Audio style override
              </Label>
              <Select
                value={audioStyle}
                onValueChange={(v) =>
                  setAudioStyle(v as PodcastAudioStyle | "auto")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (from format)</SelectItem>
                  {AUDIO_STYLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Post-processing
              </Label>
              <Select value={postPrep} onValueChange={setPostPrep}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_PREP_OPTIONS.map((o) => (
                    <SelectItem
                      key={o.value}
                      value={o.value}
                      disabled={!o.enabled}
                    >
                      <span className="flex items-center gap-2">
                        {o.label}
                        {!o.enabled && (
                          <Badge variant="secondary" className="text-[10px]">
                            Soon
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Extra instruction to the research / extraction agent
            </Label>
            <Textarea
              value={prepMessage}
              onChange={(e) => setPrepMessage(e.target.value)}
              placeholder="Optional — e.g. focus on the practical takeaways"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Show intro / blurb
            </Label>
            <Textarea
              value={firstShowInfo}
              onChange={(e) => setFirstShowInfo(e.target.value)}
              placeholder="Optional — a short intro for the show"
              rows={2}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Truncate toggle + Generate */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
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
              Script, cover art and videos are always full quality. Turn off for
              a full-length episode.
            </p>
          </div>
        </div>
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
