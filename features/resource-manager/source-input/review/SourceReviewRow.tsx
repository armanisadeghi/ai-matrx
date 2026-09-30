"use client";

/**
 * One Source: a single summary line, expand to tune.
 *
 * Summary: name · kind · version in use · size · what happens to it.
 * Tuning (one Source at a time, never every knob at once):
 *   1. Which version (clean text, raw text, …)
 *   2. How much — all of it, or chosen parts
 *   3. A size limit
 *   4. How the AI gets it — include the text, or look it up when needed
 */

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  FileText,
  Layers,
  Loader2,
  StickyNote,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Input,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@ai-matrx/design-system";
import { formatChars, pagesPhrase } from "@/lib/tokens/estimate";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SourceRef } from "@ai-matrx/agents/sources";
import { chosenForm, type SourcePlanEntry } from "./plan";
import { SourcePartsPicker } from "./SourcePartsPicker";
import {
  DELIVERY_WORDS,
  deliveryChoicesFor,
  deliveryPatch,
  sourceDelivery,
  type SourceDelivery,
} from "../delivery";

/** Phones: every segment is a 44px target (the package control is 28px at "sm"). */
const SEGMENTED_TOUCH = "max-w-full flex-wrap max-lg:[&_[role=tab]]:min-h-11!";

/** Roughly how many characters fill a printed page — only for "about N pages". */

const KIND_WORDS: Record<string, { label: string; icon: LucideIcon }> = {
  file: { label: "File", icon: FileText },
  cld_file: { label: "File", icon: FileText },
  processed_document: { label: "Document", icon: BookOpen },
  note: { label: "Note", icon: StickyNote },
  fc_set: { label: "Flashcard deck", icon: Layers },
};

function kindWords(resourceType: string) {
  return (
    KIND_WORDS[resourceType] ?? {
      label: resourceType.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      icon: FileText,
    }
  );
}

