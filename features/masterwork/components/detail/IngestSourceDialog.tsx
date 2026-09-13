"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { AgentCredit } from "../AgentCredit";
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
import type { IngestLane } from "../../browse/approachLane";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { Rulebook } from "../../types";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { formatFileSize } from "@ai-matrx/kit/format";
import { useRunOutcome } from "../../durable-run/useRunOutcome";
import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import { MASTERWORK_UPLOAD_ACCEPT } from "../../sourceTypes";
import {
  MonologueRecorder,
  describeDistillWait,
} from "../../record/MonologueRecorder";
import { recordPastedSource } from "../../record/pastedSource";

/**
 * "Add rules from a source" — the plop-in-a-book / talk-it-out flow. Two ways
 * in, one outcome:
 *
 * - PASTE the source text (a chapter, a playbook, a transcribed hour of
 *   talking) → `/masterworks/ingest`.
 * - UPLOAD a file (a PDF, a Word document, a recording of you explaining your
 *   method) → `/masterworks/ingest-file`. A document is read page by page
 *   so every rule comes back anchored to the page it came from; a recording is
 *   transcribed first. Uploads go through the canonical file handler
 *   (`useFileUpload`) — never a hand-rolled upload.
 *
 * Either way the system distills candidate rules, verifies every quote
 * word-for-word against the source, and lands them as DRAFTS the Expert
 * approves one by one. Never auto-activated (human-first).
 *
 * Both lanes are ONE durable run (`useMasterworkRun` →
 * `platform.masterwork_run`): reload mid-Distillation and this dialog picks
 * the run back up and reports the true outcome — the drafts summary survives a
 * refresh. THE FLOATING LAW: a run that dies on page refresh is the same
 * defect as a spinner.
 */

const INGEST_PATH = "/masterworks/ingest" satisfies keyof paths;
const INGEST_FILE_PATH = "/masterworks/ingest-file" satisfies keyof paths;
/**
 * THE TIMELINE LANE (census row 3, wired 2026-09-12). The `timeline` Approach
 * has been live and selectable since its registry row landed, with a real
 * server lane behind it (`aidream/services/distillation/timeline_ingest.py`) —
 * and no capture UI anywhere in the product, so choosing it created a bare,
 * empty Rulebook. It is a PASTE lane like `source`, with two differences that
 * are the whole point of it: a mandate segments the case into its own ordered
 * moments, and the ENDING is kept back from the distiller so the rules it
 * writes are forward-looking ("given what you know now, do X") instead of
 * hindsight. The ending is still stored, for the Audition to score against.
 */
const INGEST_TIMELINE_PATH =
  "/masterworks/ingest-timeline" satisfies keyof paths;

/**
 * THE MONOLOGUE (VOICE-FIRST) LANE, wired 2026-09-12. Arman's expertise
 * mandate puts "just talk" first; the server lane has existed since the
 * recording lane shipped (`file_ingest._ingest_recording` → transcription →
 * `_distill_transcript`, chunked by transcript time range, distilled through
 * `masterwork.monologue_distiller`, every rule anchored to the moment it was
 * said) and the `monologue` Approach was `enabled=false` purely because the
 * product had no door: an Expert who wanted to talk was sent to the generic
 * "Upload a file" card, i.e. told to go and make a recording somewhere else.
 *
 * It posts to the SAME endpoint as the file lane — a recording IS a file to
 * the server, which routes audio/video to the monologue distiller by content
 * type — so the door is a capture surface, not a second pipeline. What it adds
 * is the half that was missing: recording in the browser, through the
 * platform's one capture primitive (`useSimpleRecorder`).
 */
const MONOLOGUE_MANDATE_KEY = MANDATE_KEYS.masterwork__monologue_distiller;

/** Only a recording goes down this lane — a PDF is the `file` card's job. */
const MONOLOGUE_ACCEPT = "audio/*,video/*";

/** The server's own floor (`IngestTimelineRequest.text`, min_length=200). */
const MIN_SOURCE_CHARS = 200;

/** The published declaration shared with the server. */
const TIMELINE_MANDATE_KEY = MANDATE_KEYS.masterwork__timeline_distiller;

/** Documents come back with page anchors; audio/video is transcribed first. */
// THE ONE LIST (features/masterwork/sourceTypes.ts): the picker offers
// exactly what the server reads — never a hand-typed second copy.
const FILE_ACCEPT = MASTERWORK_UPLOAD_ACCEPT;

type IngestMode = "instructional" | "exemplar";
type SourceShape = "text" | "file";

