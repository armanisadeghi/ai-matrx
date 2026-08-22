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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import type { paths } from "@/types/python-generated/api-types";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { Rulebook } from "../../types";

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

/** Documents come back with page anchors; audio/video is transcribed first. */
const FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.rtf,.epub,.pptx,audio/*,video/*";

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
  quotesUnverified: number;
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
    quotesUnverified: Number(data.quotes_unverified ?? 0),
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
}: IngestSummary): string {
  return (
    `${added} suggested ${added === 1 ? "rule" : "rules"} added as drafts` +
    (duplicatesSkipped ? `, ${duplicatesSkipped} duplicates skipped` : "") +
    (quotesUnverified
      ? `. ${quotesUnverified} ${quotesUnverified === 1 ? "quote" : "quotes"} could not be verified word-for-word — those rules are flagged for your review.`
      : ". Every quote verified word-for-word against your source.")
  );
}

/** Human size — a 3 KB file reading "0.0 MB" looks like a broken upload. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
   * "file" = upload a file/recording.
   */
  initialLane?: "source" | "exemplar" | "file" | null;
}) {
  const { upload } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [shape, setShape] = useState<SourceShape>(
    initialLane === "file" ? "file" : "text",
  );
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<IngestMode>(
    initialLane === "exemplar" ? "exemplar" : "instructional",
  );
  const [sourceNote, setSourceNote] = useState("");
  const [uploading, setUploading] = useState(false);

  /**
   * ONE durable run for both lanes — they emit the SAME terminal event
   * (`masterwork_ingest_complete`; the file lane hands off to the text lane
   * for a transcript), so they are one run to the user and one pointer to
   * rejoin. `path` is read at launch time, which is what lets the current lane
   * choose its endpoint without a second hook.
   */
  const run = useMasterworkRun<IngestSummary>({
    surface: "ingest",
    rulebookId: rulebook.id,
    path: shape === "file" ? INGEST_FILE_PATH : INGEST_PATH,
    parseResult: parseIngestSummary,
  });
  const running = run.running || uploading;
  const summary = run.result ? describeIngest(run.result) : null;
  const progress = uploading
    ? [`Uploading “${file?.name ?? "your file"}”…`, ...run.stages]
    : run.stages;
  const rejoining = run.status === "rejoining";

  const reset = () => {
    run.reset();
    setUploading(false);
  };

  // Drafts that landed while the user was away still have to reach the page
  // behind this dialog.
  useEffect(() => {
    if (run.result) onIngested?.();
  }, [run.result, onIngested]);

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
    if (shape === "file") {
      await ingestFile();
      return;
    }
    if (text.trim().length < 200) {
      toast.error(
        "Paste a real chunk of source material first (at least a few paragraphs).",
      );
      return;
    }
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

  const ingestFile = async () => {
    if (!file) {
      toast.error("Choose a document or a recording first.");
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
            Add rules from a source
            <AgentCredit
              mandate="masterwork.source_distiller"
              agent="masterwork_source_distiller"
            />
          </DialogTitle>
          <DialogDescription>
            Bring in source material — paste a chapter or a playbook, or upload
            a document or a recording of you explaining your method out loud.
            The system distills candidate rules and adds them as drafts for you
            to approve one by one. Nothing goes live without you.
          </DialogDescription>
        </DialogHeader>

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
                  {rejoining
                    ? "Picking this back up — it kept reading while you were away."
                    : "Working — this takes a minute."}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
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

            {shape === "file" ? (
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
                        {formatSize(file.size)}
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
              <Label htmlFor="ingest-text">The source material</Label>
              <ProTextarea
                id="ingest-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  mode === "exemplar"
                    ? "Paste the finished work — one or several examples; separate them with blank lines."
                    : "Paste the text here — long is fine; it gets split automatically."
                }
                rows={10}
                enableTextStats
              />
            </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ingest-note">
                Where is this from? (optional)
              </Label>
              <Input
                id="ingest-note"
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder="e.g. Chapter 3, or 'recorded call, Aug 10'"
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
              disabled={running || (shape === "file" && !file)}
            >
              {running ? "Distilling…" : "Distill rules"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
