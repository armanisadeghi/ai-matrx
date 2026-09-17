"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Mic, PenLine, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import type { paths } from "@/types/python-generated/api-types";
import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import {
  DurableRunStopButton,
  DurableRunStopped,
} from "@/lib/durable-run/DurableRunStop";
import { durableRunDialogOnOpenChange } from "@/lib/durable-run/durableRunDialogClose";
import { AgentCredit } from "../AgentCredit";
import { createSittingStore, type SittingBase } from "../../sitting/sitting";
import { useDialogSitting } from "../../sitting/useDialogSitting";
import { SittingResumed } from "../../sitting/SittingResumed";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import { useRunResultOnce } from "../../durable-run/useRunResultOnce";
import { recordPastedSource } from "../../record/pastedSource";
import type { Rulebook } from "../../types";
import {
  describeIngest,
  parseIngestSummary,
  type IngestSummary,
} from "./IngestSourceDialog";

/**
 * THE RED-PEN LANE — "you already spend your day reviewing other people's work.
 * Mark it up here instead."
 *
 * The `red_pen` Approach (`platform.approach`, catalog number 8), live since
 * 2026-09-15. Masterwork doctrine CORE §5: the correction log is the highest
 * yield question you can ask an expert — *what do you keep fixing in your
 * junior's work?* — because GRADING IS EXTRACTION. The expert is not composing
 * teaching material and is not being interviewed; they are doing the job they
 * already do, and the judgment falls out of it.
 *
 * ## What the Expert does here
 *
 * 1. Puts the piece of work in — paste it, or upload a plain-text file. Either
 *    way it is kept as a source of this Rulebook (the same note + association
 *    every other paste lane writes, so it is listed in Resources and openable).
 * 2. Highlights a passage and says what is wrong with it and what they would do
 *    instead — TYPED OR SPOKEN, through the platform's one dictation primitive
 *    (`ProTextarea`'s microphone). Repeat.
 * 3. Distils. Each correction is a unit: the span is the evidence, their words
 *    are the judgment, and the moment is when they said it. All three land on
 *    every rule's `source_ref.span`.
 *
 * ## Why it is not a mode of the "Add rules from a source" dialog
 *
 * Every other lane reads material the Expert AGREES with. This one reads
 * material they disagree with, and the rule lives in the DISAGREEMENT — never
 * in the work's own words. So there is no "is it the finished work?" question,
 * no paste-or-upload choice once the work is in, and the capture surface is a
 * highlighter and a microphone rather than a text box.
 *
 * ## The two knobs
 *
 * `platform.feature_knob` `masterwork_distillation`:
 * `min_corrections_before_distilling` (default 3) and
 * `markup_voice_default_on` (default true). The server is the authority on the
 * minimum — it refuses a short run by name before spending anything — and the
 * literals below are declared KNOB MIRRORS of those rows.
 */

const INGEST_MARKUP_PATH = "/masterworks/ingest-markup" satisfies keyof paths;

/**
 * The red-pen distiller's mandate. A STRING LITERAL rather than
 * `MANDATE_KEYS.masterwork__markup_distiller` for exactly as long as the
 * installed `@ai-matrx/agents` (0.12.2, 399 keys) predates this mandate's
 * registration — the key is REAL (`mandate.definition` row
 * `masterwork.markup_distiller`, enabled, holder bound, created 2026-09-15 by
 * `scripts/mandates_generate.py`), and `AgentCredit` takes the key as a string,
 * so the credit and its link to the mandate admin are honest today. Swap it for
 * the constant on the first change here after the package republishes.
 */
const MARKUP_MANDATE_KEY = "masterwork.markup_distiller";

// KNOB MIRROR of platform.feature_knob "masterwork_distillation"
// "min_corrections_before_distilling" — a synchronous form check mirroring the
// floor the server enforces (aidream services/distillation/knobs.py). Change
// the row, then re-mirror this literal; the value has no sync read path, and
// the server refuses a short run by name whatever this says.
const MIN_CORRECTIONS = 3;

// KNOB MIRROR of platform.feature_knob "masterwork_distillation"
// "markup_voice_default_on" — whether the correction box opens with its
// microphone available. Same mirroring rule as above.
const VOICE_DEFAULT_ON = true;

/** Enough of a work piece to be worth reviewing. */
const MIN_WORK_CHARS = 120;

/** The not-yet-saved selection, marked in the work like a real correction. */
const PENDING_ID = "__pending__";

