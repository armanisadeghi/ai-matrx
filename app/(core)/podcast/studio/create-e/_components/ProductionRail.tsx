"use client";

// app/(core)/podcast/studio/create-e/_components/ProductionRail.tsx
//
// The production settings — rendered as a real settings LIST (the macOS / Stripe
// settings-row pattern), not floating pills. Each row shows its label + current
// value and opens a popover with the full option set. Processing pipelines and
// the advanced fields live in one quiet disclosure at the bottom. Every option
// is first-class; nothing is disabled or "soon".

import { useEffect, useRef, useState } from "react";
import {
  Languages,
  LayoutTemplate,
  Users,
  Mic,
  Workflow,
  ChevronRight,
  ChevronDown,
  Check,
  Plus,
  ArrowRight,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProTextarea } from "@/components/official/ProTextarea";
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
import { MOCK_SHOWS } from "../_mock/shows";

interface Props {
  language: PodcastLanguageCode;
  onLanguage: (v: PodcastLanguageCode) => void;
  format: PodcastFormat;
  onFormat: (v: PodcastFormat) => void;
  hostCount: string;
  onHostCount: (v: string) => void;
  showId: string | null;
  onShow: (v: string | null) => void;
  preProcessing: string[];
  onPreProcessing: (next: string[]) => void;
  postProcessing: string[];
  onPostProcessing: (next: string[]) => void;
  prepMessage: string;
  onPrepMessage: (v: string) => void;
  firstShowInfo: string;
  onFirstShowInfo: (v: string) => void;
  truncate: boolean;
  onTruncate: (v: boolean) => void;
}

export function ProductionRail({
  language,
  onLanguage,
  format,
  onFormat,
  hostCount,
  onHostCount,
  showId,
  onShow,
  preProcessing,
  onPreProcessing,
  postProcessing,
  onPostProcessing,
  prepMessage,
  onPrepMessage,
  firstShowInfo,
  onFirstShowInfo,
  truncate,
  onTruncate,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fmt = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const lang = LANGUAGE_OPTIONS.find((l) => l.code === language)!;
  const hosts = HOST_COUNT_OPTIONS.find((h) => h.value === hostCount)!;
  const show = MOCK_SHOWS.find((s) => s.id === showId);

  const toggle = (
    list: string[],
    setter: (next: string[]) => void,
    value: string,
  ) =>
    setter(
      list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    );

  const processingCount = preProcessing.length + postProcessing.length;
  const advancedCount =
    processingCount + (prepMessage.trim() ? 1 : 0) + (firstShowInfo.trim() ? 1 : 0);

  const hostLabel =
    hosts.value === "4-20"
      ? "4–20 hosts"
      : `${hosts.value} ${Number(hosts.value) === 1 ? "host" : "hosts"}`;

  return (
    <section className="mt-6">
      <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Production
      </p>

      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {/* Format */}
        <SettingPopover
          icon={LayoutTemplate}
          label="Format"
          value={fmt.label}
          title="Conversational format"
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
        </SettingPopover>

        {/* Language */}
        <SettingPopover
          icon={Languages}
          label="Language"
          value={lang.label}
          title="Language"
          contentClassName="w-64"
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
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="text-sm text-foreground">{l.label}</span>
                    <span
                      className="text-xs text-muted-foreground"
                      dir={l.rtl ? "rtl" : undefined}
                    >
                      {l.native}
                    </span>
                  </span>
                </OptionRow>
              ))}
            </div>
          )}
        </SettingPopover>

        {/* Hosts */}
        <SettingPopover
          icon={Users}
          label="Hosts"
          value={hostLabel}
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
        </SettingPopover>

        {/* Show */}
        <SettingPopover
          icon={Mic}
          label="Add to show"
          value={show ? show.title : "Matrx Mix"}
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
                <span className="text-sm text-foreground">
                  Matrx Mix (default)
                </span>
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
        </SettingPopover>
      </div>

      {/* ── Advanced disclosure: processing + steer + test mode. ───────────
          Self-managed (no hydration-gated wrapper) so the trigger is always
          visible and the section never silently disappears. */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
        >
          <span className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            Processing &amp; advanced
            {advancedCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {advancedCount}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </button>

        {advancedOpen && (
        <div className="mt-2 space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ProcessingLayer
              caption="Source"
              target="Script"
              options={PRE_SCRIPT_PROCESSING_OPTIONS}
              selected={preProcessing}
              onToggle={(v) => toggle(preProcessing, onPreProcessing, v)}
            />
            <ProcessingLayer
              caption="Script"
              target="Audio"
              options={POST_SCRIPT_PROCESSING_OPTIONS}
              selected={postProcessing}
              onToggle={(v) => toggle(postProcessing, onPostProcessing, v)}
            />
          </div>

          <div className="space-y-3 border-t border-border/70 pt-4">
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

            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500">
                <FlaskConical className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="truncate-toggle-e"
                    className="text-sm font-medium text-foreground"
                  >
                    Test mode — short audio
                  </Label>
                  <Switch
                    id="truncate-toggle-e"
                    checked={truncate}
                    onCheckedChange={onTruncate}
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Trims audio to ~one line per host so runs stay fast and cheap.
                  Script, cover art, and videos are always full quality.
                </p>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </section>
  );
}

// ── A single settings row with a self-managed dropdown. ─────────────────────
//
// Intentionally NOT built on the app's hydration-gated <Popover> wrapper (which
// returns null until mounted and can leave the whole row invisible if the mount
// effect is delayed). Here the row button is always rendered; the dropdown is a
// plain absolutely-positioned panel with click-outside + Escape to close. The
// setting can never silently disappear.

function SettingPopover({
  icon: Icon,
  label,
  value,
  title,
  children,
  contentClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  title: string;
  children: (close: () => void) => React.ReactNode;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/50"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="ml-auto flex items-center gap-1.5 truncate text-sm text-muted-foreground">
          <span className="truncate">{value}</span>
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 opacity-60 transition-transform",
              open && "rotate-90",
            )}
          />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-2 top-full z-50 mt-1 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md",
            contentClassName ?? "w-60",
          )}
        >
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
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

function ProcessingLayer({
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
    <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
          {caption}
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
          {target}
        </span>
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
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                on
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {on && <Check className="h-3 w-3" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
