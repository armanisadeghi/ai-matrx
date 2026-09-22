"use client";

/**
 * "Load sample data from a Library" — the reverse of the media catalog's own
 * door.
 *
 * The catalog publishes a per-item Library Action, `use_as_agent_test_cases`,
 * that turns catalogued items with transcripts into `agent.exemplar`
 * candidates for one agent. Standing inside the Library you pick an agent;
 * standing inside the agent — here — you pick a Library. It is the SAME action
 * through the SAME door: `POST /media/libraries/{id}/jobs` via
 * `createJob`. This dialog NEVER writes an `agent.exemplar` row itself; a
 * second writer would drift from the server's provenance the day either side
 * changed.
 *
 * THE JOB IS ASYNCHRONOUS AND THIS SCREEN SAYS SO. The POST returns a job, not
 * test cases. So the confirmation names what actually happened — N items sent —
 * then watches the samples list a bounded number of times and, if nothing has
 * landed by then, says that plainly and leaves a refresh in the person's hand
 * instead of pretending.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Library, Loader2, CircleAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  createJob,
  listLibraries,
  listVideos,
  MediaApiError,
} from "@/features/source-library/api";
import type { LibraryRow, VideoRow } from "@/features/source-library/types";
import { fetchAgentSamples } from "@/features/agents/samples/service";

/**
 * The action reads transcripts (`requires_transcripts: true` in its server
 * declaration), so a Library whose items have none has nothing to give. That
 * is a sentence with a remedy, never an empty list and never a dead button.
 */
export interface LibraryReadiness {
  canStart: boolean;
  sentence: string | null;
}

export function libraryReadiness(input: {
  libraryName: string;
  readyCount: number;
  totalCount: number;
}): LibraryReadiness {
  if (input.readyCount > 0) return { canStart: true, sentence: null };
  if (input.totalCount === 0) {
    return {
      canStart: false,
      sentence: `${input.libraryName} has no catalogued items yet. Sync it in the Library first, then transcribe the items you want to teach this agent with.`,
    };
  }
  return {
    canStart: false,
    sentence: `None of the ${input.totalCount} items in ${input.libraryName} have a transcript yet, and a test case is made from the transcript. Transcribe them in the Library first, then come back.`,
  };
}

/** How many times the dialog looks for the written rows before saying it stopped. */
const WATCH_ATTEMPTS = 6;
const WATCH_INTERVAL_MS = 4000;
/**
 * One page of catalogued items — the honest ceiling the copy names. How big it
 * is belongs to the organization (a large-library owner wants more), never to
 * this file: law 6, `platform.feature_knob` row `agents.samples`
 * `library_page_size`, read through the one cached register read.
 */
const ITEM_PAGE_SIZE_KNOB = { feature: "agents.samples", key: "library_page_size" };

type Phase =
  | { kind: "choosing" }
  | { kind: "sending" }
  | { kind: "watching"; sent: number }
  | { kind: "arrived"; sent: number }
  | { kind: "quiet"; sent: number };

function describeMediaError(caught: unknown, fallback: string): string {
  if (caught instanceof MediaApiError) {
    return caught.remedy ? `${caught.message} ${caught.remedy}` : caught.message;
  }
  if (caught instanceof Error && caught.message) return caught.message;
  return fallback;
}

export interface LoadFromLibraryDialogProps {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Re-read the samples list — called on every watch pass and at the end. */
  onSamplesChanged: () => Promise<void> | void;
}

