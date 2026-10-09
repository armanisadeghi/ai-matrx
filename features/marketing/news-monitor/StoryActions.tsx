"use client";

/**
 * A person's controls on one story (NEWS-ENGINE-SPEC §5.3, R5 — "validation
 * offers, never blocks"): surface a withheld or watched story anyway, dismiss
 * one with a reason, and undo either. Every write is a `guardedUpdate` on
 * `seo.tracker_story` under its RLS; the next run honours it.
 */

import { useState } from "react";
import { EyeOff, Loader2, Megaphone, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STORY_DISMISS_REASONS,
  type StoryDismissReason,
  type TrackerStoryRow,
} from "@/features/marketing/data/coverage-types";
import { toast } from "@/lib/toast";

import {
  dismissStory,
  surfaceStoryAnyway,
  undoDismiss,
  undoSurfaceAnyway,
} from "./data";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

import { ProTextarea } from "@/components/official/ProTextarea";
const REASON_LABEL: Record<StoryDismissReason, string> = {
  off_beat: "Not our beat",
  not_news: "Not really news",
  wrong_entity: "About a different company or person",
  already_known: "We already knew",
  off_policy: "Against our brief",
  other: "Something else",
};

export function StoryActions({
  story,
  onChanged,
}: {
  story: TrackerStoryRow | undefined;
  /** Called with the updated row after any change lands. */
  onChanged: (row: TrackerStoryRow) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [reason, setReason] = useState<StoryDismissReason>("off_beat");
  const [note, setNote] = useState("");

  if (!story) return null;

  const act = async (label: string, run: () => Promise<TrackerStoryRow>, done: string) => {
    setBusy(label);
    try {
      const row = await run();
      onChanged(row);
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      onChanged(story);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const spinner = <Loader2 className="h-3 w-3 animate-spin" />;

  if (story.status === "dismissed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" data-story-action="dismissed">
        Dismissed{story.dismissed_reason ? ` — ${REASON_LABEL[story.dismissed_reason as StoryDismissReason] ?? humanizeIdentifier(story.dismissed_reason)}` : ""}
        <Button
          variant="quiet"
          disabled={Boolean(busy)}
          onClick={() => void act("undo-dismiss", () => undoDismiss(story), "Dismissal undone.")}
        >
          {busy === "undo-dismiss" ? spinner : <Undo2 className="h-3 w-3" />}
          Undo
        </Button>
      </span>
    );
  }

  const surfacedByPerson = story.status === "surfaced" && Boolean(story.surfaced_override_at);
  return (
    <span className="inline-flex items-center gap-1" data-story-action={story.status}>
      {surfacedByPerson ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-success">
          Surfaced by you
          <Button
            variant="quiet"
            disabled={Boolean(busy)}
            onClick={() =>
              void act(
                "undo-surface",
                () => undoSurfaceAnyway(story),
                "Undone — the story is back on the watch list.",
              )
            }
          >
            {busy === "undo-surface" ? spinner : <Undo2 className="h-3 w-3" />}
            Undo
          </Button>
        </span>
      ) : story.status !== "surfaced" ? (
        <Button
          variant="outline"
          disabled={Boolean(busy)}
          title="Bring this story to you even though the monitor held it back. The next run keeps it."
          onClick={() =>
            void act("surface", () => surfaceStoryAnyway(story), "Surfaced. You can undo this.")
          }
        >
          {busy === "surface" ? spinner : <Megaphone className="h-3 w-3" />}
          Surface anyway
        </Button>
      ) : null}
      <Button
        icon={<EyeOff />}
        variant="quiet"
        disabled={Boolean(busy)}
        onClick={() => setDismissOpen(true)}
      >
        Dismiss
      </Button>
      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dismiss this story</DialogTitle>
            <DialogDescription>
              {story.title} — it leaves your lists and later runs keep it dismissed. Your reason
              teaches the monitor what to skip. You can undo this.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Select value={reason} onValueChange={(v) => setReason(v as StoryDismissReason)}>
              <SelectTrigger aria-label="Why dismiss">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORY_DISMISS_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REASON_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ProTextarea minHeight={64}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything else the monitor should know (optional)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="primary"
              disabled={Boolean(busy)}
              onClick={async () => {
                const ok = await act(
                  "dismiss",
                  () => dismissStory(story, reason, note),
                  "Dismissed. You can undo this.",
                );
                if (ok) {
                  setDismissOpen(false);
                  setNote("");
                }
              }}
            >
              {busy === "dismiss" ? spinner : <EyeOff className="h-3.5 w-3.5" />}
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