const MODE_OPTIONS: {
  value: IngestMode;
  title: string;
  blurb: string;
}[] = [
  {
    value: "instructional",
    title: "It explains the method",
    blurb: "A chapter, a playbook, a transcript of you talking it through.",
  },
  {
    value: "exemplar",
    title: "It IS the finished work",
    blurb:
      "Examples of great output — the rules behind them get worked out for you.",
  },
];

/** The Distillation's terminal document, live or restored from the run row.
 * Shared with ChatImportDialog — both lanes emit `masterwork_ingest_complete`. */
export interface IngestSummary {
  added: number;
  duplicatesSkipped: number;
  /** Null when the lane did not report the word-for-word check at all. */
  quotesUnverified: number | null;
  /**
   * Pieces of the source the distiller could not read even after retrying
   * them smaller, and the words they held. Non-zero = rules are MISSING and
   * the summary says so first (2026-09-10: a whole chapter's method vanished
   * behind "14 rules added, every quote verified").
   */
  failedChunks: number;
  skippedWords: number;
  /**
   * Recording (monologue) lane only: a ready composer seed listing what the
   * expert touched but never explained — offered as "interview me about it".
   */
  followupSeed: string | null;
}

export function parseIngestSummary(raw: unknown): IngestSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  // `added` may legitimately be 0 (a source with nothing new in it), so its
  // PRESENCE is what makes this a result, never its truthiness.
  if (!("added" in data)) return null;
  return {
    added: Number(data.added ?? 0),
    duplicatesSkipped: Number(data.duplicates_skipped ?? 0),
    // ABSENT is not ZERO: a lane that never ran the word-for-word check must
    // not read as "every quote verified" (Bugbot, 2026-09-12).
    quotesUnverified:
      data.quotes_unverified === undefined || data.quotes_unverified === null
        ? null
        : Number(data.quotes_unverified),
    failedChunks: Number(data.failed_chunks ?? 0),
    skippedWords: Number(data.skipped_words ?? 0),
    followupSeed:
      typeof data.followup_seed === "string" && data.followup_seed.trim()
        ? data.followup_seed
        : null,
  };
}

export function describeIngest({
  added,
  duplicatesSkipped,
  quotesUnverified,
  failedChunks,
  skippedWords,
}: IngestSummary): string {
  const missing = describeMissingIngestParts({ failedChunks, skippedWords });
  return (
    (missing ? `${missing} ` : "") +
    `${added} suggested ${added === 1 ? "rule" : "rules"} added as drafts` +
    (duplicatesSkipped ? `, ${duplicatesSkipped} duplicates skipped` : "") +
    (quotesUnverified === null
      ? "."
      : quotesUnverified
        ? `. ${quotesUnverified} ${quotesUnverified === 1 ? "quote" : "quotes"} could not be verified word-for-word — those rules are flagged for your review.`
        : ". Every quote verified word-for-word against your source.")
  );
}

export function describeMissingIngestParts({
  failedChunks,
  skippedWords,
}: Pick<IngestSummary, "failedChunks" | "skippedWords">): string | null {
  if (failedChunks === 0) return null;
  return `Not all of it could be read: ${failedChunks} ${failedChunks === 1 ? "part" : "parts"} of your source (about ${skippedWords} words) failed even after being split smaller, so the rules from ${failedChunks === 1 ? "that part are" : "those parts are"} missing — paste ${failedChunks === 1 ? "it" : "them"} again on ${failedChunks === 1 ? "its" : "their"} own.`;
}

const SHAPE_OPTIONS: {
  value: SourceShape;
  title: string;
  blurb: string;
}[] = [
  {
    value: "text",
    title: "Paste the text",
    blurb: "You already have the words — a chapter, notes, a transcript.",
  },
  {
    value: "file",
    title: "Upload a file",
    blurb: "A document or a recording. We read or listen to it for you.",
  },
];

