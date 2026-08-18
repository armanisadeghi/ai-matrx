"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileUp, Link2, X } from "lucide-react";
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
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";
import type { paths } from "@/types/python-generated/api-types";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { Rulebook } from "../../types";

/**
 * "Everything you've published" — the `body_of_work` Distillation Approach.
 *
 * The Expert hands over their whole body of published work in ONE gesture:
 * drag in files AND paste links. The server seeds one durable row per piece
 * (`platform.masterwork_corpus_item`), reads each piece through the existing
 * lanes, and — when every piece has finished — runs ONE synthesis pass for the
 * cross-piece rules only the whole body of work can show.
 *
 * The board below the launch form is DERIVED FROM THE DATABASE (phase 6 of the
 * durable-work-queue standard): one row per piece with its live status, read
 * directly via supabase-js and refreshed while the run is going. Close the
 * laptop mid-run and come back — the run continues server-side, the dialog
 * rejoins (`useMasterworkRun`), and the board rebuilds from the rows. A piece
 * that fails does so honestly on its own row, never sinking the rest;
 * pressing the button again retries ONLY the failed pieces.
 *
 * TWO HOSTS, ONE IMPLEMENTATION (Arman's ruling: every creation/working mode
 * gets a real URL): the Rulebook page's dialog (`variant="dialog"`, default,
 * with a "Full page" door) and the route `/masterwork/[id]/body-of-work`
 * (`variant="page"`) both render exactly this component, so the two entry
 * points can never drift apart. `?body_of_work=1` on the detail page keeps
 * opening the dialog.
 */

