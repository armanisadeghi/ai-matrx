"use client";

import { useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { extractErrorMessage } from "@/utils/errors";
import type { paths } from "@/types/python-generated/api-types";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import type { ExpertisePack } from "../../types";

/**
 * "Add rules from a source" — the plop-in-a-book / talk-it-out flow. Two ways
 * in, one outcome:
 *
 * - PASTE the source text (a chapter, a playbook, a transcribed hour of
 *   talking) → `/expertise-desks/ingest`.
 * - UPLOAD a file (a PDF, a Word document, a recording of you explaining your
 *   method) → `/expertise-desks/ingest-file`. A document is read page by page
 *   so every rule comes back anchored to the page it came from; a recording is
 *   transcribed first. Uploads go through the canonical file handler
 *   (`useFileUpload`) — never a hand-rolled upload.
 *
 * Either way the system distills candidate rules, verifies every quote
 * word-for-word against the source, and lands them as DRAFTS the expert
 * approves one by one. Never auto-activated (human-first).
 */

const INGEST_PATH = "/expertise-desks/ingest" satisfies keyof paths;
const INGEST_FILE_PATH = "/expertise-desks/ingest-file" satisfies keyof paths;

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
  pack,
  onIngested,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pack: ExpertisePack;
  onIngested?: () => void;
}) {
  const dispatch = useAppDispatch();
  const { upload } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [shape, setShape] = useState<SourceShape>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<IngestMode>("instructional");
  const [sourceNote, setSourceNote] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const reset = () => {
    setProgress([]);
    setSummary(null);
    setRunning(false);
  };

  /**
   * Both lanes emit the SAME two events (`expertise_ingest_progress` /
   * `expertise_ingest_complete`) — the file lane hands off to the text lane
   * for a transcript — so one handler serves both.
   *
   * A `fatal_error` arrives as an `error` EVENT on the stream, never as
   * `result.error` (that is only the HTTP-level failure). The server writes
   * those messages for this user ("This source is too large…", "Only the
   * pack's owner…") — dropping them leaves a dead dialog, so they are
   * captured here and rethrown by the caller.
   */
  const streamFatal = useRef<string | null>(null);

  const handleStreamEvent = (event: { event: string; data?: unknown }) => {
    if (event.event === "error") {
      const payload = event.data as { message?: string; user_message?: string };
      streamFatal.current =
        payload?.user_message || payload?.message || "The source could not be read.";
      return;
    }
    if (event.event !== "data") return;
    const data = event.data as Record<string, unknown>;
    if (data.type === "expertise_ingest_progress") {
      setProgress((prev) => [...prev, String(data.message ?? "")]);
    } else if (data.type === "expertise_ingest_complete") {
      const added = Number(data.added ?? 0);
      const dupes = Number(data.duplicates_skipped ?? 0);
      const unverified = Number(data.quotes_unverified ?? 0);
      setSummary(
        `${added} suggested ${added === 1 ? "rule" : "rules"} added as drafts` +
          (dupes ? `, ${dupes} duplicates skipped` : "") +
          (unverified
            ? `. ${unverified} ${unverified === 1 ? "quote" : "quotes"} could not be verified word-for-word — those rules are flagged for your review.`
            : ". Every quote verified word-for-word against your source."),
      );
    }
  };

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
    setRunning(true);
    setProgress(["Reading the source…"]);
    setSummary(null);
    streamFatal.current = null;
    try {
      const result = await dispatch(
        callApi({
          path: INGEST_PATH,
          method: "POST",
          body: {
            pack_id: pack.id,
            text: text,
            mode,
            source_note: sourceNote.trim() || undefined,
          } as never,
          stream: true,
          onStreamEvent: handleStreamEvent,
        }),
      );
      if (streamFatal.current) throw new Error(streamFatal.current);
      if (result.error) throw new Error(extractErrorMessage(result.error));
      onIngested?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not ingest the source";
      setProgress((prev) => [...prev, `Problem: ${message}`]);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const ingestFile = async () => {
    if (!file) {
      toast.error("Choose a document or a recording first.");
      return;
    }
    setRunning(true);
    setProgress([`Uploading “${file.name}”…`]);
    setSummary(null);
    streamFatal.current = null;
    try {
      // The ONE upload path (features/files) — it creates the cld_files row
      // the server then reads, processes into pages, and distills.
      const uploaded = await upload(
        { kind: "file", file },
        {
          folderPath: "Expertise/Sources",
          fileName: file.name,
          metadata: { sourceFeature: "expertise", expertise_pack_id: pack.id },
        },
      );
      setProgress((prev) => [...prev, "Uploaded. Reading it…"]);

      const result = await dispatch(
        callApi({
          path: INGEST_FILE_PATH,
          method: "POST",
          body: {
            pack_id: pack.id,
            file_id: uploaded.fileId,
            mode,
            source_note: sourceNote.trim() || file.name,
          } as never,
          stream: true,
          onStreamEvent: handleStreamEvent,
        }),
      );
      if (streamFatal.current) throw new Error(streamFatal.current);
      if (result.error) throw new Error(extractErrorMessage(result.error));
      onIngested?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not read that file";
      setProgress((prev) => [...prev, `Problem: ${message}`]);
      toast.error(message);
    } finally {
      setRunning(false);
    }
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
          <DialogTitle>Add rules from a source</DialogTitle>
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
            <Button
              size="sm"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Review the drafts
            </Button>
          </div>
        ) : running || progress.length > 1 ? (
          <div className="space-y-2">
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {progress.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            {running ? <LoadingSpinner size="sm" /> : null}
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
              <Textarea
                id="ingest-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  mode === "exemplar"
                    ? "Paste the finished work — one or several examples; separate them with blank lines."
                    : "Paste the text here — long is fine; it gets split automatically."
                }
                rows={10}
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
