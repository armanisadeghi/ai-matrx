"use client";

/**
 * Make clip — on every coverage mention and on any pasted link in the Press Room.
 *
 * The loop is CODE on the server (render → review → re-render, up to the org's
 * round knob); this dialog streams its milestones and shows the finished clip,
 * or says plainly that the client is not in the article and no clip was made.
 * A finished clip lands in the brand's clips gallery.
 */

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Scissors } from "lucide-react";

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
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useAppDispatch } from "@/lib/redux/hooks";

import { makePressClip, type MakeClipResult, type Stage } from "./api";
import { ClipView } from "./ClipView";
import { StageList } from "./StageList";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function MakeClipDialog({
  siteId,
  defaultUrl = "",
  defaultClientName = "",
  coverageMentionId = null,
  trigger,
}: {
  siteId: string;
  /** Set for a coverage mention (fixed); empty for a pasted link. */
  defaultUrl?: string;
  defaultClientName?: string;
  coverageMentionId?: string | null;
  trigger?: ReactNode;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(defaultUrl);
  const [client, setClient] = useState(defaultClientName);
  const [stages, setStages] = useState<Stage[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MakeClipResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fixedUrl = Boolean(coverageMentionId && defaultUrl);
  const clientName = client.trim() || defaultClientName;
  const canRun = isHttpUrl(url) && clientName.length > 0 && !running;

  const reset = () => {
    setStages([]);
    setResult(null);
    setError(null);
    setRunning(false);
    setUrl(defaultUrl);
    setClient(defaultClientName);
  };

  const run = async () => {
    setRunning(true);
    setStages([]);
    setResult(null);
    setError(null);
    try {
      const done = await makePressClip(
        dispatch,
        siteId,
        { url: url.trim(), client_name: clientName, coverage_mention_id: coverageMentionId },
        { onStage: (stage) => setStages((prev) => [...prev, stage]) },
      );
      setResult(done);
      if (done.status === "finished") {
        void queryClient.invalidateQueries({ queryKey: ["marketing", "press", "clips"] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running && !next) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]">
            <Scissors className="h-3 w-3" aria-hidden /> Make clip
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Make a press clip</DialogTitle>
          <DialogDescription>
            The article is rendered as a clean PDF that looks like the publication: its logo, headline, byline, photos and
            body, with ads and recirculation removed. A reviewer checks it against the live page and it is re-rendered with
            the fixes until it is clean or the round limit is reached. Takes a minute or two.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="clip-url">Article link</Label>
            <Input
              id="clip-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              disabled={fixedUrl || running}
              className="text-base sm:text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="clip-client">Who the clip is for</Label>
            <Input
              id="clip-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="The company named in the article"
              disabled={running}
              className="text-base sm:text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              If this name is not in the article, no clip is made — a clip never stretches an adjacent mention.
            </p>
          </div>
          <StageList stages={stages} running={running} />
          {error ? (
            <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <span>{error}</span>
              <ErrorAlchemyMenu error={error} />
            </div>
          ) : null}
          {result ? <ClipView result={result} /> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => void run()} disabled={!canRun}>
            <Scissors className="mr-1.5 h-4 w-4" aria-hidden />
            {running ? "Making the clip…" : result ? "Make it again" : "Make clip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