const INGEST_CORPUS_PATH = "/masterworks/ingest-corpus" satisfies keyof paths;
const FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.rtf,.epub,.pptx,audio/*,video/*";
const MAX_PIECES = 80;
const BOARD_REFRESH_MS = 4000;

interface CorpusSummary {
  added: number;
  duplicatesSkipped: number;
  quotesUnverified: number;
}

function parseCorpusSummary(raw: unknown): CorpusSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!("added" in data)) return null;
  return {
    added: Number(data.added ?? 0),
    duplicatesSkipped: Number(data.duplicates_skipped ?? 0),
    quotesUnverified: Number(data.quotes_unverified ?? 0),
  };
}

interface CorpusPieceRow {
  id: string;
  kind: string;
  rawValue: string;
  label: string | null;
  status: string;
  rulesAdded: number;
  errorMessage: string | null;
}

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting", className: "text-muted-foreground" },
  in_progress: { label: "Reading", className: "text-primary" },
  succeeded: { label: "Distilled", className: "text-emerald-600 dark:text-emerald-400" },
  failed: { label: "Couldn't read", className: "text-destructive" },
  dead_letter: { label: "Gave up", className: "text-destructive" },
};

/** Split a pasted blob of links into individual URLs, forgivingly. */
function parseUrls(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const BODY_OF_WORK_DESCRIPTION =
  "Hand over your published work in one go — drag in files and paste links. " +
  "Each piece is read and distilled on its own, then the patterns you always " +
  "follow are worked out from the whole body of work. Everything lands as " +
  "drafts for you to approve; nothing goes live without you.";

export function BodyOfWorkDialog({
  open,
  onOpenChange,
  rulebook,
  onIngested,
  variant = "dialog",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onIngested?: () => void;
  /** "page" renders the same lane bare for /masterwork/[id]/body-of-work. */
  variant?: "dialog" | "page";
}) {
  const { upload } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [urlsText, setUrlsText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [board, setBoard] = useState<CorpusPieceRow[]>([]);

  const run = useMasterworkRun<CorpusSummary>({
    surface: "corpus",
    rulebookId: rulebook.id,
    path: INGEST_CORPUS_PATH,
    parseResult: parseCorpusSummary,
  });
  const running = run.running || uploading;
  const rejoining = run.status === "rejoining";

  /** Phase 6 — progress derives from live counts over queue state. */
  const refreshBoard = useCallback(async () => {
    const { data, error } = await supabase
      .schema("platform")
      .from("masterwork_corpus_item")
      .select("id,kind,raw_value,label,status,rules_added,error")
      .eq("rulebook_id", rulebook.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return; // transient board misses are cosmetic; the run is truth
    setBoard(
      (data ?? []).map((row) => {
        const err = row.error as { message?: unknown } | null;
        return {
          id: row.id,
          kind: row.kind,
          rawValue: row.raw_value,
          label: row.label,
          status: row.status,
          rulesAdded: row.rules_added,
          errorMessage:
            err && typeof err.message === "string" ? err.message : null,
        };
      }),
    );
  }, [rulebook.id]);

  useEffect(() => {
    if (!open) return;
    void refreshBoard();
    if (!run.running) return;
    const timer = setInterval(() => void refreshBoard(), BOARD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, run.running, refreshBoard]);

  useEffect(() => {
    if (run.result) {
      void refreshBoard();
      onIngested?.();
    }
  }, [run.result, onIngested, refreshBoard]);

  useEffect(() => {
    if (run.error) toast.error(run.error);
  }, [run.error]);

  // A run picked back up after a reload must be VISIBLE (same rule as the
  // source dialog): rejoining behind a closed dialog reads as "nothing is
  // happening", which is the defect durability exists to kill.
  const reopenedRef = useRef(false);
  useEffect(() => {
    if (reopenedRef.current || open || !run.running) return;
    reopenedRef.current = true;
    onOpenChange(true);
  }, [open, run.running, onOpenChange]);

  const pieceCount = files.length + parseUrls(urlsText).length;

  const launch = async () => {
    const urls = parseUrls(urlsText);
    if (files.length === 0 && urls.length === 0) {
      toast.error("Add at least one file or paste at least one link first.");
      return;
    }
    if (files.length + urls.length > MAX_PIECES) {
      toast.error(
        `That's more than ${MAX_PIECES} pieces — split your body of work into batches. Every batch lands on this same Rulebook.`,
      );
      return;
    }

    // Uploads happen BEFORE the run exists (nothing paid for yet); each file
    // goes through the ONE canonical upload path.
    const fileIds: string[] = [];
    if (files.length > 0) {
      setUploading(true);
      try {
        for (const [index, file] of files.entries()) {
          setUploadProgress(
            `Uploading “${file.name}” (${index + 1} of ${files.length})…`,
          );
          const uploaded = await upload(
            { kind: "file", file },
            {
              folderPath: "Masterwork/Sources",
              fileName: file.name,
              metadata: { sourceFeature: "masterwork", rulebook_id: rulebook.id },
            },
          );
          fileIds.push(uploaded.fileId);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not upload a file";
        run.fail(message);
        setUploading(false);
        setUploadProgress(null);
        return;
      }
      setUploading(false);
      setUploadProgress(null);
    }

    await run.launch(
      {
        rulebook_id: rulebook.id,
        urls,
        file_ids: fileIds,
        mode: "exemplar",
        source_note: sourceNote.trim() || undefined,
      },
      sourceNote.trim() || "your published work",
    );
    void refreshBoard();
  };

  const reset = () => {
    run.reset();
    setUploading(false);
    setUploadProgress(null);
  };

  const summary = run.result;
  const failedPieces = board.filter(
    (p) => p.status === "failed" || p.status === "dead_letter",
  );

  /**
   * Retry ONLY the failed/dead_letter pieces, straight from the durable board —
   * so a retry survives a reload (the form is empty then, but the rows aren't).
   * Re-submitting a failed piece is the server's re-open signal: explicit new
   * intent, a fresh retry budget; succeeded pieces are skipped, never re-paid.
   */
  const retryFailed = async () => {
    const urls = failedPieces
      .filter((p) => p.kind === "url")
      .map((p) => p.rawValue);
    const fileIds = failedPieces
      .filter((p) => p.kind !== "url")
      .map((p) => p.rawValue);
    run.reset();
    await run.launch(
      {
        rulebook_id: rulebook.id,
        urls,
        file_ids: fileIds,
        mode: "exemplar",
        source_note: sourceNote.trim() || undefined,
      },
      "retrying the failed pieces",
    );
    void refreshBoard();
  };

  const content = (
    <>
        {summary ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              {summary.added} suggested{" "}
              {summary.added === 1 ? "rule" : "rules"} added as drafts
              {summary.duplicatesSkipped
                ? `, ${summary.duplicatesSkipped} duplicates skipped`
                : ""}
              .
            </p>
            {failedPieces.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {failedPieces.length}{" "}
                {failedPieces.length === 1 ? "piece" : "pieces"} couldn&apos;t
                be read (each row below says why). &ldquo;Try the failed
                pieces again&rdquo; retries just those — everything already
                distilled is never re-read.
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
              {failedPieces.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void retryFailed()}
                >
                  Try the failed pieces again
                </Button>
              ) : null}
            </div>
          </div>
        ) : running || run.stages.length > 0 ? (
          <div className="space-y-2">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {(uploadProgress
                ? [uploadProgress, ...run.stages]
                : run.stages
              ).map((line, i) => (
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
                    : "This keeps running on our servers even if you close this or reload — come back anytime and it picks up where it left off."}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Your files</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  const chosen = Array.from(e.target.files ?? []);
                  if (chosen.length) setFiles((prev) => [...prev, ...chosen]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              {files.length > 0 ? (
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                    >
                      <p className="truncate text-sm text-foreground">
                        {file.name}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        aria-label={`Remove ${file.name}`}
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed border-border bg-card p-4 transition-colors hover:border-muted-foreground/40"
              >
                <FileUp className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {files.length
                    ? "Add more files"
                    : "Choose your published pieces"}
                </span>
                <span className="text-xs text-muted-foreground">
                  PDFs, Word docs, text — or recordings. Pick as many as you
                  like.
                </span>
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="corpus-urls">
                <span className="inline-flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" /> Links to your published work
                </span>
              </Label>
              <ProTextarea
                id="corpus-urls"
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder={
                  "Paste links, one per line —\nhttps://yoursite.com/your-best-article\nhttps://yoursite.com/another-piece"
                }
                rows={5}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="corpus-note">
                Where is this body of work from? (optional)
              </Label>
              <Input
                id="corpus-note"
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder="e.g. my blog, 2019-2026"
              />
            </div>
          </div>
        )}

        {board.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              The pieces of this body of work
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {board.map((piece) => {
                const status =
                  STATUS_COPY[piece.status] ?? STATUS_COPY.pending;
                const name = piece.label || piece.rawValue;
                return (
                  <div
                    key={piece.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <p
                      className="min-w-0 truncate text-foreground"
                      title={piece.errorMessage ?? piece.rawValue}
                    >
                      {name}
                    </p>
                    <p className={cn("shrink-0", status.className)}>
                      {piece.status === "succeeded" && piece.rulesAdded
                        ? `${status.label} — ${piece.rulesAdded} ${piece.rulesAdded === 1 ? "rule" : "rules"}`
                        : status.label}
                    </p>
                  </div>
                );
              })}
            </div>
            {!summary && !running && failedPieces.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-1"
                onClick={() => void retryFailed()}
              >
                Retry the {failedPieces.length} failed{" "}
                {failedPieces.length === 1 ? "piece" : "pieces"}
              </Button>
            ) : null}
          </div>
        ) : null}

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
              {variant === "page" ? "Back to the Rulebook" : "Cancel"}
            </Button>
            <Button onClick={() => void launch()} disabled={running}>
              {running
                ? "Distilling…"
                : pieceCount > 0
                  ? `Distill my body of work (${pieceCount} ${pieceCount === 1 ? "piece" : "pieces"})`
                  : "Distill my body of work"}
            </Button>
          </DialogFooter>
        ) : null}
    </>
  );

  if (variant === "page") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {BODY_OF_WORK_DESCRIPTION}
        </p>
        {content}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Everything you&apos;ve published
            {/* THE DOOR LAW — this working mode has its own URL. */}
            <Link
              href={`/masterwork/${rulebook.id}/body-of-work`}
              className="ml-auto mr-6 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
              title="Open this as its own page"
            >
              <ExternalLink className="h-3 w-3" />
              Full page
            </Link>
          </DialogTitle>
          <DialogDescription>{BODY_OF_WORK_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
