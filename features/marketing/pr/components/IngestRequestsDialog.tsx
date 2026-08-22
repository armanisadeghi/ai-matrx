"use client";

/**
 * Paste a journalist-request digest and land it as site-scoped rows.
 *
 * The manual half of source-request ingestion: HARO / Source of Sources /
 * Qwoted digests arrive by EMAIL, so until standing provider webhooks exist the
 * honest entry point is "paste the email here". The server parses the digest,
 * screens every (request, site) pairing deterministically, creates one row per
 * genuinely matching site (the 2026-08-22 scoping ruling), and scores each row
 * with the responder mandate — which is minutes of model work on a big digest,
 * so the run streams its milestones and keeps going server-side if the dialog
 * is closed.
 *
 * The screen is LOUD by contract: the result names what was screened out and
 * why, never just what landed.
 */

import { useState } from "react";
import { Inbox, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch } from "@/lib/redux/hooks";

import {
  ingestSourceRequests,
  type IngestRequestsResult,
} from "@/features/marketing/pr/api";
import { PLATFORM_LABELS } from "@/features/marketing/pr/types";

/** The platforms whose digests users actually paste. */
const PASTEABLE_PLATFORMS = [
  "haro",
  "source_of_sources",
  "qwoted",
  "featured",
  "sourcebottle",
  "other",
] as const;

export function IngestRequestsDialog({
  siteId,
  onIngested,
}: {
  /** Scope the ingest to the Press Room's selected site. */
  siteId: string | null;
  /** Called after rows landed so the rail can refetch. */
  onIngested: () => void;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [platform, setPlatform] = useState<string>("haro");
  const [evaluate, setEvaluate] = useState(true);
  const [run, setRun] = useState<{
    running: boolean;
    stage: string | null;
    result: IngestRequestsResult | null;
    error: string | null;
  }>({ running: false, stage: null, result: null, error: null });

  const submit = async () => {
    if (!rawText.trim()) return;
    setRun({ running: true, stage: "Connecting", result: null, error: null });
    try {
      const result = await ingestSourceRequests(dispatch, rawText, {
        platform,
        evaluate,
        siteIds: siteId ? [siteId] : undefined,
        onStage: (stage) => setRun((current) => ({ ...current, stage })),
      });
      setRun({ running: false, stage: null, result, error: null });
      if (result.created > 0) onIngested();
    } catch (err) {
      setRun({
        running: false,
        stage: null,
        result: null,
        error: err instanceof Error ? err.message : "Ingest failed.",
      });
    }
  };

  const screenedOut = run.result?.outcomes.filter(
    (outcome) => outcome.outcome === "screened_out",
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setRun({ running: false, stage: null, result: null, error: null });
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-6 text-[10px]">
          <Inbox className="mr-1 h-3 w-3" aria-hidden />
          Add requests
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add journalist requests</DialogTitle>
          <DialogDescription>
            Paste a digest email (HARO, Source of Sources, Qwoted…). Each
            request is matched against this site and lands with a score and a
            drafted answer where the fit is real. Nothing is ever sent — you
            review every draft here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={
              "1) Looking for experts on…\nName: …\nMedia Outlet: …\nDeadline: 7:00 PM EST - 25 August\n\nQuery:\n…"
            }
            className="h-44 font-mono text-xs"
            disabled={run.running}
          />
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="ingest-platform" className="text-xs">
                From
              </Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="ingest-platform" className="h-7 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PASTEABLE_PLATFORMS.map((value) => (
                    <SelectItem key={value} value={value} className="text-xs">
                      {PLATFORM_LABELS[value] ?? value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="ingest-evaluate"
                checked={evaluate}
                onCheckedChange={setEvaluate}
                disabled={run.running}
              />
              <Label htmlFor="ingest-evaluate" className="text-xs">
                Score and draft now
              </Label>
            </div>
          </div>

          {run.running ? (
            <p className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {run.stage ?? "Connecting"}. The run keeps going on the server
              even if you close this.
            </p>
          ) : null}
          {run.error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
              {run.error}
            </p>
          ) : null}
          {run.result ? (
            <div className="space-y-1 rounded-md border border-border bg-muted/50 px-2.5 py-2 text-[11px] text-foreground">
              <p>
                {run.result.parsed} request
                {run.result.parsed === 1 ? "" : "s"} in the digest —{" "}
                {run.result.created} landed
                {run.result.drafted ? `, ${run.result.drafted} drafted` : ""}
                {run.result.duplicates
                  ? `, ${run.result.duplicates} already here`
                  : ""}
                .
              </p>
              {screenedOut && screenedOut.length > 0 ? (
                <p className="text-muted-foreground">
                  Not a fit for this site ({screenedOut.length}):{" "}
                  {screenedOut
                    .slice(0, 3)
                    .map((outcome) => outcome.query_title)
                    .join("; ")}
                  {screenedOut.length > 3 ? "…" : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={run.running || !rawText.trim() || !siteId}
          >
            {run.running ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Matching…
              </>
            ) : (
              "Match against this site"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
