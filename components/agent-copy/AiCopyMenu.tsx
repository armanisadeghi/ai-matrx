"use client";

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  buildAgentPayload,
  type AgentPayloadInput,
} from "@/components/agent-copy/buildAgentPayload";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import {
  approxTokens,
  fmtBytes,
  writeClipboard,
} from "@/components/agent-copy/clipboard";

/**
 * AiCopyMenu — the data-agnostic multi-variant "Copy for AI" control.
 *
 * A "Copy for AI" control is not a copy button — it is an AI context source: a
 * named point in the UI that turns whatever data is in scope into a
 * model-ready payload. Small bounded data keeps the plain CopyButtons pair;
 * once the data is medium/massive, the AI action becomes THIS menu — graded
 * variants (Short / Everything) and, for data with real shortening knobs, a
 * custom-preview dialog with live char / byte / ~token counts.
 *
 * Two render modes, chosen automatically:
 *   • exactly one variant, no custom source  → single icon button (no chevron)
 *   • multiple variants and/or a custom source → dropdown (chevron)
 *
 * The shortening/extraction logic NEVER lives here. Callers pass pure builders
 * (`AiVariant.build`, `AiCustomSource.build`) that produce the payload from
 * data + options. This file is only the chrome. Sibling implementation this is
 * kept in step with: aidream `apps/dashboard/src/components/agent-copy/`.
 */

export type AiIconType = React.ComponentType<{ className?: string }>;

/** A single ready-to-copy variant (e.g. "Focused", "Everything"). */
export interface AiVariant {
  id: string;
  label: string;
  hint?: string;
  icon?: AiIconType;
  /** Pure builder → an envelope input (wrapped via buildAgentPayload) or a
   *  finished string. May be async (e.g. lazily fetches the full set). */
  build: () => AgentPayloadInput | string | Promise<AgentPayloadInput | string>;
}

/** One control in the custom-preview dialog. */
export type AiCustomOption =
  | {
      kind: "toggle";
      key: string;
      label: string;
      hint?: string;
      default: boolean;
    }
  | {
      kind: "preset";
      key: string;
      label: string;
      options: { label: string; value: number }[];
      default: number;
    }
  | {
      // A snap-to-stops slider. The stored value is the stop value itself
      // (not the index), so builders read a self-describing number.
      kind: "slider";
      key: string;
      label: string;
      hint?: string;
      stops: number[];
      default: number;
      /** Label for the current value (e.g. "Removed", "Unlimited", "800 chars"). */
      formatValue: (v: number) => string;
    }
  | {
      // Free numeric input + optional quick presets. 0 conventionally means
      // "unlimited" for char-cap controls.
      kind: "number";
      key: string;
      label: string;
      hint?: string;
      min?: number;
      step?: number;
      presets?: { label: string; value: number }[];
      default: number;
    };

export type AiOptionValues = Record<string, boolean | number>;

/** The custom-preview source: a schema of options + a pure builder. */
export interface AiCustomSource {
  /** Dropdown item label, defaults to "Open custom view…". */
  label?: string;
  hint?: string;
  options: AiCustomOption[];
  /** Pure: produce the preview text + optional meta (counts shown to the user
   *  and attached to the AI envelope). */
  build: (opts: AiOptionValues) => {
    text: string;
    meta?: Record<string, string | number | boolean | undefined>;
  };
  /** Envelope wrapper for the "Copy for AI" action in the dialog. */
  wrap: (
    text: string,
    opts: AiOptionValues,
    meta?: Record<string, string | number | boolean | undefined>,
  ) => AgentPayloadInput;
  dialogTitle?: string;
  dialogDescription?: string;
}

export interface AiCopyMenuProps {
  /** Ready-to-copy variants shown as dropdown items (or the single button). */
  variants: AiVariant[];
  /** Optional custom-preview source ("Open custom view…"). */
  custom?: AiCustomSource;
  /** Human label for tooltips / toasts, e.g. "Backlinks", "All sandboxes". */
  label: string;
  /**
   * "xs" = micro icon (dense items / per-field); "icon" = compact icon
   * (rows / toolbars); "sm" = icon + "Copy for AI" text (headers).
   * Same scale as CopyButtons.
   */
  size?: "xs" | "icon" | "sm";
  /** Stop click events from bubbling (rows/cards with their own onClick). */
  stopPropagation?: boolean;
  disabled?: boolean;
  className?: string;
  align?: "start" | "end";
}

