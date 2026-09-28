"use client";

/**
 * One picked Source: its name (which opens it), kind, size, Stage, the form
 * that goes in ("Use: Clean text"), "Choose parts", and remove. Every state is
 * said in words: landing, mid-processing (usable now with the raw text, or
 * "wait for the clean version"), unavailable, failed — each with its remedy.
 *
 * Form chooser: a stored file gets the canonical `ResourceFamilyPolicyEditor`
 * (Auto · Clean · Raw · Original PDF + include/exclude + previews) behind the
 * adapter below; every other kind gets the forms the server measured.
 * Progress: the existing `useStagesStatus` (the per-stage read the Knowledge
 * library uses), re-read on THE STAGE RE-READ RULE cadence — never a third
 * mechanism.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Scissors,
  X,
} from "lucide-react";
import type { SourceManifestEntry } from "@ai-matrx/agents/sources";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ResourceFamilyPolicyEditor } from "@/features/agents/components/inputs/resources/ResourceFamilyPolicyEditor";
import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
import { useStagesStatus } from "@/features/rag/hooks/useStagesStatus";
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import { factsPollDelayMs } from "@/features/sources/sourceRows";
import { sourceHref } from "@/features/sources/api/sourcesApi";
import { cn } from "@/utils/cn";
import { sourceKindDef } from "../sourceKinds";
import type { SourceCardModel } from "../types";
import type { UseSourceSetResult } from "../useSourceSet";

const PARTS_SEARCH_FROM = 12;

export function formatChars(chars: number): string {
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)}M characters`;
  if (chars >= 10_000) return `${Math.round(chars / 1000)}k characters`;
  if (chars >= 1000) return `${(chars / 1000).toFixed(1)}k characters`;
  return `${chars} characters`;
}

/** The size that will go in for this card (the chosen form or the picked parts). */
function cardChars(card: SourceCardModel): number | null {
  const entry = card.manifest;
  const ref = card.draft.ref;
  if (!entry || !ref) return null;
  if (ref.include_segments?.length && entry.segments?.length) {
    const picked = new Set(ref.include_segments);
    return entry.segments.filter((s) => picked.has(s.id)).reduce((n, s) => n + s.chars, 0);
  }
  const form = ref.representation ?? entry.default_form;
  return (
    entry.forms.find((f) => f.form === form)?.chars ??
    entry.forms.find((f) => f.form === entry.default_form)?.chars ??
    null
  );
}

const STATE_WORDS: Record<SourceManifestEntry["state"], string> = {
  ready: "Ready",
  processing: "Still being read",
  failed: "Could not be read",
  unavailable: "Not available",
};

