"use client";

// app/(core)/podcast/studio/create-reimagine/_components/SettingsTray.tsx
//
// The inline "everything-at-a-glance" settings tray for the reimagined composer.
// Instead of the original form's seven stacked scrolling sections, the studio's
// configuration collapses into a single row of glanceable PILLS. Each pill shows
// its current value; clicking opens a focused popover to change just that axis.
// Defaults are sensible (Educational · English · 2 hosts) so a first-timer never
// has to touch this — they just describe the episode and hit Generate.
//
// 100% real wiring: every control reads the shared generator constants and writes
// the same fields the original GeneratorForm sends. Coming-soon options render as
// disabled with a "Soon" chip — visible, honest, never a fake button.

import {
  Languages,
  Users,
  Check,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LANGUAGE_OPTIONS,
  FORMAT_OPTIONS,
  HOST_COUNT_OPTIONS,
} from "@/features/podcasts/generator/constants";
import type {
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";

interface SettingsTrayProps {
  language: PodcastLanguageCode;
  onLanguage: (v: PodcastLanguageCode) => void;
  format: PodcastFormat;
  onFormat: (v: PodcastFormat) => void;
  hostCount: string;
  onHostCount: (v: string) => void;
}

function Pill({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
          aria-label={`${label}: ${value}`}
        >
          <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <span className="font-medium text-foreground">{value}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function OptionRow({
  active,
  enabled,
  onClick,
  children,
}: {
  active: boolean;
  enabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : enabled
            ? "text-foreground hover:bg-accent/60"
            : "cursor-not-allowed text-muted-foreground/60",
      )}
    >
      {children}
      {active && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

export function SettingsTray({
  language,
  onLanguage,
  format,
  onFormat,
  hostCount,
  onHostCount,
}: SettingsTrayProps) {
  const fmt = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const lang = LANGUAGE_OPTIONS.find((l) => l.code === language)!;
  const hosts = HOST_COUNT_OPTIONS.find((h) => h.value === hostCount)!;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Format */}
      <Pill icon={fmt.icon} label="Format" value={fmt.label}>
        <div className="max-h-72 overflow-y-auto">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <OptionRow
                key={opt.value}
                active={format === opt.value}
                enabled={opt.enabled}
                onClick={() => opt.enabled && onFormat(opt.value)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {opt.helper}
                  </span>
                </span>
                {!opt.enabled && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    Soon
                  </Badge>
                )}
              </OptionRow>
            );
          })}
        </div>
      </Pill>

      {/* Language */}
      <Pill icon={Languages} label="Language" value={lang.label}>
        <div className="max-h-72 overflow-y-auto">
          {LANGUAGE_OPTIONS.map((opt) => (
            <OptionRow
              key={opt.code}
              active={language === opt.code}
              enabled={opt.enabled}
              onClick={() => opt.enabled && onLanguage(opt.code)}
            >
              <span className="font-medium">{opt.label}</span>
              <span
                className="text-xs text-muted-foreground"
                dir={opt.rtl ? "rtl" : undefined}
              >
                {opt.native}
              </span>
              {!opt.enabled && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  Soon
                </Badge>
              )}
            </OptionRow>
          ))}
        </div>
      </Pill>

      {/* Hosts */}
      <Pill icon={Users} label="Hosts" value={hosts.label}>
        <div>
          {HOST_COUNT_OPTIONS.map((opt) => (
            <OptionRow
              key={opt.value}
              active={hostCount === opt.value}
              enabled={opt.enabled}
              onClick={() => opt.enabled && onHostCount(opt.value)}
            >
              <span className="font-semibold tabular-nums">{opt.label}</span>
              {opt.helper && (
                <span className="text-[11px] text-muted-foreground">
                  {opt.helper}
                </span>
              )}
              {!opt.enabled && (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  Soon
                </Badge>
              )}
            </OptionRow>
          ))}
        </div>
      </Pill>
    </div>
  );
}
