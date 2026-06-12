"use client";

// app/(core)/podcast/studio/create-refine/_components/EpisodeSettings.tsx
//
// The "easy by default, powerful on demand" settings (brief point 3). Format,
// Language and Hosts are the everyday choices and stay visible but quiet. The
// heavier capability — processing layers, per-host config, the research steer,
// the show blurb, test mode — lives behind a single "Advanced" expander so a
// first-timer is never overwhelmed, while a power user is one click from
// everything.
//
// Reuses the wired option constants and lifts plain values up; the parent owns
// the request. Wired controls drive the real request; previewed ones carry a
// quiet ComingSoon badge.

import {
  Languages,
  Users,
  SlidersHorizontal,
  ChevronDown,
  Workflow,
  ArrowRight,
  UserCog,
  FlaskConical,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ProTextarea } from "@/components/official/ProTextarea";
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
import {
  LANGUAGE_OPTIONS,
  FORMAT_OPTIONS,
  HOST_COUNT_OPTIONS,
  PRE_SCRIPT_PROCESSING_OPTIONS,
  POST_SCRIPT_PROCESSING_OPTIONS,
} from "@/features/podcasts/generator/constants";
import type {
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";

const SECTION_LABEL =
  "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

interface EpisodeSettingsProps {
  language: PodcastLanguageCode;
  onLanguage: (v: PodcastLanguageCode) => void;
  format: PodcastFormat;
  onFormat: (v: PodcastFormat) => void;
  hostCount: string;
  onHostCount: (v: string) => void;
  advancedOpen: boolean;
  onAdvancedOpen: (v: boolean) => void;
  truncate: boolean;
  onTruncate: (v: boolean) => void;
  prepMessage: string;
  onPrepMessage: (v: string) => void;
  firstShowInfo: string;
  onFirstShowInfo: (v: string) => void;
}

export function EpisodeSettings({
  language,
  onLanguage,
  format,
  onFormat,
  hostCount,
  onHostCount,
  advancedOpen,
  onAdvancedOpen,
  truncate,
  onTruncate,
  prepMessage,
  onPrepMessage,
  firstShowInfo,
  onFirstShowInfo,
}: EpisodeSettingsProps) {
  return (
    <div className="space-y-5">
      {/* Format — the everyday choice, as compact pills. */}
      <section className="space-y-2.5">
        <Label className={SECTION_LABEL}>Format</Label>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={!opt.enabled}
                onClick={() => opt.enabled && onFormat(opt.value)}
                title={opt.helper}
                className={cn(
                  "relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all",
                  selected
                    ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                    : opt.enabled
                      ? "border-border bg-card hover:border-primary/30 hover:bg-accent/40"
                      : "cursor-not-allowed border-dashed border-border bg-muted/20",
                )}
              >
                <Icon
                  className={cn(
                    "h-4.5 w-4.5",
                    selected
                      ? "text-primary"
                      : opt.enabled
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60",
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    opt.enabled ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {opt.label}
                </span>
                {!opt.enabled && <ComingSoonBadge className="mt-0.5" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Language + Hosts — side by side, quiet. */}
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="space-y-2.5">
          <Label className={SECTION_LABEL}>
            <Languages className="h-3.5 w-3.5" />
            Language
          </Label>
          <Select
            value={language}
            onValueChange={(v) => onLanguage(v as PodcastLanguageCode)}
          >
            <SelectTrigger className="w-full">
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
        </section>

        <section className="space-y-2.5">
          <Label className={SECTION_LABEL}>
            <Users className="h-3.5 w-3.5" />
            Hosts
          </Label>
          <div className="grid grid-cols-4 gap-2">
            {HOST_COUNT_OPTIONS.map((opt) => {
              const selected = hostCount === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!opt.enabled}
                  onClick={() => opt.enabled && onHostCount(opt.value)}
                  title={opt.helper ?? undefined}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2 text-center transition-all",
                    selected
                      ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                      : opt.enabled
                        ? "border-border bg-card hover:border-primary/30 hover:bg-accent/40"
                        : "cursor-not-allowed border-dashed border-border bg-muted/20",
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      opt.enabled ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {opt.label}
                  </span>
                  {!opt.enabled && <ComingSoonBadge className="mt-0.5" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Advanced — everything powerful, one click away, never in the way. */}
      <Collapsible open={advancedOpen} onOpenChange={onAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Advanced — processing, hosts &amp; more
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 pt-4">
          {/* Processing layers (preview). */}
          <section className="space-y-2.5">
            <Label className={cn(SECTION_LABEL)}>
              <Workflow className="h-3.5 w-3.5" />
              Processing
              <ComingSoonBadge />
            </Label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <ProcessingLayer
                title="Pre-script"
                caption="Source"
                target="Script"
                options={PRE_SCRIPT_PROCESSING_OPTIONS}
              />
              <ProcessingLayer
                title="Post-script"
                caption="Script"
                target="Audio"
                options={POST_SCRIPT_PROCESSING_OPTIONS}
              />
            </div>
          </section>

          {/* Per-host config (preview). */}
          <section className="space-y-2.5">
            <Label className={SECTION_LABEL}>
              <UserCog className="h-3.5 w-3.5" />
              Host voices
              <ComingSoonBadge />
            </Label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="grid gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-3"
                >
                  <Label className="text-[11px] text-muted-foreground">
                    Host {n}
                  </Label>
                  <Input disabled placeholder={`e.g. ${n === 1 ? "Alex" : "Sarah"}`} />
                </div>
              ))}
            </div>
          </section>

          {/* Research steer + show blurb — real, wired optional text. */}
          <section className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Extra instruction to the research / extraction agent
              </Label>
              <ProTextarea
                value={prepMessage}
                onChange={(e) => onPrepMessage(e.target.value)}
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
                onChange={(e) => onFirstShowInfo(e.target.value)}
                placeholder="Optional — a short intro for the show"
                rows={2}
                showCopyButton={false}
              />
            </div>
          </section>

          {/* Test mode — wired; defaults ON for fast, cheap runs. */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
              <FlaskConical className="h-4.5 w-4.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="truncate-refine"
                  className="text-sm font-medium text-foreground"
                >
                  Test mode — short audio
                </Label>
                <Switch
                  id="truncate-refine"
                  checked={truncate}
                  onCheckedChange={onTruncate}
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
    </div>
  );
}

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