export function SourceCard({
  card,
  set,
  job,
  onProcessingSettled,
}: {
  card: SourceCardModel;
  set: UseSourceSetResult;
  /** The processing-runner job reading this file, when this session started one. */
  job: ProcessingJob | null;
  onProcessingSettled: () => void;
}) {
  const [open, setOpen] = useState<"form" | "parts" | null>(null);
  const kind = sourceKindDef(card.draft.kind);
  const Icon = kind.icon;
  const ref = card.draft.ref;
  const entry = card.manifest;
  const chars = cardChars(card);
  const isFile = ref?.resource_type === "file";
  const partsCount = ref?.include_segments?.length ?? 0;
  const segments = entry?.segments ?? [];
  const formLabel =
    entry?.forms.find((f) => f.form === (ref?.representation ?? entry.default_form))?.label ??
    (ref?.representation === "raw"
      ? "Raw text"
      : ref?.representation === "pdf"
        ? "Original PDF"
        : "Clean text");

  return (
    <li className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 p-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="min-w-0 text-sm font-medium text-foreground">
            {ref ? (
              <EntityRef
                token={ref.resource_type}
                id={ref.resource_id}
                name={card.draft.label}
                href={card.draft.processedDocumentId ? sourceHref(card.draft.processedDocumentId) : undefined}
                openInNewTab
                showIcon={false}
              />
            ) : (
              <span className="block truncate">{card.draft.label}</span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{kind.label}</span>
            {chars !== null ? <span>· {formatChars(chars)}</span> : null}
            {entry ? (
              <span className={cn(entry.state === "processing" && "text-warning", (entry.state === "failed" || entry.state === "unavailable") && "text-destructive")}>
                · {STATE_WORDS[entry.state]}
              </span>
            ) : null}
            {card.draft.origin && card.draft.origin !== kind.label ? (
              <span className="truncate">· {card.draft.origin}</span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 sm:h-8 sm:w-8"
          aria-label={`Remove ${card.draft.label}`}
          onClick={() => set.remove(card.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {card.status === "resolving" || card.status === "pending" ? (
        <p className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {addingWords(card.draft.kind)}
          {kind.fallbackNote ? <span className="hidden sm:inline">— {kind.fallbackNote}</span> : null}
        </p>
      ) : null}

      {card.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 border-t border-border px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{card.error ?? "This could not be added. Remove it and try again."}</span>
        </p>
      ) : null}

      {card.draft.notes?.length ? (
        <ul className="space-y-0.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {card.draft.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      {card.status === "ready" && entry && entry.state !== "ready" ? (
        <ProcessingLine
          card={card}
          entry={entry}
          job={job}
          onWaitChange={(wait) => set.setWaitForClean(card.id, wait)}
          onSettled={onProcessingSettled}
        />
      ) : null}

      {card.status === "ready" && ref && entry && entry.state !== "failed" && entry.state !== "unavailable" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 gap-1 sm:h-8"
            onClick={() => setOpen(open === "form" ? null : "form")}
            aria-expanded={open === "form"}
          >
            <span className="text-muted-foreground">Use:</span> {formLabel}
            {open === "form" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          {segments.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 gap-1.5 sm:h-8"
              onClick={() => setOpen(open === "parts" ? null : "parts")}
              aria-expanded={open === "parts"}
            >
              <Scissors className="h-3.5 w-3.5" />
              {partsCount ? `${partsCount} of ${segments.length} parts` : "Choose parts"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {open === "form" && ref && entry ? (
        <div className="border-t border-border px-3 py-3">
          {isFile ? (
            <ResourceFamilyPolicyEditor
              fileId={ref.resource_id}
              compact
              value={{
                promote: ref.promote ? (Array.isArray(ref.promote) ? ref.promote : [ref.promote]) : undefined,
                exclude: ref.exclude,
              }}
              onChange={(policy) =>
                set.updateRef(card.id, { promote: policy.promote, exclude: policy.exclude })
              }
              primaryRepresentation={ref.representation as DocumentRepresentation | undefined}
              onPrimaryRepresentationChange={(representation) =>
                set.updateRef(card.id, { representation })
              }
            />
          ) : (
            <FormChooser
              entry={entry}
              value={ref.representation ?? entry.default_form}
              onChange={(representation) => set.updateRef(card.id, { representation })}
            />
          )}
        </div>
      ) : null}

      {open === "parts" && ref ? (
        <PartsChooser
          segments={segments}
          picked={ref.include_segments ?? []}
          onChange={(ids) => set.updateRef(card.id, { include_segments: ids })}
        />
      ) : null}
    </li>
  );
}

function addingWords(kind: SourceCardModel["draft"]["kind"]): string {
  switch (kind) {
    case "web":
      return "Reading the page…";
    case "youtube":
      return "Writing out what was said…";
    case "audio":
      return "Uploading and writing out the recording…";
    case "upload":
    case "image":
      return "Uploading…";
    default:
      return "Adding…";
  }
}

function FormChooser({
  entry,
  value,
  onChange,
}: {
  entry: SourceManifestEntry;
  value: string;
  onChange: (form: string) => void;
}) {
  const forms = entry.forms.filter((f) => f.available);
  if (forms.length === 0)
    return <p className="text-xs text-muted-foreground">This Source has only one form so far.</p>;
  if (forms.length <= 4)
    return (
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What goes in">
        {forms.map((f) => (
          <button
            key={f.form}
            type="button"
            role="radio"
            aria-checked={value === f.form}
            onClick={() => onChange(f.form)}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-left text-xs transition-colors sm:min-h-9",
              value === f.form
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent/50",
            )}
          >
            <span className="block font-medium">{f.label}</span>
            <span className="block text-[11px]">{formatChars(f.chars)}</span>
          </button>
        ))}
      </div>
    );
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-full sm:h-9 sm:w-64" aria-label="What goes in">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {forms.map((f) => (
          <SelectItem key={f.form} value={f.form}>
            {f.label} · {formatChars(f.chars)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PartsChooser({
  segments,
  picked,
  onChange,
}: {
  segments: NonNullable<SourceManifestEntry["segments"]>;
  picked: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const pickedSet = new Set(picked);
  const shown = query.trim()
    ? segments.filter((s) => s.label.toLowerCase().includes(query.trim().toLowerCase()))
    : segments;
  const all = picked.length === 0;
  const toggle = (id: string) => {
    // "No parts picked" means the whole Source; the first untick starts from all.
    const base = all ? new Set(segments.map((s) => s.id)) : new Set(pickedSet);
    if (base.has(id)) base.delete(id);
    else base.add(id);
    const next = segments.filter((s) => base.has(s.id)).map((s) => s.id);
    onChange(next.length === segments.length ? [] : next);
  };
  return (
    <div className="space-y-2 border-t border-border px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {all ? "The whole Source goes in. Untick the parts you don't want." : `${picked.length} of ${segments.length} parts go in.`}
        </p>
        {!all ? (
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-9" onClick={() => onChange([])}>
            Use all of it
          </Button>
        ) : null}
      </div>
      {segments.length >= PARTS_SEARCH_FROM ? (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a part (e.g. Page 12)"
          className="text-base sm:text-sm"
          aria-label="Find a part"
        />
      ) : null}
      <ul className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
        {shown.map((s) => {
          const on = all || pickedSet.has(s.id);
          return (
            <li key={s.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-accent/40 sm:min-h-9">
                <Checkbox checked={on} onCheckedChange={() => toggle(s.id)} />
                <span className="min-w-0 flex-1 truncate text-sm">{s.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatChars(s.chars)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A Source still being read. It is usable NOW with its raw text (the server's
 * own fallback, said on the card); the person may choose to wait for the clean
 * version. Stage progress comes from `useStagesStatus`, re-read while it runs.
 */
function ProcessingLine({
  card,
  entry,
  job,
  onWaitChange,
  onSettled,
}: {
  card: SourceCardModel;
  entry: SourceManifestEntry;
  job: ProcessingJob | null;
  onWaitChange: (wait: boolean) => void;
  onSettled: () => void;
}) {
  const pdId = card.draft.processedDocumentId ?? null;
  const stages = useStagesStatus(entry.state === "processing" ? pdId : null);
  const started = useRef(Date.now());
  const cleanDone = stages.status?.stages.find((s) => s.stage === "clean_text")?.state === "done";
  const jobDone = job?.status === "succeeded";
  const remeasures = useRef(0);

  useEffect(() => {
    if (entry.state !== "processing") return undefined;
    if (cleanDone || jobDone) {
      // The reading finished: re-measure so the card follows the server. The
      // server's own state can trail the stage table by a few seconds, so ask
      // up to three times, spaced out — never a tight loop.
      if (remeasures.current >= 3) return undefined;
      const t = setTimeout(
        () => {
          remeasures.current += 1;
          onSettled();
        },
        remeasures.current === 0 ? 0 : 4000,
      );
      return () => clearTimeout(t);
    }
    if (!pdId) return undefined;
    const delay = factsPollDelayMs(true, Date.now() - started.current);
    if (delay === null) return undefined;
    const t = setTimeout(stages.reload, delay);
    return () => clearTimeout(t);
    // stages.status changes after every re-read, which schedules the next one;
    // the manifest entry changes after every re-measure.
  }, [entry, cleanDone, jobDone, pdId, stages.status, stages.reload, onSettled]);

  if (entry.state === "processing") {
    const progress = job?.frame?.message ?? (stages.status
      ? stages.status.stages
          .filter((s) => s.state === "done")
          .map((s) => STAGE_WORDS[s.stage])
          .filter(Boolean)
          .join(" · ")
      : null);
    return (
      <div className="space-y-2 border-t border-border px-3 py-2">
        <p className="flex items-start gap-2 text-xs text-warning">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {entry.state_detail ?? "Still being cleaned — the raw text is used until the clean version is ready."}
            {progress ? <span className="text-muted-foreground"> Done so far: {progress}.</span> : null}
          </span>
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-foreground sm:min-h-0">
          <Checkbox checked={card.draft.waitForClean ?? false} onCheckedChange={(v) => onWaitChange(v === true)} />
          Wait for the clean version before starting
        </label>
      </div>
    );
  }
  return (
    <p role="alert" className="flex items-start gap-2 border-t border-border px-3 py-2 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{entry.state_detail ?? "This Source cannot be read. Remove it, or add it again."}</span>
    </p>
  );
}

const STAGE_WORDS: Record<string, string> = {
  cloud_file: "stored",
  raw_text: "read",
  clean_text: "cleaned",
  chunks: "split into parts",
  vectors: "made searchable",
  stores: "indexed",
};