/**
 * THE RED-PEN SITTING — the whole markup session, not just the pasted text.
 *
 * Cold walk 6 (2026-09-17, finding 4): an Expert pasted a piece of work, saved
 * a correction against it, left the deep link and came back — and the dialog
 * was on its blank first step with the work AND the correction gone, no
 * warning before the loss and nothing to recover it. The lane did keep the
 * pasted text through `useTextDraft`, which covers ONE field: the title and
 * every saved correction were never kept at all, and the text itself was only
 * kept above that primitive's 40-character floor. What an Expert loses here is
 * the SESSION, so the session is what is kept.
 */
interface RedPenSitting extends SittingBase {
  workText: string;
  workTitle: string;
  corrections: Correction[];
  marking: boolean;
}

const redPenSittings = createSittingStore<RedPenSitting>({
  keyPrefix: "matrx.masterwork.red-pen.v1:",
  isUsable: (sitting) =>
    typeof sitting.workText === "string" &&
    (sitting.workText.trim().length > 0 ||
      (Array.isArray(sitting.corrections) && sitting.corrections.length > 0)),
});

/**
 * What can be dropped in as the work piece. DELIBERATELY NARROW AND HONEST:
 * these are the types the browser can read into text with no server round
 * trip, which is what the markup surface needs (it highlights character
 * offsets in the exact string the server will re-verify). A PDF or a recording
 * is the "Upload a file" card's job — it has a reader; this door does not, and
 * says so rather than accepting one and failing later.
 */
const WORK_ACCEPT = ".txt,.md,.markdown,.csv,.json,text/plain,text/markdown";

export interface Correction {
  /** Client-side identity only — never sent. */
  id: string;
  span: string;
  start: number;
  end: number;
  comment: string;
  /** True when the Expert spoke this correction rather than typing it. */
  voice: boolean;
  /** ISO moment the correction was made. */
  at: string;
}

/** One run of the work text: plain, or struck through by a correction. */
export interface WorkSegment {
  start: number;
  end: number;
  text: string;
  correctionId: string | null;
}

/**
 * Split the work into rendered runs, marking the passages already corrected.
 *
 * Exported and pure because it is also what the guard asserts: a correction's
 * span must be exactly the characters between its own offsets, or the
 * highlight on screen would not be the evidence sent to the server.
 * Overlapping corrections keep the FIRST one — a second verdict on the same
 * words is a second correction, not a re-colouring of the first.
 */
export function segmentWork(
  workText: string,
  corrections: Correction[],
): WorkSegment[] {
  const ordered = [...corrections].sort((a, b) => a.start - b.start);
  const segments: WorkSegment[] = [];
  let cursor = 0;
  for (const correction of ordered) {
    if (correction.start < cursor) continue;
    if (correction.start > cursor) {
      segments.push({
        start: cursor,
        end: correction.start,
        text: workText.slice(cursor, correction.start),
        correctionId: null,
      });
    }
    segments.push({
      start: correction.start,
      end: correction.end,
      text: workText.slice(correction.start, correction.end),
      correctionId: correction.id,
    });
    cursor = correction.end;
  }
  if (cursor < workText.length) {
    segments.push({
      start: cursor,
      end: workText.length,
      text: workText.slice(cursor),
      correctionId: null,
    });
  }
  return segments;
}

/** A selection inside one rendered run, resolved to work-text offsets. */
export function offsetOf(node: Node | null, offsetInNode: number): number | null {
  let element: HTMLElement | null =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : (node?.parentElement ?? null);
  while (element && element.dataset?.workStart === undefined) {
    element = element.parentElement;
  }
  if (!element) return null;
  const base = Number(element.dataset.workStart);
  if (!Number.isFinite(base)) return null;
  return base + offsetInNode;
}