export function IngestSourceDialog({
  open,
  onOpenChange,
  rulebook,
  onIngested,
  onFollowupSeed,
  initialLane = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onIngested?: () => void;
  /**
   * The recording lane found things the expert didn't fully explain and the
   * user chose to be interviewed about them — the parent opens the Scout
   * interview panel with this composer seed.
   */
  onFollowupSeed?: (seed: string) => void;
  /**
   * Deep-link entry (the Approach picker's `?ingest=` param): pre-select the
   * lane so choosing an Approach lands ON that Approach, never on a default.
   * "source" = instructional text · "exemplar" = examples of best work ·
   * "file" = upload a file/recording · "timeline" = a case that unfolds in time.
   */
  initialLane?: IngestLane | null;
}) {
  const { upload } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // The timeline lane is its OWN dialog shape, not a mode of the source lane:
  // a case has no "is it the finished work?" question and no upload half, and
  // it carries one choice the others do not (whether to keep the ending back).
  const timeline = initialLane === "timeline";
  // The voice-first lane: record here, or upload a recording you already have.
  // No "is it the finished work?" question and no paste half — a person who
  // came here to talk is not choosing a source shape.
  const monologue = initialLane === "monologue";
  const [shape, setShape] = useState<SourceShape>(
    initialLane === "file" ? "file" : "text",
  );
  /** Timeline only: keep the ending out of the distiller (server default). */
  const [hideResolution, setHideResolution] = useState(true);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  /** Monologue only: how long the just-finished recording ran, for the
   *  measured wait promise (never a bare spinner). */
  const [recordedSeconds, setRecordedSeconds] = useState<number | null>(null);
  const [mode, setMode] = useState<IngestMode>(
    initialLane === "exemplar" ? "exemplar" : "instructional",
  );
  const [sourceNote, setSourceNote] = useState("");
  const [uploading, setUploading] = useState(false);

  /**
   * ONE durable run for the paste and upload lanes — they emit the SAME
   * terminal event (`masterwork_ingest_complete`; the file lane hands off to
   * the text lane for a transcript), so they are one run to the user and one
   * pointer to rejoin. `path` is read at launch time, which is what lets the
   * current lane choose its endpoint without a second hook.
   *
   * 🚨 THE TIMELINE LANE IS A DIFFERENT SURFACE, NOT A DIFFERENT PATH (Bugbot,
   * 2026-09-13). `useMasterworkRun` declares `timeline` as its own surface with
   * its own measured expectation precisely so a case distillation never shares
   * a durable-run pointer with a paste/upload distillation — and this dialog
   * launched every lane, timeline included, as `surface: "ingest"`. The pointer
   * key is `${surface}:${rulebookId}`, so one Rulebook's timeline run and its
   * source run wrote the SAME browser receipt: a reload could reopen the wrong
   * lane, and a later ingest could rejoin and report a timeline run's answer as
   * its own. The surface is the dialog the user is looking at, so it is chosen
   * here from the same `timeline` flag that chooses the copy and the endpoint.
   */
  const run = useMasterworkRun<IngestSummary>({
    surface: timeline ? "timeline" : "ingest",
    rulebookId: rulebook.id,
    path: timeline
      ? INGEST_TIMELINE_PATH
      : monologue || shape === "file"
        ? INGEST_FILE_PATH
        : INGEST_PATH,
    parseResult: parseIngestSummary,
  });
  const running = run.running || uploading;
  const summary = run.result ? describeIngest(run.result) : null;
  const progress = uploading
    ? [`Uploading “${file?.name ?? "your file"}”…`, ...run.stages]
    : run.stages;

  const reset = () => {
    run.reset();
    setUploading(false);
    setRecordedSeconds(null);
  };

  // Drafts that landed while the user was away still have to reach the page
  // behind this dialog.
  // Once per finished run, never once per render — the page hands a fresh
  // arrow down every render and its refresh re-renders the page (see
  // `useRunOutcome`).
  useRunOutcome(run, onIngested);

  useEffect(() => {
    if (run.error) toast.error(run.error);
  }, [run.error]);

  // A run picked back up after a reload has to be VISIBLE. Rejoining behind a
  // closed dialog would leave the user staring at a page that says nothing is
  // happening — the same defect as losing the run.
  const reopenedRef = useRef(false);
  useEffect(() => {
    if (reopenedRef.current || open || !run.running) return;
    reopenedRef.current = true;
    onOpenChange(true);
  }, [open, run.running, onOpenChange]);

  const ingest = async () => {
    if (timeline) {
      await ingestTimeline();
      return;
    }
    if (monologue) {
      // A recording IS a file to the server; the only difference is that the
      // person made it here, a moment ago.
      await ingestFile();
      return;
    }
    if (shape === "file") {
      await ingestFile();
      return;
    }
    if (text.trim().length < MIN_SOURCE_CHARS) {
      toast.error(
        "Paste a real chunk of source material first (at least a few paragraphs).",
      );
      return;
    }
    // WHAT YOU PASTE IS A SOURCE (census D5) — kept BEFORE the run, so it is
    // listed in Sources whether the distillation succeeds, fails, or is
    // rejoined after a reload that took `text` with it.
    await recordPastedSource({
      rulebookId: rulebook.id,
      orgId: rulebook.organization_id,
      text,
      sourceNote,
      // `instructional` is this dialog's word for the `source` Approach.
      approach: mode === "exemplar" ? "exemplar" : "source",
    });
    await run.launch(
      {
        rulebook_id: rulebook.id,
        text,
        mode,
        source_note: sourceNote.trim() || undefined,
      },
      sourceNote.trim() || "your pasted source",
    );
  };

  const ingestTimeline = async () => {
    if (text.trim().length < MIN_SOURCE_CHARS) {
      toast.error(
        "Paste the case as it happened — at least a few paragraphs, in order.",
      );
      return;
    }
    // The timeline lane is a paste lane too — same law (census D5).
    await recordPastedSource({
      rulebookId: rulebook.id,
      orgId: rulebook.organization_id,
      text,
      sourceNote,
      approach: "timeline",
    });
    await run.launch(
      {
        rulebook_id: rulebook.id,
        text,
        source_note: sourceNote.trim() || undefined,
        hide_resolution: hideResolution,
      },
      sourceNote.trim() || "your case",
    );
  };

  const ingestFile = async () => {
    if (!file) {
      toast.error(
        monologue
          ? "Record something, or choose a recording you already have."
          : "Choose a document or a recording first.",
      );
      return;
    }
    // The upload happens BEFORE the run exists — there is no run row to rejoin
    // until the server has the file, so a reload during the upload legitimately
    // loses only the upload, and nothing has been paid for yet.
    setUploading(true);
    let fileId: string;
    try {
      // The ONE upload path (features/files) — it creates the cld_files row
      // the server then reads, processes into pages, and distills.
      const uploaded = await upload(
        { kind: "file", file },
        {
          folderPath: "Masterwork/Sources",
          fileName: file.name,
          metadata: { sourceFeature: "masterwork", rulebook_id: rulebook.id },
        },
      );
      fileId = uploaded.fileId;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not upload that file";
      run.fail(message);
      return;
    } finally {
      setUploading(false);
    }

    await run.launch(
      {
        rulebook_id: rulebook.id,
        file_id: fileId,
        mode,
        source_note: sourceNote.trim() || file.name,
      },
      sourceNote.trim() || file.name,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {timeline
              ? "Add rules from a case"
              : monologue
                ? "Just talk \u2014 we'll do the rest"
                : "Add rules from a source"}
            {timeline ? (
              <AgentCredit
                mandate={TIMELINE_MANDATE_KEY}
              />
            ) : monologue ? (
              <AgentCredit mandate={MONOLOGUE_MANDATE_KEY} />
            ) : (
              <AgentCredit
                mandate={MANDATE_KEYS.masterwork__source_distiller}
                agent="masterwork_source_distiller"
              />
            )}
          </DialogTitle>
          <DialogDescription>
            {monologue
              ? "Talk through how you actually work \u2014 rambling is fine, and " +
                "you can pause whenever you like. It gets written down, your " +
                "rules are pulled out with the moment you said each one, and " +
                "anything you touched on but didn\u2019t explain comes back as " +
                "questions you can answer later. They arrive as drafts for you " +
                "to approve one by one."
              : timeline
              ? "Paste a case the way it actually happened — what you knew at each " +
                "moment, what you did next, and how it turned out. It gets read " +
                "step by step, and each step is judged knowing only what you knew " +
                "at the time, so the rules come back as \u201cgiven what you know now, " +
                "do X\u201d. They arrive as drafts for you to approve one by one."
              : "Bring in source material — paste a chapter or a playbook, or upload " +
                "a document or a recording of you explaining your method out loud. " +
                "The system distills candidate rules and adds them as drafts for you " +
                "to approve one by one. Nothing goes live without you."}
          </DialogDescription>
        </DialogHeader>

        {/* A failure STAYS on screen with its reason and a way out. It used to
            be a toast that removed itself, over a dialog that then showed the
            empty form again (census D4). */}
        <DurableRunFailure
          error={run.error}
          retry={run.retry}
          running={run.running}
        />

        {summary ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">{summary}</p>
            {run.result?.followupSeed ? (
              <p className="text-sm text-muted-foreground">
                The recording also touched on a few things without fully
                explaining them — want the interviewer to ask you about those?
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Review the drafts
              </Button>
              {run.result?.followupSeed && onFollowupSeed ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const seed = run.result?.followupSeed;
                    reset();
                    onOpenChange(false);
                    if (seed) onFollowupSeed(seed);
                  }}
                >
                  Interview me about the gaps
                </Button>
              ) : null}
            </div>
          </div>
        ) : running || progress.length > 0 ? (
          <div className="space-y-2">
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {progress.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            {running ? (
              <div className="flex items-start gap-2">
                <LoadingSpinner size="sm" />
                <p className="text-xs text-muted-foreground">
                  {run.waitMessage ?? "Uploading your file…"}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {timeline || monologue ? null : (
            <div className="space-y-1.5">
              <Label>What kind of source is it?</Label>
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    className={cn(
                      "rounded-md border p-2.5 text-left transition-colors",
                      mode === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-muted-foreground/40",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {opt.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {opt.blurb}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            )}
            {timeline || monologue ? null : (
            <div className="space-y-1.5">
              <Label>How do you want to bring it in?</Label>
              <div className="grid grid-cols-2 gap-2">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setShape(opt.value)}
                    className={cn(
                      "rounded-md border p-2.5 text-left transition-colors",
                      shape === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-muted-foreground/40",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {opt.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {opt.blurb}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            )}

            {monologue ? (
              <div className="space-y-3">
                {file ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                        {recordedSeconds !== null
                          ? ` \u00b7 ${describeDistillWait(recordedSeconds)}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Start over"
                      onClick={() => {
                        setFile(null);
                        setRecordedSeconds(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <MonologueRecorder
                    disabled={running}
                    onRecorded={(blob, seconds) => {
                      setRecordedSeconds(seconds);
                      // A recording is delivered as a real file with a real
                      // name, because it becomes a Source row the Expert will
                      // see listed later.
                      const stamp = new Date()
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ");
                      const ext =
                        (blob.type.split("/")[1] || "webm").split(";")[0];
                      setFile(
                        new File([blob], `Talking it through \u2014 ${stamp}.${ext}`, {
                          type: blob.type || "audio/webm",
                        }),
                      );
                    }}
                  />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={MONOLOGUE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    setRecordedSeconds(null);
                    setFile(e.target.files?.[0] ?? null);
                  }}
                />
                {file ? null : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Or upload a recording you already have
                  </button>
                )}
              </div>
            ) : !timeline && shape === "file" ? (
              <div className="space-y-1.5">
                <Label>The file</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_ACCEPT}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove the chosen file"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed border-border bg-card p-5 transition-colors hover:border-muted-foreground/40"
                  >
                    <FileUp className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Choose a document or a recording
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF, Word, text — or an audio/video recording, which gets
                      written down first.
                    </span>
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  A document is read page by page, so every rule it suggests
                  points back at the page it came from.
                </p>
              </div>
            ) : (
            <div className="space-y-1.5">
              <Label htmlFor="ingest-text">
                {timeline ? "The case, in the order it happened" : "The source material"}
              </Label>
              <ProTextarea
                id="ingest-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  timeline
                    ? "Paste the case in order — what was known at the start, what happened next, what you did about it, and how it ended."
                    : mode === "exemplar"
                      ? "Paste the finished work — one or several examples; separate them with blank lines."
                      : "Paste the text here — long is fine; it gets split automatically."
                }
                rows={10}
                enableTextStats
              />
            </div>
            )}
            {timeline ? (
              <label className="flex items-start gap-2.5 rounded-md border border-border bg-card p-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={hideResolution}
                  onChange={(e) => setHideResolution(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    Keep the ending back while the rules are written
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Recommended. A rule written by something that already knows
                    how it turned out is hindsight, not judgment. The ending is
                    still saved on this Rulebook, so a Masterwork can be scored
                    against what actually happened.
                  </span>
                </span>
              </label>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="ingest-note">
                Where is this from? (optional)
              </Label>
              <Input
                id="ingest-note"
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder={
                  timeline
                    ? "e.g. 'ED case 3, March 2026'"
                    : monologue
                      ? "e.g. 'how I triage a Monday morning'"
                      : "e.g. Chapter 3, or 'recorded call, Aug 10'"
                }
              />
            </div>
          </div>
        )}

        {!summary ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={running}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void ingest()}
              disabled={
                running ||
                (monologue && !file) ||
                (!timeline && !monologue && shape === "file" && !file)
              }
            >
              {running
                ? "Distilling…"
                : timeline
                  ? "Distill this case"
                  : monologue
                    ? "Distill what I said"
                    : "Distill rules"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
