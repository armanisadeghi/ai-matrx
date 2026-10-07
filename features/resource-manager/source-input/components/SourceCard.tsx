"use client";

/**
 * One picked Source: its name (which opens it), kind, size, Stage, the form
 * that goes in ("Use: Clean text"), "Choose parts", and remove. Every state is
 * said in words: landing, mid-processing (usable now with the raw text, or
 * "wait for the clean version"), unavailable, failed — each with its remedy.
 *
 * Form chooser: every kind — a stored file included — gets the forms the
 * server measured (the forms `/sources/resolve` can actually deliver), and
 * "How the AI gets it" reads and writes delivery through `../delivery.ts`,
 * the one source of truth the review page uses too. (V1-A: a stored file used
 * chat's attachment editor, whose "nothing copied" sentence described chat's
 * look-up-by-default and whose extra copies/exclusions the Source path never
 * reads — so the card said the opposite of what the request carried.)
 * Progress: the existing `useStagesStatus` (the per-stage read the Knowledge
 * library uses), re-read on THE STAGE RE-READ RULE cadence — never a third
 * mechanism.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  RotateCcw,
  Scissors,
  X,
} from "lucide-react";
import type { SourceManifestEntry } from "@ai-matrx/agents/sources";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
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
import { InfoHint } from "@/components/official/InfoHint";
import { useStagesStatus } from "@/features/rag/hooks/useStagesStatus";
import type { ProcessingJob } from "@/features/rag/hooks/useProcessingRunner";
import { factsPollDelayMs } from "@/features/sources/sourceRows";
import { sourceHref } from "@/features/sources/api/sourcesApi";
import { cn } from "@/utils/cn";
import { toast } from "@/lib/toast";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { describeFailure } from "@/lib/failure/transport";
import { formatElapsed } from "@/lib/progress/elapsed";
import { sourceKindDef, sourceKindIcon, sourceKindNoun } from "../sourceKinds";
import {
  InlineUploadArea,
  type UploadedFile,
} from "@/features/resource-manager/resource-picker/InlineUploadArea";
import {
  DELIVERY_WORDS,
  deliveryChoicesFor,
  deliveryPatch,
  sourceDelivery,
  type SourceDelivery,
} from "@ai-matrx/agents/sources/runtime";
import type { SourcePart } from "@ai-matrx/agents/sources/runtime";
import { SourcePartsPicker } from "../review/SourcePartsPicker";
import { ARCHIVED_SOURCE_LABEL, RestoreSourceButton, isArchivedSource } from "./ArchivedSource";
import {
  resumableInput,
  sourceCardChars,
  sourceCardMeasuredState,
  ASKING_FOR_ORGANIZATION,
  WAITING_FOR_ORGANIZATION,
} from "@ai-matrx/agents/sources/runtime";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import type { SourceCardModel } from "@ai-matrx/agents/sources/runtime";
import type { UseSourceSetResult } from "../useSourceSet";
import { formatCount } from "@ai-matrx/kit/format";

/** A note longer than one line of the card shows its whole sentence behind a hint. */
const NOTE_LINE_CHARS = 60;