export function RedPenDialog({
  open,
  onOpenChange,
  rulebook,
  onIngested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onIngested?: () => void;
}) {
  const [workText, setWorkText] = useState("");
  const [workTitle, setWorkTitle] = useState("");
  const [marking, setMarking] = useState(false);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [pending, setPending] = useState<
    { span: string; start: number; end: number } | null
  >(null);
  const [comment, setComment] = useState("");
  const [spoke, setSpoke] = useState(false);
  const workRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const run = useMasterworkRun<IngestSummary>({
    surface: "red_pen",
    rulebookId: rulebook.id,
    path: INGEST_MARKUP_PATH,
    parseResult: parseIngestSummary,
  });
  const running = run.running;
  const summary = run.result ? describeIngest(run.result) : null;

  // A LANE NEVER LOSES IN-PROGRESS WORK. The pasted work, what it is called,
  // every correction already saved against it, and which step she was on —
  // kept together, put back together, and announced on screen when they are.
  const sitting = useDialogSitting<RedPenSitting>({
    store: redPenSittings,
    scopeId: rulebook.id,
    active: open,
    snapshot: { workText, workTitle, corrections, marking },
    isWorthKeeping: (s) =>
      s.workText.trim().length > 0 || s.corrections.length > 0,
    apply: (kept) => {
      setWorkText(kept.workText);
      setWorkTitle(kept.workTitle);
      setCorrections(kept.corrections ?? []);
      setMarking(Boolean(kept.marking) && kept.workText.trim().length > 0);
    },
    clearScreen: () => {
      setWorkText("");
      setWorkTitle("");
      setCorrections([]);
      setMarking(false);
      setPending(null);
      setComment("");
      setSpoke(false);
    },
  });

  const reset = useCallback(() => {
    run.reset();
    setPending(null);
    setComment("");
    setSpoke(false);
  }, [run]);

  useRunResultOnce(run, () => {
    // The lane finished for real — there is nothing left in progress to keep.
    sitting.forget();
    onIngested?.();
  });

  useEffect(() => {
    if (run.error) toast.error(run.error);
  }, [run.error]);

  // THE PASSAGE YOU ARE TALKING ABOUT HAS TO BE VISIBLE WHILE YOU TALK ABOUT
  // IT (jobs-bar-2026-09-16 lanes-b, item 3). Only SAVED corrections were
  // marked, so the moment a selection became "pending" the browser's own
  // highlight was lost on the next render and the work went back to plain grey
  // — leaving a box asking "what's wrong with it?" above a passage the Expert
  // could no longer see. The pending span is segmented like any other so the
  // offsets on screen are exactly the offsets we will send.
  const segments = useMemo(
    () =>
      segmentWork(
        workText,
        pending
          ? [
              ...corrections,
              {
                id: PENDING_ID,
                span: pending.span,
                start: pending.start,
                end: pending.end,
                comment: "",
                voice: false,
                at: "",
              },
            ]
          : corrections,
      ),
    [workText, corrections, pending],
  );

  /** A highlight is only a correction once the Expert has said what is wrong. */
  const captureSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const container = workRef.current;
    if (!container || !container.contains(selection.anchorNode)) return;
    const a = offsetOf(selection.anchorNode, selection.anchorOffset);
    const b = offsetOf(selection.focusNode, selection.focusOffset);
    if (a === null || b === null) return;
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    if (end - start < 2) return;
    if (
      corrections.some((c) => start < c.end && end > c.start)
    ) {
      toast.error(
        "You have already marked part of that passage — open that correction, or pick different words.",
      );
      selection.removeAllRanges();
      return;
    }
    setPending({ span: workText.slice(start, end), start, end });
    setComment("");
    setSpoke(false);
    selection.removeAllRanges();
  }, [corrections, workText]);

  const saveCorrection = () => {
    if (!pending) return;
    // Gated on the Save button, which says this in muted words before the
    // press. Nothing typed YET is a PROMPT, not an alarm (class sweep,
    // 2026-09-16).
    if (!comment.trim()) return;
    setCorrections((list) => [
      ...list,
      {
        id: `${pending.start}-${pending.end}-${Date.now()}`,
        span: pending.span,
        start: pending.start,
        end: pending.end,
        comment: comment.trim(),
        voice: spoke,
        at: new Date().toISOString(),
      },
    ]);
    setPending(null);
    setComment("");
    setSpoke(false);
  };

  const readWorkFile = async (file: File) => {
    try {
      const text = await file.text();
      if (!text.trim()) {
        toast.error(`“${file.name}” came back empty — nothing to review.`);
        return;
      }
      setWorkText(text);
      if (!workTitle.trim()) setWorkTitle(file.name);
    } catch {
      toast.error(
        `We couldn't read “${file.name}”. Paste the text instead — this door reads plain text files only.`,
      );
    }
  };

  const distil = async () => {
    // WHAT THE EXPERT PUT IN IS A SOURCE (census D5) — kept BEFORE the run, so
    // the work is listed in Resources whether the distillation succeeds, fails,
    // or is rejoined after a reload. Its content identity is the same key the
    // server stamps on every rule from it, which is what joins the two.
    await recordPastedSource({
      rulebookId: rulebook.id,
      orgId: rulebook.organization_id,
      text: workText,
      sourceNote: workTitle,
      approach: "red_pen",
    });
    await run.launch(
      {
        rulebook_id: rulebook.id,
        work_text: workText,
        source_note: workTitle.trim() || undefined,
        corrections: corrections.map((c) => ({
          span: c.span,
          comment: c.comment,
          start: c.start,
          end: c.end,
          voice: c.voice,
          at: c.at,
        })),
      },
      workTitle.trim() || "the work you marked up",
    );
  };

  const shortBy = MIN_CORRECTIONS - corrections.length;

  return (
    <Dialog
      open={open}
      onOpenChange={durableRunDialogOnOpenChange({
        running,
        reset,
        onOpenChange,
        runLabel: "Reading your corrections",
      })}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="size-4 text-rose-500" aria-hidden />
            Mark up somebody else&rsquo;s work
            <AgentCredit mandate={MARKUP_MANDATE_KEY} />
          </DialogTitle>
          <DialogDescription>
            Review it the way you already do: highlight a passage, then say what
            is wrong with it and what you would do instead — type it, or press
            the microphone and say it. Every correction becomes a candidate
            rule carrying the passage you struck and your own words as its
            evidence. They arrive as drafts for you to approve one by one.
          </DialogDescription>
        </DialogHeader>

        {sitting.resumed ? (
          <SittingResumed
            what="the work you were marking up, and the corrections you had already saved"
            onDiscard={sitting.discard}
            onAcknowledge={sitting.acknowledge}
          />
        ) : null}

        <DurableRunFailure
          error={run.error}
          retry={run.retry}
          running={run.running}
        />
        <DurableRunStopped message={run.stoppedMessage} retry={run.retry} />

        {summary ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">{summary}</p>
            <Button
              size="sm"
              onClick={() => {
                reset();
                sitting.forget();
                setCorrections([]);
                setWorkText("");
                setWorkTitle("");
                setMarking(false);
                onOpenChange(false);
              }}
            >
              Review the drafts
            </Button>
          </div>
        ) : running || run.stages.length > 0 ? (
          <div className="space-y-2">
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {run.stages.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            {running ? (
              <div className="flex items-start gap-2">
                <LoadingSpinner size="sm" />
                <p className="text-xs text-muted-foreground">
                  {run.waitMessage ?? "Reading your corrections…"}
                </p>
              </div>
            ) : null}
          </div>
        ) : !marking ? (
          /* ── STEP 1: the piece of work ─────────────────────────────── */
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="red-pen-title">What is this? (optional)</Label>
              <Input
                id="red-pen-title"
                value={workTitle}
                onChange={(e) => setWorkTitle(e.target.value)}
                placeholder="Dan's draft launch email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="red-pen-work">
                Paste the work you were going to review
              </Label>
              <ProTextarea
                id="red-pen-work"
                value={workText}
                onChange={(e) => setWorkText(e.target.value)}
                placeholder="Paste the draft, the email, the proposal, the junior's output…"
                autoGrow
                minHeight={180}
                maxHeight={360}
              />
              {/* MOBILE (390px): this row gives 358px to a 115px nowrap button
                  label plus a two-line sentence. With neither `flex-wrap` on
                  the row nor `shrink-0` on the button, flexbox squeezed the
                  button's BOX to 87px while its own `whitespace-nowrap` label
                  kept its 115px width and `overflow: visible` painted it ON TOP
                  of the helper text — the sentence was unreadable and the
                  button read as starting off the left edge. Wrap the row, and
                  never let a nowrap label shrink below itself. */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={WORK_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void readWorkFile(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="mr-1.5 size-3.5" aria-hidden />
                  Upload a text file
                </Button>
                {/* NOTHING FAILS SILENTLY: the picker offers exactly what this
                    door can read, and says where the rest goes. */}
                <p className="text-xs text-muted-foreground">
                  Plain text or Markdown. A PDF or a recording goes through
                  &ldquo;Upload a file or recording&rdquo; instead.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ── STEP 2: the markup ────────────────────────────────────── */
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Drag across any part of the work below to mark it, then say what
              is wrong with it.{" "}
              {corrections.length === 0
                ? `Mark ${MIN_CORRECTIONS} before we can turn them into rules — a standard shows up across several, not one.`
                : shortBy > 0
                  ? `${corrections.length} marked — ${shortBy} more to go.`
                  : `${corrections.length} marked.`}
            </p>
            <div
              ref={workRef}
              onMouseUp={captureSelection}
              onTouchEnd={captureSelection}
              className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm leading-relaxed"
            >
              {segments.map((segment) => (
                <span
                  key={`${segment.start}-${segment.end}`}
                  data-work-start={segment.start}
                  className={cn(
                    segment.correctionId &&
                      segment.correctionId !== PENDING_ID &&
                      "rounded bg-rose-500/20 underline decoration-rose-500 decoration-wavy underline-offset-4",
                    segment.correctionId === PENDING_ID &&
                      "rounded bg-rose-500/30 font-medium ring-2 ring-rose-500/60",
                  )}
                >
                  {segment.text}
                </span>
              ))}
            </div>

            {pending ? (
              <div className="space-y-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-3">
                <p className="text-xs text-muted-foreground">
                  {/* Nothing is struck through anywhere on this screen — the
                      passage is highlighted. Say what the screen does. */}
                  The bit you highlighted, marked above:
                </p>
                <p className="text-sm italic text-foreground">
                  &ldquo;{pending.span}&rdquo;
                </p>
                <ProTextarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What's wrong with it, and what would you do instead?"
                  autoFocus
                  autoGrow
                  minHeight={80}
                  maxHeight={200}
                  enableVoice={VOICE_DEFAULT_ON}
                  onTranscriptionComplete={() => setSpoke(true)}
                />
                <div className="flex items-center gap-2">
                  <GatedActionButton
                    size="sm"
                    onClick={saveCorrection}
                    wrapperClassName="justify-start"
                    reason={firstBlockingReason([
                      {
                        when: !comment.trim(),
                        reason:
                          "Say what is wrong with it and what you would do instead",
                      },
                    ])}
                  >
                    Save this correction
                  </GatedActionButton>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPending(null);
                      setComment("");
                      setSpoke(false);
                    }}
                  >
                    Never mind
                  </Button>
                  {VOICE_DEFAULT_ON ? (
                    // "press the microphone" pointed at a control that only
                    // appears once the pointer is inside the box, so on a
                    // desktop first pass there was no microphone to press
                    // (jobs-bar-2026-09-16 lanes-b, item 4).
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mic className="size-3" aria-hidden />
                      or move onto the box above and use its microphone instead
                      of typing
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {corrections.length > 0 ? (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {corrections.map((correction, index) => (
                  <li
                    key={correction.id}
                    className="rounded-md border border-border bg-muted/30 p-2.5 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-xs italic text-muted-foreground">
                          {index + 1}. &ldquo;{correction.span}&rdquo;
                        </p>
                        <p className="text-sm text-foreground">
                          {correction.comment}
                        </p>
                        {correction.voice ? (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mic className="size-3" aria-hidden />
                            spoken
                          </p>
                        ) : null}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove correction ${index + 1}`}
                        onClick={() =>
                          setCorrections((list) =>
                            list.filter((c) => c.id !== correction.id),
                          )
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {summary ? null : (
          <DialogFooter>
            <DurableRunStopButton
              cancel={run.cancel}
              cancelling={run.cancelling}
              running={running}
              leaveLabel="Cancel"
              reason="stopped from the Red-Pen dialog"
              onLeave={() => {
                reset();
                onOpenChange(false);
              }}
            />
            {!marking ? (
              <GatedActionButton
                onClick={() => setMarking(true)}
                reason={firstBlockingReason([
                  {
                    when: workText.trim().length < MIN_WORK_CHARS,
                    reason:
                      "Paste the piece of work you were going to review (a few paragraphs at least)",
                  },
                ])}
              >
                Start marking it up
              </GatedActionButton>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setMarking(false)}
                  disabled={running}
                >
                  Back to the work
                </Button>
                <GatedActionButton
                  onClick={() => void distil()}
                  disabled={running}
                  reason={firstBlockingReason([
                    {
                      when: pending !== null,
                      reason:
                        "Finish the correction you are writing (or choose Never mind)",
                    },
                    {
                      when: shortBy > 0,
                      reason: `Mark ${shortBy} more ${shortBy === 1 ? "passage" : "passages"} — a standard shows up across several corrections, not one`,
                    },
                  ])}
                >
                  {/* "Distil 0 corrections" was the label a first-timer met on
                      arriving at this step — a zero on a button, in a verb the
                      rest of the product does not use (the Rulebook page's own
                      control says "Turn this into rules"). */}
                  {running
                    ? "Turning them into rules…"
                    : corrections.length === 0
                      ? "Turn your corrections into rules"
                      : `Turn ${corrections.length} correction${corrections.length === 1 ? "" : "s"} into rules`}
                </GatedActionButton>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