export function LoadFromLibraryDialog({
  agentId,
  open,
  onOpenChange,
  onSamplesChanged,
}: LoadFromLibraryDialogProps) {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const itemPageSize = useCallback(async (): Promise<number> => {
    if (!organizationId) {
      throw new Error(
        "This dialog cannot tell how many Library items to load because no organization is " +
          "active yet. Reopen it once your workspace has finished loading.",
      );
    }
    const raw = await ensureEffectiveKnob(organizationId, userId, ITEM_PAGE_SIZE_KNOB);
    const limit = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error(
        `The setting "${ITEM_PAGE_SIZE_KNOB.feature}.${ITEM_PAGE_SIZE_KNOB.key}" is ` +
          `${JSON.stringify(raw)}, which is not a number of items. Fix it in settings; nothing ` +
          "here will guess a page size.",
      );
    }
    return limit;
  }, [organizationId, userId]);

  const [libraries, setLibraries] = useState<LibraryRow[]>([]);
  const [librariesLoading, setLibrariesLoading] = useState(false);
  const [libraryId, setLibraryId] = useState<string>("");

  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [readyTotal, setReadyTotal] = useState(0);
  const [videosLoading, setVideosLoading] = useState(false);
  const [chosenIds, setChosenIds] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "choosing" });

  const chosenLibrary = libraries.find((row) => row.id === libraryId) ?? null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPhase({ kind: "choosing" });
    setLibrariesLoading(true);
    void (async () => {
      try {
        const response = await listLibraries(dispatch, { limit: 50 });
        setLibraries(response.libraries);
      } catch (caught) {
        setError(
          describeMediaError(caught, "Your Libraries could not be read."),
        );
      } finally {
        setLibrariesLoading(false);
      }
    })();
  }, [dispatch, open]);

  const loadVideos = useCallback(
    async (id: string) => {
      setVideosLoading(true);
      setError(null);
      try {
        // THE PAGE SIZE IS THE ORGANIZATION'S, AWAITED — never a constant and
        // never a stale render value. `ensureEffectiveKnob` shares the ONE
        // register fetch every other reader on the page uses, so this costs no
        // round trip of its own; an unseeded or unreadable row raises by name
        // and lands in the dialog's own error line rather than quietly loading
        // a page size nobody chose (law 4).
        const limit = await itemPageSize();
        const response = await listVideos(dispatch, id, {
          transcript_status: ["ready"],
          limit,
          order: "published_at",
          direction: "desc",
        });
        setVideos(response.videos);
        setTotalCount(response.total);
        setReadyTotal(response.filtered_total);
        setChosenIds(response.videos.map((video) => video.id));
      } catch (caught) {
        setVideos([]);
        setTotalCount(0);
        setReadyTotal(0);
        setChosenIds([]);
        setError(
          describeMediaError(
            caught,
            "That Library's items could not be read.",
          ),
        );
      } finally {
        setVideosLoading(false);
      }
    },
    [dispatch, itemPageSize],
  );

  const readiness = chosenLibrary
    ? libraryReadiness({
        libraryName: chosenLibrary.name,
        readyCount: readyTotal,
        totalCount: totalCount,
      })
    : null;

  async function countLibrarySamples(): Promise<number> {
    const rows = await fetchAgentSamples(agentId);
    return rows.filter((row) => row.source === "library").length;
  }

  async function watchForRows(before: number, sent: number) {
    for (let attempt = 0; attempt < WATCH_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, WATCH_INTERVAL_MS));
      let now = before;
      try {
        now = await countLibrarySamples();
      } catch {
        // The watch is a convenience; its failure never overwrites the
        // confirmation that the job really was created.
        continue;
      }
      await onSamplesChanged();
      if (now > before) {
        setPhase({ kind: "arrived", sent });
        return;
      }
    }
    setPhase({ kind: "quiet", sent });
  }

  async function start() {
    if (!chosenLibrary || chosenIds.length === 0) return;
    setError(null);
    setPhase({ kind: "sending" });
    let before = 0;
    try {
      before = await countLibrarySamples();
    } catch {
      before = 0;
    }
    try {
      await createJob(dispatch, chosenLibrary.id, {
        action: "use_as_agent_test_cases",
        selection: { source_ids: chosenIds },
        estimate_token: null,
        params: { agent_id: agentId },
        name: `Test cases from ${chosenLibrary.name}`,
      });
    } catch (caught) {
      setPhase({ kind: "choosing" });
      setError(
        describeMediaError(
          caught,
          "The Library could not start that job.",
        ),
      );
      return;
    }
    const sent = chosenIds.length;
    setPhase({ kind: "watching", sent });
    void watchForRows(before, sent);
  }

  const busy = phase.kind === "sending" || phase.kind === "watching";

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Load sample data from a Library</DialogTitle>
          <DialogDescription>
            Catalogued items that already have a transcript become candidate
            test cases for this agent. The Library does the writing — they
            appear under Candidates as they are written.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="samples-library">Library</Label>
            {librariesLoading ? (
              <Skeleton className="h-11 w-full" />
            ) : libraries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                You have no media Libraries yet.{" "}
                <Link
                  href="/libraries"
                  target="_blank"
                  className="underline underline-offset-2"
                >
                  Make one
                </Link>{" "}
                from a channel or playlist, transcribe a few items, and they can
                become test cases here.
              </p>
            ) : (
              <Select
                value={libraryId}
                onValueChange={(next) => {
                  setLibraryId(next);
                  setPhase({ kind: "choosing" });
                  void loadVideos(next);
                }}
              >
                <SelectTrigger id="samples-library" className="h-11">
                  <SelectValue placeholder="Choose a Library" />
                </SelectTrigger>
                <SelectContent>
                  {libraries.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      <span className="flex items-center gap-2">
                        <Library className="size-3.5" aria-hidden />
                        {row.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {videosLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : chosenLibrary && readiness && !readiness.canStart ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {readiness.sentence}{" "}
                <Link
                  href={`/libraries/${chosenLibrary.id}`}
                  target="_blank"
                  className="underline underline-offset-2"
                >
                  Open {chosenLibrary.name}
                </Link>
                .
              </span>
            </p>
          ) : chosenLibrary ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {readyTotal} of {totalCount} items have a transcript
                  {readyTotal > videos.length
                    ? ` — the ${videos.length} most recent are listed`
                    : ""}
                  . {chosenIds.length} chosen.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={busy}
                  onClick={() =>
                    setChosenIds(
                      chosenIds.length === videos.length
                        ? []
                        : videos.map((video) => video.id),
                    )
                  }
                >
                  {chosenIds.length === videos.length ? "Clear" : "Select all"}
                </Button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {videos.map((video) => {
                  const checked = chosenIds.includes(video.id);
                  return (
                    <label
                      key={video.id}
                      className="flex cursor-pointer items-start gap-2 rounded p-1 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={busy}
                        onCheckedChange={(next) =>
                          setChosenIds((current) =>
                            next === true
                              ? [...current, video.id]
                              : current.filter((id) => id !== video.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {video.title}
                      </span>
                      <Link
                        href={video.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-muted-foreground"
                        onClick={(event) => event.stopPropagation()}
                        title="Open this item"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {phase.kind === "watching" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {phase.sent} items were sent to the Library. They appear under
              Candidates as they are written — watching for them now.
            </p>
          ) : null}
          {phase.kind === "arrived" ? (
            <p className="text-sm text-muted-foreground">
              The first test cases from those {phase.sent} items are in
              Candidates. The rest arrive as the Library writes them.
            </p>
          ) : null}
          {phase.kind === "quiet" ? (
            <p className="text-sm text-muted-foreground">
              {phase.sent} items were sent and the job was created, but no test
              case had been written when this screen stopped watching. It may
              still be running — refresh the list in a minute, or open the
              Library to see the job.
            </p>
          ) : null}

          {error ? (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {phase.kind === "arrived" || phase.kind === "quiet"
              ? "Close"
              : "Cancel"}
          </Button>
          {readiness?.canStart && phase.kind !== "arrived" ? (
            <Button
              disabled={busy || chosenIds.length === 0}
              onClick={() => void start()}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {chosenIds.length === 0
                ? "Choose at least one item"
                : `Load ${chosenIds.length} test cases`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
