"use client";

// app/(core)/podcast/studio/create-d/_components/ConsoleRail.tsx
//
// The "production console" — every generation setting in one compact card,
// styled like a mixing-desk strip. Inline segmented chips for the choices a user
// changes often (format, hosts, length); popovers for the long lists (language,
// show). Keeps the composer's hero editor uncluttered while making every option
// fully real and one tap away.

import { useState } from "react";
import {
  Languages,
  Users,
  AudioWaveform,
  Clock,
  Library,
  Check,
  ChevronDown,
  Plus,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";
import type { LanguageOption } from "@/features/podcasts/generator/constants";
import { FORMAT_TILES, HOST_TILES, languageLabel } from "./options";
import type { MockShow } from "../_mock/shows";

interface ConsoleRailProps {
  language: PodcastLanguageCode;
  onLanguage: (v: PodcastLanguageCode) => void;
  format: PodcastFormat;
  onFormat: (v: PodcastFormat) => void;
  hosts: string;
  onHosts: (v: string) => void;
  showId: string | null;
  onShow: (v: string | null) => void;
  shows: MockShow[];
  fullLength: boolean;
  onFullLength: (v: boolean) => void;
  languages: LanguageOption[];
}

const ROW =
  "flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0";
const LABEL =
  "flex w-28 shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground";

export function ConsoleRail(props: ConsoleRailProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Format */}
      <div className={ROW}>
        <span className={LABEL}>
          <AudioWaveform className="h-4 w-4" />
          Format
        </span>
        <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 scrollbar-hide">
          {FORMAT_TILES.map((f) => {
            const Icon = f.icon;
            const on = props.format === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => props.onFormat(f.value)}
                title={f.blurb}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                  on
                    ? "border-primary/50 bg-primary/10 font-medium text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hosts */}
      <div className={ROW}>
        <span className={LABEL}>
          <Users className="h-4 w-4" />
          Hosts
        </span>
        <div className="flex flex-1 gap-1.5">
          {HOST_TILES.map((h) => {
            const on = props.hosts === h.value;
            return (
              <button
                key={h.value}
                type="button"
                onClick={() => props.onHosts(h.value)}
                className={cn(
                  "flex flex-1 flex-col items-center rounded-lg border py-1.5 transition-colors",
                  on
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-sm font-semibold leading-tight">
                  {h.label}
                </span>
                <span className="text-[10px] leading-tight opacity-70">
                  {h.n === 4 ? "4–20" : h.n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Language */}
      <div className={ROW}>
        <span className={LABEL}>
          <Languages className="h-4 w-4" />
          Language
        </span>
        <LanguagePicker
          value={props.language}
          languages={props.languages}
          onChange={props.onLanguage}
        />
      </div>

      {/* Show */}
      <div className={ROW}>
        <span className={LABEL}>
          <Library className="h-4 w-4" />
          Show
        </span>
        <ShowPicker
          value={props.showId}
          shows={props.shows}
          onChange={props.onShow}
        />
      </div>

      {/* Length */}
      <div className={ROW}>
        <span className={LABEL}>
          <Clock className="h-4 w-4" />
          Length
        </span>
        <div className="flex flex-1 gap-1.5">
          {[
            { v: false, label: "Preview", sub: "Fast · short audio" },
            { v: true, label: "Full episode", sub: "Complete runtime" },
          ].map((o) => {
            const on = props.fullLength === o.v;
            return (
              <button
                key={o.label}
                type="button"
                onClick={() => props.onFullLength(o.v)}
                className={cn(
                  "flex flex-1 flex-col items-start rounded-lg border px-3 py-1.5 text-left transition-colors",
                  on
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="text-sm font-medium leading-tight">
                  {o.label}
                </span>
                <span className="text-[10px] leading-tight opacity-70">
                  {o.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LanguagePicker({
  value,
  languages,
  onChange,
}: {
  value: PodcastLanguageCode;
  languages: LanguageOption[];
  onChange: (v: PodcastLanguageCode) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex flex-1 items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/30"
        >
          {languageLabel(value)}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <ScrollArea className="max-h-72">
          <div className="p-1">
            {languages.map((l) => {
              const on = l.code === value;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    onChange(l.code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                    on
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent",
                  )}
                >
                  <span className="font-medium">{l.label}</span>
                  <span
                    className="text-xs text-muted-foreground"
                    dir={l.rtl ? "rtl" : undefined}
                  >
                    {l.native}
                  </span>
                  {l.enabled ? (
                    <Badge
                      variant="secondary"
                      className="ml-auto bg-success/15 text-[10px] text-success"
                    >
                      Live
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      Beta
                    </Badge>
                  )}
                  {on && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function ShowPicker({
  value,
  shows,
  onChange,
}: {
  value: string | null;
  shows: MockShow[];
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = shows.find((s) => s.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex flex-1 items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-primary/30"
        >
          <span className={current ? "text-foreground" : "text-muted-foreground"}>
            {current ? current.title : "Standalone episode"}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start">
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent",
            value === null ? "text-primary" : "text-foreground",
          )}
        >
          Standalone episode
          {value === null && <Check className="h-4 w-4" />}
        </button>
        <div className="my-1 h-px bg-border" />
        {shows.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onChange(s.id);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent",
              value === s.id ? "text-primary" : "text-foreground",
            )}
          >
            {s.title}
            {value === s.id && <Check className="h-4 w-4" />}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          New show…
        </button>
      </PopoverContent>
    </Popover>
  );
}