export function formatChars(chars: number): string {
  return `${formatCount(chars, { style: "compact" })} characters`;
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
  deliveries,
  heldForOrganization = false,
  mark,
  onProcessingSettled,
  onCleanNow,
  onTryAgain,
  onChooseFileAgain,
}: {
  card: SourceCardModel;
  set: UseSourceSetResult;
  /** The deliveries this host can use — the card offers only these. Omitted = both. */
  deliveries?: readonly SourceDelivery[];
  /** A stored file whose state cannot be asked for until an organization is picked (V2-F #3). */
  heldForOrganization?: boolean;
  /** A short word the host puts beside the state (e.g. "Not in this deck"). */
  mark?: string;
  /** The processing-runner job reading this file, when this session started one. */
  job: ProcessingJob | null;
  onProcessingSettled: () => void;
  /**
   * Clean this Source now, on the live lane (`POST /rag/library/{id}/clean`).
   * The remedy for a clean that is queued and not coming back while the
   * person waits. Omitted when the host cannot run one.
   */
  onCleanNow?: (processedDocumentId: string) => void;
  /** Land the kept input again (shown when the draft kept one). */
  onTryAgain?: () => void;
  /** The person chose the file again after its upload was cut off. */
  onChooseFileAgain?: (file: UploadedFile) => void;
}) {
  const [open, setOpen] = useState<"form" | "parts" | null>(null);
  const Icon = sourceKindIcon(card.draft);
  const ref = card.draft.ref;
  const entry = card.manifest;
  // THE one size (the runtime's rule — the same number the header and the review show).
  const chars = sourceCardChars(card);
  // THE one state: the server's measured word only for a card that landed (a failed card is failed).
  const measuredState = sourceCardMeasuredState(card);
  const delivery = sourceDelivery(ref);
  const deliveryChoices = deliveryChoicesFor(deliveries);
  const waitingForOrganization = card.status === "error" && card.error === WAITING_FOR_ORGANIZATION;
  const partsCount = ref?.include_segments?.length ?? 0;
  const segments = entry?.segments ?? [];
  // Parts belong to one form (clean text is split differently from the raw
  // pages), so a form change starts the parts over — and says so.
  const changeForm = (representation: string | undefined) => {
    const hadParts = (ref?.include_segments?.length ?? 0) > 0;
    set.updateRef(card.id, { representation, include_segments: undefined });
    if (hadParts)
      toast.info("The parts you picked were cleared — this form is split differently. Choose parts again if you need them.");
  };
  const formLabel =
    entry?.forms.find((f) => f.form === (ref?.representation ?? entry.default_form))?.label ??
    (ref?.representation === "raw" ? "Raw text" : "Clean text");

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
                // A name is read, not guessed: it wraps, never "Photosynthesis and …" (verify-4 #52).
                labelClassName="whitespace-normal break-words"
              />
            ) : (
              <span className="break-words">{card.draft.label}</span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {/* The kind, unless the name already says it (a link still landing is named "YouTube video"). */}
            {sourceKindNoun(card.draft) !== card.draft.label ? <span>{sourceKindNoun(card.draft)}</span> : null}
            {chars !== null ? (
              <span>
                · {formatChars(chars)}
                {delivery === "context" ? ", not sent up front" : ""}
              </span>
            ) : null}
            {delivery === "context" ? <span>· {DELIVERY_WORDS.context.summary}</span> : null}
            {measuredState ? (
              <span className={cn(measuredState === "processing" && "text-warning", (measuredState === "failed" || measuredState === "unavailable") && "text-destructive")}>
                · {isArchivedSource(entry) ? ARCHIVED_SOURCE_LABEL : STATE_WORDS[measuredState]}
              </span>
            ) : null}
            {mark ? <span className="font-medium text-warning">· {mark}</span> : null}
            {card.draft.origin && card.draft.origin !== sourceKindNoun(card.draft) ? (
              <span className="truncate">
                {sourceKindNoun(card.draft) !== card.draft.label ? "· " : ""}
                {card.draft.origin}
              </span>
            ) : null}
          </p>
        </div>
        <Button
          icon={<X />}
          type="button"
          variant="quiet"
          className="shrink-0"
          aria-label={`Remove ${card.draft.label}`}
          onClick={() => set.remove(card.id)}
        />
      </div>

      {card.status === "resolving" || card.status === "pending" ? (
        <p className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {card.draft.notes?.includes(ASKING_FOR_ORGANIZATION) ? "Waiting for you to choose an organization…" : addingWords(card.draft.kind)}
        </p>
      ) : null}

      {card.status === "error" ? (
        <p
          role="alert"
          className={cn(
            "flex items-start gap-2 border-t border-border px-3 py-2 text-xs",
            waitingForOrganization ? "text-warning" : "text-destructive",
          )}
        >
          {waitingForOrganization ? (
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1">{card.error ?? "This could not be added. Remove it and try again."}</span>
          {waitingForOrganization ? (
            <Button
              icon={<Building2 />}
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => void chooseOrganization()}
            >
              Choose organization
            </Button>
          ) : resumableInput(card.draft) && onTryAgain ? (
            <Button
              icon={<RotateCcw />}
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={onTryAgain}
            >
              Try again
            </Button>
          ) : null}
          {waitingForOrganization ? null : (
            <ErrorAlchemyMenu error={card.error ?? "This could not be added."} operation={`Add ${card.draft.label}`} />
          )}
        </p>
      ) : null}

      {card.status === "error" &&
      !waitingForOrganization &&
      !resumableInput(card.draft) &&
      !ref &&
      isUploadKind(card.draft.kind) &&
      onChooseFileAgain ? (
        // Its upload was cut off: choose the file again through the one upload surface.
        <InlineUploadArea
          clearHandedOver
          accept={sourceKindDef(card.draft.kind)?.accept}
          selectionMode="single"
          onSelect={(files) => {
            if (files[0]) onChooseFileAgain(files[0]);
          }}
        />
      ) : null}

      {heldForOrganization ? (
        <p role="status" className="flex items-start gap-2 border-t border-border px-3 py-2 text-xs text-warning">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{WAITING_FOR_ORGANIZATION}</span>
          <Button
            icon={<Building2 />}
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => void chooseOrganization()}
          >
            Choose organization
          </Button>
        </p>
      ) : null}

      {card.draft.notes?.some((n) => n !== ASKING_FOR_ORGANIZATION) ? (
        // One line per note: a server or package sentence can run to a
        // paragraph (verify-6 #27 printed three lines of a refusal). The full
        // sentence sits behind the hint.
        <ul className="space-y-0.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {card.draft.notes.filter((n) => n !== ASKING_FOR_ORGANIZATION).map((n) => (
            <li key={n} className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 flex-1 truncate">{n}</span>
              {n.length > NOTE_LINE_CHARS ? <InfoHint text={n} label="Full note" /> : null}
            </li>
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
          onCleanNow={onCleanNow}
        />
      ) : null}

      {card.status === "ready" && ref && entry && entry.state !== "failed" && entry.state !== "unavailable" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          <Button
            iconEnd={open === "form" ? <ChevronUp /> : <ChevronDown />}
            type="button"
            variant="outline"
            onClick={() => setOpen(open === "form" ? null : "form")}
            aria-expanded={open === "form"}
          >
            <span className="text-muted-foreground">Use:</span> {formLabel}
          </Button>
          {segments.length > 1 && delivery === "direct" ? (
            <Button
              icon={<Scissors />}
              type="button"
              variant="outline"
              onClick={() => setOpen(open === "parts" ? null : "parts")}
              aria-expanded={open === "parts"}
            >
              {partsCount ? `${partsCount} of ${segments.length} parts` : "Choose parts"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {open === "form" && ref && entry ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Which version</p>
            <FormChooser
              entry={entry}
              value={ref.representation ?? entry.default_form}
              onChange={(representation) => changeForm(representation)}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">How the AI gets it</p>
            {deliveryChoices.length > 1 ? (
            <SegmentedControl aria-label="Delivery"
              value={delivery}
              onValueChange={(v) => {
                const choice = deliveryChoices.find((c) => c.value === v);
                if (choice && choice.value !== delivery) set.updateRef(card.id, deliveryPatch(choice.value));
              }}
              data={deliveryChoices.map((c) => ({ value: c.value, label: c.label }))}
            />
            ) : (
              // The one way this page can use it — said, never a one-option control.
              <p className="text-xs text-foreground">{DELIVERY_WORDS[delivery].label}</p>
            )}
            {deliveryChoices.length > 1 ? (
              <p className="text-xs text-muted-foreground">{DELIVERY_WORDS[delivery].hint}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {open === "parts" && ref && delivery === "direct" ? (
        <PartsChooser
          sourceRef={ref}
          segments={segments}
          picked={ref.include_segments ?? []}
          onChange={(ids) => set.updateRef(card.id, { include_segments: ids })}
        />
      ) : null}
    </li>
  );
}

/**
 * "Choose organization": the ONE picker (the person's memberships). Setting one
 * lets every waiting card go on by itself (`useSourceRecovery`); closing it is
 * "not now" and changes nothing.
 */
async function chooseOrganization(): Promise<void> {
  try {
    await ensureOrganizationContext({ interactive: true });
  } catch (err) {
    if (!isOrganizationSelectionCancelled(err)) toast.error(err instanceof Error ? err.message : String(err));
  }
}

function isUploadKind(kind: SourceCardModel["draft"]["kind"]): boolean {
  return kind === "upload" || kind === "image" || kind === "audio";
}

function addingWords(kind: SourceCardModel["draft"]["kind"]): string {
  switch (kind) {
    case "web":
      return "Reading the page…";
    case "youtube":
    case "audio":
      return "Writing it out…";
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
      <SegmentedControl aria-label="Form"
        value={value}
        onValueChange={onChange}
        data={forms.map((f) => ({ value: f.form, label: `${f.label} · ${formatChars(f.chars)}` }))}
      />
    );
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-64" aria-label="What goes in">
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

/**
 * The card's "Choose parts" is THE one part picker the review uses too
 * (`SourcePartsPicker` — same search, same words). No parts chosen = the whole
 * Source; "Use all of it" returns there.
 */
function PartsChooser({
  sourceRef,
  segments,
  picked,
  onChange,
}: {
  sourceRef: NonNullable<SourceCardModel["draft"]["ref"]>;
  segments: SourcePart[];
  picked: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-2 border-t border-border px-3 py-3">
      {picked.length > 0 ? (
        <Button type="button" variant="quiet" onClick={() => onChange([])}>
          Use all of it
        </Button>
      ) : null}
      <SourcePartsPicker sourceRef={sourceRef} segments={segments} selected={picked} onChange={onChange} />
    </div>
  );
}

/**
 * A Source still being read. It is usable NOW with its raw text (the server's
 * own fallback, said on the card); the person may choose to wait for the clean
 * version. Stage progress comes from `useStagesStatus`, re-read while it runs.
 */
export function ProcessingLine({
  card,
  entry,
  job,
  onWaitChange,
  onSettled,
  onCleanNow,
}: {
  card: SourceCardModel;
  entry: SourceManifestEntry;
  job: ProcessingJob | null;
  onWaitChange: (wait: boolean) => void;
  onSettled: () => void;
  onCleanNow?: (processedDocumentId: string) => void;
}) {
  const pdId = card.draft.processedDocumentId ?? null;
  const stages = useStagesStatus(entry.state === "processing" ? pdId : null);
  // When this line first saw the Source still reading (set in an effect — render stays pure).
  const started = useRef<number | null>(null);
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
    started.current ??= Date.now();
    const delay = factsPollDelayMs(true, Date.now() - started.current);
    if (delay === null) return undefined;
    const t = setTimeout(stages.reload, delay);
    return () => clearTimeout(t);
    // stages.status changes after every re-read, which schedules the next one;
    // the manifest entry changes after every re-measure.
  }, [entry, cleanDone, jobDone, pdId, stages.status, stages.reload, onSettled]);

  // A CLEAN THAT IS NOT COMING BACK SAYS SO, WITH ITS REMEDY (2026-10-03).
  // A 48-page PDF sat on "Cleaning…" for 25+ minutes: its pages were queued
  // on the Batch lane (≥ clean_batch_min_pages), which answers in hours and
  // carries no deadline unless batch.deadline.processing_mode = "deadline".
  // Past CLEAN_STALL_MS with no clean of our own running, the line names the
  // wait and offers "Clean now" (the live clean stage); a person who ticks
  // "Wait for the clean version" is waiting, so that starts it too.
  const seenAt = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const processing = entry.state === "processing";
  useEffect(() => {
    if (!processing) return undefined;
    seenAt.current ??= Date.now();
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [processing]);
  const waited = seenAt.current !== null ? now - seenAt.current : 0;
  const cleaning = job?.status === "running";
  const cleanFailed = job?.status === "failed" ? job.error : null;
  const stalled = !cleaning && !cleanDone && waited > CLEAN_STALL_MS;
  const cleanNow = pdId && onCleanNow && !cleaning ? () => onCleanNow(pdId) : undefined;

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
          <span className="min-w-0 flex-1">
            {/* R9: short, plain; a stage list only once a stage is done ("Starting" said nothing). */}
            {stalled
              ? `Cleaning queued · ${formatElapsed(waited)}`
              : (entry.state_detail ?? "Cleaning… using the raw text for now")}
            {progress && !/^start/i.test(progress.trim()) ? (
              <span className="text-muted-foreground"> · {progress}</span>
            ) : null}
          </span>
          {stalled && cleanNow ? (
            <Button type="button" variant="outline" className="shrink-0" onClick={cleanNow}>
              Clean now
            </Button>
          ) : null}
        </p>
        {cleanFailed ? (
          <ErrorNotice
            size="inline"
            message={describeFailure(cleanFailed, { action: "cleaning this Source" }).sentence}
            error={cleanFailed}
            operation="Clean a Source"
            className="text-xs"
          />
        ) : null}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-foreground sm:min-h-0">
          <Checkbox
            checked={card.draft.waitForClean ?? false}
            onCheckedChange={(v) => {
              const wait = v === true;
              onWaitChange(wait);
              // Waiting for it means it is wanted now — never left on a lane that answers in hours.
              if (wait) cleanNow?.();
            }}
          />
          Wait for the clean version before starting
        </label>
      </div>
    );
  }
  if (isArchivedSource(entry) && card.draft.ref) {
    // State, not a sentence: the card's line already says "Archived"; this offers the way back.
    return (
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <RestoreSourceButton
          resourceType={card.draft.ref.resource_type}
          resourceId={card.draft.ref.resource_id}
          onRestored={onSettled}
        />
      </div>
    );
  }
  return (
    <p role="alert" className="flex items-start gap-2 border-t border-border px-3 py-2 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{entry.state_detail ?? "This Source cannot be read. Remove it, or add it again."}</span>
      <ErrorAlchemyMenu error={entry.state_detail ?? "This Source cannot be read."} operation="Read a Source" className="ml-auto" />
    </p>
  );
}

/** How long a Source may sit on "Cleaning…" before the line names the wait and offers the remedy. */
export const CLEAN_STALL_MS = 3 * 60 * 1000;

const STAGE_WORDS: Record<string, string> = {
  cloud_file: "stored",
  raw_text: "read",
  clean_text: "cleaned",
  chunks: "split into parts",
  vectors: "made searchable",
  stores: "indexed",
};