function toText(resolved: AgentPayloadInput | string): string {
  return typeof resolved === "string" ? resolved : buildAgentPayload(resolved);
}

export function AiCopyMenu({
  variants,
  custom,
  label,
  size = "icon",
  stopPropagation = true,
  disabled = false,
  className,
  align = "end",
}: AiCopyMenuProps) {
  const [busy, setBusy] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const isText = size === "sm";

  const buttonCls =
    size === "xs"
      ? "h-11 w-11 lg:h-5 lg:w-5"
      : size === "icon"
        ? "h-11 w-11 lg:h-7 lg:w-7"
        : "min-h-11 lg:min-h-8";
  const iconCls =
    size === "xs" ? "h-3 w-3" : size === "icon" ? "h-3.5 w-3.5" : "h-4 w-4";

  const runVariant = async (v: AiVariant) => {
    if (busy) return;
    setBusy(true);
    try {
      const resolved = await v.build();
      await writeClipboard(toText(resolved));
      toast.success(`${label} — ${v.label} copied for AI`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    } finally {
      setBusy(false);
    }
  };

  const single = variants.length === 1 && !custom ? variants[0] : null;

  const triggerBody = (
    <>
      {busy ? (
        <Loader2 className={cn(iconCls, "animate-spin")} />
      ) : (
        <CopyForAiIcon className={iconCls} />
      )}
      {isText && <span className="ml-1">Copy for AI</span>}
      {!single && (
        <ChevronDown
          className={cn("opacity-60", size === "sm" ? "h-3.5 w-3.5" : "h-3 w-3")}
        />
      )}
    </>
  );

  const wrap = (node: React.ReactNode) =>
    stopPropagation ? (
      <span
        className="inline-flex"
        onClick={(e) => e.stopPropagation()}
      >
        {node}
      </span>
    ) : (
      node
    );

  // Single action → plain icon button, no chevron, no dropdown.
  if (single) {
    return wrap(
      <Button
        type="button"
        variant="ghost"
        size={isText ? "sm" : "icon"}
        className={cn(buttonCls, className)}
        disabled={disabled || busy}
        onClick={() => void runVariant(single)}
        aria-label={`Copy ${label} for AI`}
        title={single.hint ?? `Copy ${label} for AI`}
      >
        {triggerBody}
      </Button>,
    );
  }

  return wrap(
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={isText ? "sm" : "icon"}
            className={cn(
              buttonCls,
              size !== "sm" && "w-auto gap-0 px-1.5",
              className,
            )}
            disabled={disabled || busy}
            aria-label={`Copy ${label} for AI`}
            title={`Copy ${label} for AI`}
          >
            {triggerBody}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-72">
          <DropdownMenuLabel>Copy {label} for AI</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {variants.map((v) => {
            const Icon = v.icon ?? CopyForAiIcon;
            return (
              <DropdownMenuItem
                key={v.id}
                onSelect={() => void runVariant(v)}
                className="gap-2"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex flex-col">
                  <span>{v.label}</span>
                  {v.hint && (
                    <span className="text-xs text-muted-foreground">
                      {v.hint}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            );
          })}
          {custom && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDialogOpen(true)}
                className="gap-2"
              >
                <CopyForAiIcon className="h-4 w-4 shrink-0" />
                <div className="flex flex-col">
                  <span>{custom.label ?? "Open custom view…"}</span>
                  {custom.hint && (
                    <span className="text-xs text-muted-foreground">
                      {custom.hint}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {custom && (
        <AiCustomDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          source={custom}
          label={label}
        />
      )}
    </>,
  );
}

// ---------------------------------------------------------------------------

function defaultsFor(options: AiCustomOption[]): AiOptionValues {
  const out: AiOptionValues = {};
  for (const o of options) out[o.key] = o.default;
  return out;
}

function OptionToggle({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function OptionPreset({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: { label: string; value: number }[];
  onChange: (v: number) => void;
}) {
  // Vertical layout (label above the controls) so the button row wraps
  // within the panel width instead of colliding with the label.
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2">
      <span className="text-sm">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Button
            key={o.label}
            type="button"
            size="sm"
            variant={value === o.value ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function OptionSlider({
  label,
  hint,
  value,
  stops,
  formatValue,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  stops: number[];
  formatValue: (v: number) => string;
  onChange: (v: number) => void;
}) {
  // Snap-to-stops over a native range input. Store the stop value, drive the
  // slider by index so movement is uniform regardless of value spacing.
  const idx = stops.indexOf(value);
  const safeIdx = idx === -1 ? stops.length - 1 : idx;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {formatValue(value)}
        </span>
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <input
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={safeIdx}
        onChange={(e) =>
          onChange(stops[Number(e.target.value)] ?? stops[0] ?? 0)
        }
        className="w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

function OptionNumber({
  label,
  hint,
  value,
  min = 0,
  step = 1,
  presets,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  step?: number;
  presets?: { label: string; value: number }[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2">
      <span className="text-sm">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <div className="flex flex-wrap items-center gap-1">
        {presets?.map((p) => (
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant={value === p.value ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </Button>
        ))}
        <Input
          type="number"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? Math.max(min, n) : min);
          }}
          className="h-7 w-24 text-xs tabular-nums"
        />
      </div>
    </div>
  );
}

function AiCustomDialog({
  open,
  onOpenChange,
  source,
  label,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source: AiCustomSource;
  label: string;
}) {
  const [opts, setOpts] = React.useState<AiOptionValues>(() =>
    defaultsFor(source.options),
  );
  const set = (key: string, val: boolean | number) =>
    setOpts((p) => ({ ...p, [key]: val }));

  // Build lazily and defensively. This dialog is mounted even while closed,
  // so an eager build would waste work on every host render AND let a builder
  // error crash the host page. Compute only when open; never let a builder
  // throw past this boundary.
  const result = React.useMemo<{
    text: string;
    meta?: Record<string, string | number | boolean | undefined>;
  }>(() => {
    if (!open) return { text: "" };
    try {
      return source.build(opts);
    } catch (e) {
      return { text: `Failed to build preview: ${String(e)}` };
    }
  }, [source, opts, open]);
  const bytes = React.useMemo(() => new Blob([result.text]).size, [result.text]);

  const copy = async (wrapForAi: boolean) => {
    const text = wrapForAi
      ? buildAgentPayload(source.wrap(result.text, opts, result.meta))
      : result.text;
    await writeClipboard(text);
    toast.success(
      wrapForAi ? `Copied ${label} for AI` : `Copied ${label} text`,
    );
  };

  const metaEntries = result.meta
    ? Object.entries(result.meta).filter(([, v]) => v !== undefined)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(1100px,95vw)] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>
            {source.dialogTitle ?? `${label} — custom export`}
          </DialogTitle>
          <DialogDescription>
            {source.dialogDescription ??
              "Tune the options until it fits, then copy."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="shrink-0 space-y-2 overflow-y-auto pr-1 lg:w-72">
            {source.options.map((o) => {
              if (o.kind === "toggle") {
                return (
                  <OptionToggle
                    key={o.key}
                    label={o.label}
                    hint={o.hint}
                    checked={Boolean(opts[o.key])}
                    onCheckedChange={(v) => set(o.key, v)}
                  />
                );
              }
              if (o.kind === "slider") {
                return (
                  <OptionSlider
                    key={o.key}
                    label={o.label}
                    hint={o.hint}
                    value={Number(opts[o.key])}
                    stops={o.stops}
                    formatValue={o.formatValue}
                    onChange={(v) => set(o.key, v)}
                  />
                );
              }
              if (o.kind === "number") {
                return (
                  <OptionNumber
                    key={o.key}
                    label={o.label}
                    hint={o.hint}
                    value={Number(opts[o.key])}
                    min={o.min}
                    step={o.step}
                    presets={o.presets}
                    onChange={(v) => set(o.key, v)}
                  />
                );
              }
              return (
                <OptionPreset
                  key={o.key}
                  label={o.label}
                  value={Number(opts[o.key])}
                  options={o.options}
                  onChange={(v) => set(o.key, v)}
                />
              );
            })}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs tabular-nums text-muted-foreground">
              {metaEntries.map(([k, v]) => (
                <span key={k}>
                  {k.replace(/_/g, " ")}: {String(v)}
                </span>
              ))}
              <span>{result.text.length.toLocaleString()} chars</span>
              <span>{fmtBytes(bytes)}</span>
              <span>~{approxTokens(result.text).toLocaleString()} tokens</span>
            </div>
            <pre
              className={cn(
                "min-h-32 flex-1 overflow-auto rounded-md border border-border bg-muted/30 p-3",
                "whitespace-pre-wrap break-words font-mono text-xs leading-relaxed",
              )}
            >
              {result.text}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => void copy(false)}
          >
            Copy text
          </Button>
          <Button type="button" onClick={() => void copy(true)}>
            <CopyForAiIcon className="h-4 w-4" />
            Copy for AI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
