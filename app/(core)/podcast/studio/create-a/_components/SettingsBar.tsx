"use client";

// app/(core)/podcast/studio/create-a/_components/SettingsBar.tsx
//
// The settings bar — one tidy row of pills (Language · Format · Hosts · Show).
// Each pill shows the current value and opens a popover with the FULL option
// set. This is how all the secondary axes stay reachable without flooding the
// page: grouped by meaning, one tap deep. Every option is first-class — no
// disabled rows, no "soon" chips.

import { useState } from "react";
import {
  Languages,
  LayoutTemplate,
  Users,
  Mic,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { MOCK_SHOWS } from "../_mock/shows";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent";

interface SettingsBarProps {
  language: PodcastLanguageCode;
  onLanguage: (v: PodcastLanguageCode) => void;
  format: PodcastFormat;
  onFormat: (v: PodcastFormat) => void;
  hostCount: string;
  onHostCount: (v: string) => void;
  showId: string | null;
  onShow: (v: string | null) => void;
}

export function SettingsBar({
  language,
  onLanguage,
  format,
  onFormat,
  hostCount,
  onHostCount,
  showId,
  onShow,
}: SettingsBarProps) {
  const lang = LANGUAGE_OPTIONS.find((l) => l.code === language)!;
  const fmt = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const hosts = HOST_COUNT_OPTIONS.find((h) => h.value === hostCount)!;
  const show = MOCK_SHOWS.find((s) => s.id === showId);
  const FmtIcon = fmt.icon;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Language */}
      <PillPopover
        trigger={
          <>
            <Languages className="h-3.5 w-3.5 text-muted-foreground" />
            {lang.label}
          </>
        }
        title="Language"
        align="start"
        wide
      >
        {(close) => (
          <div className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin">
            {LANGUAGE_OPTIONS.map((l) => (
              <OptionRow
                key={l.code}
                selected={l.code === language}
                onClick={() => {
                  onLanguage(l.code);
                  close();
                }}
              >
                <span className="text-sm text-foreground">{l.label}</span>
                <span
                  className="text-xs text-muted-foreground"
                  dir={l.rtl ? "rtl" : undefined}
                >
                  {l.native}
                </span>
              </OptionRow>
            ))}
          </div>
        )}
      </PillPopover>

      {/* Format */}
      <PillPopover
        trigger={
          <>
            <FmtIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {fmt.label}
          </>
        }
        title="Format"
      >
        {(close) => (
          <div className="space-y-0.5">
            {FORMAT_OPTIONS.map((f) => {
              const Icon = f.icon;
              return (
                <OptionRow
                  key={f.value}
                  selected={f.value === format}
                  onClick={() => {
                    onFormat(f.value);
                    close();
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">
                      {f.label}
                    </span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      {f.helper}
                    </span>
                  </span>
                </OptionRow>
              );
            })}
          </div>
        )}
      </PillPopover>

      {/* Hosts */}
      <PillPopover
        trigger={
          <>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {hosts.value === "4-20" ? "4–20 hosts" : `${hosts.value} ${Number(hosts.value) === 1 ? "host" : "hosts"}`}
          </>
        }
        title="Hosts"
      >
        {(close) => (
          <div className="space-y-0.5">
            {HOST_COUNT_OPTIONS.map((h) => (
              <OptionRow
                key={h.value}
                selected={h.value === hostCount}
                onClick={() => {
                  onHostCount(h.value);
                  close();
                }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground">
                  {h.label}
                </span>
                <span className="text-sm text-foreground">
                  {h.helper ?? `${h.label} hosts`}
                </span>
              </OptionRow>
            ))}
          </div>
        )}
      </PillPopover>

      {/* Show assignment */}
      <PillPopover
        trigger={
          <>
            <Mic className="h-3.5 w-3.5 text-muted-foreground" />
            {show ? show.title : "Matrx Mix"}
          </>
        }
        title="Add to show"
      >
        {(close) => (
          <div className="space-y-0.5">
            <OptionRow
              selected={showId === null}
              onClick={() => {
                onShow(null);
                close();
              }}
            >
              <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm text-foreground">Matrx Mix (default)</span>
            </OptionRow>
            {MOCK_SHOWS.map((s) => (
              <OptionRow
                key={s.id}
                selected={s.id === showId}
                onClick={() => {
                  onShow(s.id);
                  close();
                }}
              >
                <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-foreground">{s.title}</span>
              </OptionRow>
            ))}
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border px-2 py-2 text-sm text-primary transition-colors hover:bg-accent"
              onClick={close}
            >
              <Plus className="h-4 w-4" />
              New show
            </button>
          </div>
        )}
      </PillPopover>
    </div>
  );
}

/** A pill trigger wrapping a popover whose body controls its own close. */
function PillPopover({
  trigger,
  title,
  children,
  align = "start",
  wide = false,
}: {
  trigger: React.ReactNode;
  title: string;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "center" | "end";
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={PILL}>
          {trigger}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("p-1.5", wide ? "w-64" : "w-60")}
      >
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

function OptionRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
        selected ? "bg-primary/10" : "hover:bg-accent",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  );
}