const STATUS_WORDS: Record<SourcePlanEntry["status"], { label: string; className: string }> = {
  included: { label: "Goes in", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" },
  on_demand: { label: DELIVERY_WORDS.context.summary, className: "border-sky-500/40 text-sky-700 dark:text-sky-400" },
  left_out: { label: "Won't fit", className: "border-red-500/40 text-red-700 dark:text-red-400" },
  unusable: { label: "Can't be used", className: "border-border text-muted-foreground" },
};

interface SourceReviewRowProps {
  plan: SourcePlanEntry;
  onChange: (next: SourceRef) => void;
  onFormChange: (representation: string) => void;
  onRemove: () => void;
  defaultOpen?: boolean;
  /** The deliveries the host can use (`SourceInputProps.deliveries`). Omitted = both. */
  deliveries?: readonly SourceDelivery[];
  /** How the host names this Source (its real kind and display name) — wins over the manifest's. */
  describe?: SourceDescription;
}

/** A Source as the host names it: its real kind ("Transcript") and its display name (the file name). */
export interface SourceDescription {
  kind: string;
  name: string;
}

export function SourceReviewRow({
  plan,
  onChange,
  onFormChange,
  onRemove,
  defaultOpen = false,
  deliveries,
  describe,
}: SourceReviewRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isMobile = useIsMobile();
  const { entry, ref } = plan;
  const kind = kindWords(entry.resource_type);
  const Icon = kind.icon;
  const status = STATUS_WORDS[plan.status];
  const usable = plan.status !== "unusable";
  const segments = entry.segments ?? [];
  const pickingParts = (ref.include_segments?.length ?? 0) > 0;
  const [choosingParts, setChoosingParts] = useState(pickingParts);
  const availableForms = entry.forms.filter((f) => f.available);
  const form = chosenForm(entry, ref);
  const capOn = ref.max_chars !== undefined;
  const delivery = sourceDelivery(ref);
  const deliveryChoices = deliveryChoicesFor(deliveries);

  const update = (patch: Partial<SourceRef>) => {
    const next: SourceRef = { ...ref, ...patch };
    for (const key of Object.keys(patch) as Array<keyof SourceRef>) {
      if (patch[key] === undefined) delete next[key];
    }
    onChange(next);
  };

  const sizeWords =
    plan.status === "on_demand"
      ? `${formatChars(plan.formChars)} characters, not sent up front`
      : `${formatChars(plan.sentChars)} characters${plan.exact ? "" : " (about)"}`;

  return (
    <li className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-h-11 items-center gap-3 px-3 py-2.5 text-left"
      >
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{describe?.name || entry.label}</span>
          <span
            className="block truncate text-xs text-muted-foreground"
            title={`${plan.sentChars.toLocaleString()} characters go in`}
            data-sent-chars={plan.sentChars}
          >
            {describe?.kind || kind.label}
            {usable && form ? ` · ${form.label}` : ""}
            {usable ? ` · ${sizeWords}` : ""}
            {plan.partsSent !== null && pickingParts && usable
              ? ` · ${plan.partsSent} of ${plan.partsTotal} parts`
              : ""}
            {plan.capped ? " · size limit applied" : ""}
          </span>
        </span>
        {entry.state === "processing" && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" aria-label="Still being prepared" />
        )}
        <Badge variant="outline" className={cn("hidden shrink-0 sm:inline-flex", status.className)}>
          {status.label}
        </Badge>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      <div className="px-3 pb-1 sm:hidden">
        <Badge variant="outline" className={status.className}>
          {status.label}
        </Badge>
      </div>

      {(entry.state !== "ready" || plan.status === "left_out") && (
        <p
          className={cn(
            "mx-3 mb-2 flex items-start gap-1.5 text-xs",
            plan.status === "unusable" || plan.status === "left_out"
              ? "text-red-700 dark:text-red-400"
              : "text-amber-700 dark:text-amber-400",
          )}
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {plan.status === "left_out"
              ? deliveryChoices.some((c) => c.value === "context")
                ? "No room left — choose parts, limit its size, or let the AI look it up."
                : "No room left — choose parts or limit its size."
              : (entry.state_detail ??
                (entry.state === "processing"
                  ? "Still being prepared — the raw text is used for now."
                  : "This Source can't be read right now."))}
          </span>
        </p>
      )}

      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          {usable && availableForms.length > 1 && (
            <Field label="Which version">
              {/* Phone: a Select — long version names never stack a switch into rows. */}
              {availableForms.length <= 4 && !isMobile ? (
                <SegmentedControl
                  value={form?.form ?? entry.default_form}
                  onValueChange={onFormChange}
                  data={availableForms.map((f) => ({
                    value: f.form,
                    label: `${f.label} · ${formatChars(f.chars)}`,
                  }))}
                  size="sm"
                  className={SEGMENTED_TOUCH}
                />
              ) : (
                <Select value={form?.form ?? entry.default_form} onValueChange={onFormChange}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForms.map((f) => (
                      <SelectItem key={f.form} value={f.form}>
                        {f.label} · {formatChars(f.chars)} characters
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}

          {usable && segments.length > 1 && delivery === "direct" && (
            <Field label="How much" hint={`${segments.length} parts`}>
              <SegmentedControl
                value={choosingParts ? "parts" : "all"}
                onValueChange={(v) => {
                  if (v === "all") {
                    setChoosingParts(false);
                    update({ include_segments: undefined });
                  } else {
                    setChoosingParts(true);
                  }
                }}
                data={[
                  { value: "all", label: "All of it" },
                  { value: "parts", label: "Choose parts" },
                ]}
                size="sm"
                className={SEGMENTED_TOUCH}
              />
              {choosingParts && (
                <div className="pt-2">
                  <SourcePartsPicker
                    sourceRef={ref}
                    segments={segments}
                    selected={ref.include_segments ?? []}
                    onChange={(ids) => update({ include_segments: ids.length ? ids : undefined })}
                  />
                </div>
              )}
            </Field>
          )}

          {usable && delivery === "direct" && (
            <Field label="Size limit">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-h-11 items-center gap-2 text-sm text-foreground sm:min-h-0">
                  <Switch
                    checked={capOn}
                    onCheckedChange={(on) =>
                      update({
                        max_chars: on ? Math.max(1_000, Math.round(plan.formChars / 2 / 1_000) * 1_000) : undefined,
                      })
                    }
                  />
                  Limit this Source
                </label>
                {capOn && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    Up to
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1000}
                      step={1000}
                      value={ref.max_chars ?? ""}
                      onChange={(e) => {
                        const n = Math.round(Number(e.target.value));
                        if (Number.isFinite(n) && n > 0) update({ max_chars: n });
                      }}
                      aria-label="Most characters to include"
                      className="w-32 tabular-nums"
                    />
                    characters ({pagesPhrase(ref.max_chars ?? 0)})
                  </span>
                )}
              </div>
            </Field>
          )}

          {usable && (
            <Field
              label="How the AI gets it"
              hint={DELIVERY_WORDS[delivery].hint}
            >
              {deliveryChoices.length > 1 ? (
                <SegmentedControl
                  value={delivery}
                  onValueChange={(v) => update(deliveryPatch(v === "context" ? "context" : "direct"))}
                  data={deliveryChoices.map((c) => ({ value: c.value, label: c.label }))}
                  size="sm"
                  className={SEGMENTED_TOUCH}
                />
              ) : (
                // The one way this host can use it — said, never a one-option control.
                <p className="text-sm text-foreground">{DELIVERY_WORDS[delivery].label}</p>
              )}
            </Field>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="text-muted-foreground">
              <Trash2 className="mr-1.5 h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-foreground">{label}</div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
