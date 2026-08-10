"use client";

import { useState } from "react";
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
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import type { paths } from "@/types/python-generated/api-types";
import type { ExpertisePack } from "../../types";

/**
 * "Add rules from a source" — the plop-in-a-book / talk-it-out flow. Paste
 * the source text (a chapter, a playbook, a transcribed hour of talking);
 * the system splits it into chunks, distills candidate rules from each,
 * verifies every quote word-for-word against the source, and lands them as
 * DRAFTS the expert approves one by one. Never auto-activated (human-first).
 */

// TODO(expertise): drop this cast once aidream's OpenAPI regen lands the path
// in types/python-generated/api-types.ts.
const INGEST_PATH = "/expertise-desks/ingest" as unknown as keyof paths;

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
  const [text, setText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const reset = () => {
    setProgress([]);
    setSummary(null);
    setRunning(false);
  };

  const ingest = async () => {
    if (text.trim().length < 200) {
      toast.error(
        "Paste a real chunk of source material first (at least a few paragraphs).",
      );
      return;
    }
    setRunning(true);
    setProgress(["Reading the source…"]);
    setSummary(null);
    try {
      const result = await dispatch(
        callApi({
          path: INGEST_PATH,
          method: "POST",
          body: {
            pack_id: pack.id,
            text: text,
            source_note: sourceNote.trim() || undefined,
          } as never,
          stream: true,
          onStreamEvent: (event) => {
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
          },
        }),
      );
      if (result.error) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "The ingestion reported a problem.",
        );
      }
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
            Paste source material — a chapter, a playbook, or a transcript of
            you explaining your method out loud. The system distills candidate
            rules and adds them as drafts for you to approve one by one.
            Nothing goes live without you.
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
              <Label htmlFor="ingest-text">The source material</Label>
              <Textarea
                id="ingest-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the text here — long is fine; it gets split automatically."
                rows={10}
              />
            </div>
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
            <Button onClick={() => void ingest()} disabled={running}>
              {running ? "Distilling…" : "Distill rules"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
