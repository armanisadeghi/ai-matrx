"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, Mic, Users } from "lucide-react";
import { toast } from "@/lib/toast";
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
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Switch } from "@/components/ui/switch";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import { callApi } from "@/lib/api/call-api";
import { useAppStore } from "@/lib/redux/hooks";
import { operationFailed } from "@/utils/errors";
import { supabase } from "@/utils/supabase/client";
import type { paths } from "@/types/python-generated/api-types";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { AgentCredit } from "../AgentCredit";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { Rulebook } from "../../types";
import {
  describeIngest,
  parseIngestSummary,
  type IngestSummary,
} from "./IngestSourceDialog";

import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import { DurableRunInterruption } from "@/lib/durable-run/DurableRunInterruption";
import {
  DurableRunStopButton,
  DurableRunStopped,
} from "@/lib/durable-run/DurableRunStop";
import { durableRunDialogOnOpenChange } from "@/lib/durable-run/durableRunDialogClose";

/**
 * "The Meeting Scavenger" — the `meeting_scavenger` Distillation Approach.
 *
 * Zero new minutes. The Expert's calendar has been running elicitation sessions
 * for years: every week they overrule someone, correct a plan, or say "no, not
 * like that, because…" in front of witnesses, and it is all written down. This
 * door points at those meetings and scavenges the moments THEY made a call.
 *
 * Three ways in, one lane:
 *
 * - THE MEETINGS WE ALREADY HAVE — a picker over `communication.meet_meetings`,
 *   read mine-scoped straight from Supabase like every other list (the
 *   architecture rule: a plain DB read is never a Python hop).
 * - UPLOAD a transcript (.vtt / .srt / .txt / .md) — what Zoom, Teams and
 *   Google Meet export.
 * - PASTE one — the universal door.
 *
 * Then the one question no other lane has to ask: WHICH VOICE IS YOU. The
 * preview (`/masterworks/meeting/preview`, deterministic, no AI, no writes)
 * lists the speakers; a Meet meeting proves the answer from the participant
 * roster and pre-ticks it, an uploaded transcript cannot, so the Expert says.
 *
 * Two knobs ride the dialog with the organization's value as their starting
 * point: whose turns to read, and how long a turn has to be to count as a
 * judgment. Changing them here changes THIS run; the org's knob row stays the
 * authority for the next one.
 */

/**
 * The scavenger's mandate. A STRING LITERAL rather than
 * `MANDATE_KEYS.masterwork__meeting_scavenger` for exactly as long as the
 * installed `@ai-matrx/agents` predates this mandate's registration — the key
 * is REAL (`mandate.definition` row `masterwork.meeting_scavenger`, enabled,
 * holder bound to the builtin seeded by
 * `aidream/scripts/seed_meeting_scavenger_agent.py`, 2026-09-15), and
 * `AgentCredit` takes the key as a string, so the credit and its link to the
 * mandate admin are honest today. Swap it for the constant on the first change
 * here after the package republishes. Registered in
 * `scripts/mandate-keys-allowlist.json` with that reason.
 */
const MEETING_MANDATE_KEY = "masterwork.meeting_scavenger";

const PREVIEW_PATH = "/masterworks/meeting/preview" satisfies keyof paths;
const INGEST_PATH = "/masterworks/ingest-meeting" satisfies keyof paths;

/** What the server's meeting parser reads. Recordings are refused BY NAME with
 *  the reason and the lane that does want them, never silently dropped. */
const TRANSCRIPT_ACCEPT = ".vtt,.srt,.txt,.md,.text,.log";

type MeetingTab = "platform" | "upload" | "paste";

interface MeetingRow {
  id: string;
  title: string;
  slug: string;
  startedAt: string | null;
  segments: number;
}

interface SpeakerRow {
  key: string;
  name: string;
  turns: number;
  words: number;
  isYou: boolean;
}

const TAB_OPTIONS: { value: MeetingTab; title: string; blurb: string }[] = [
  {
    value: "platform",
    title: "Meetings you had here",
    blurb: "Already recorded and transcribed. Nothing to upload.",
  },
  {
    value: "upload",
    title: "Upload a transcript",
    blurb: "The .vtt or .srt your meeting tool saved.",
  },
  {
    value: "paste",
    title: "Paste a transcript",
    blurb: "Works with anything that says who spoke.",
  },
];

const DESCRIPTION =
  "Your meetings are full of your own judgment — the calls you made, the " +
  "things you corrected, the times you said no and why. Point at the meetings " +
  "that mattered and we pull out only your moments, each one a draft rule " +
  "carrying your words and the minute you said them.";

function formatWhen(value: string | null): string {
  if (!value) return "no date";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "no date";
  return at.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MeetingScavengerDialog({
  open,
  onOpenChange,
  rulebook,
  onIngested,
  onFollowupSeed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onIngested?: () => void;
  onFollowupSeed?: (seed: string) => void;
}) {
  const store = useAppStore();
  const { upload } = useFileUpload();

  const [tab, setTab] = useState<MeetingTab>("platform");
  const [meetings, setMeetings] = useState<MeetingRow[] | null>(null);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sourceNote, setSourceNote] = useState("");

  const [speakers, setSpeakers] = useState<SpeakerRow[] | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);

  // The two knobs, offered with the organization's value as the starting point.
  const [ownTurnsOnly, setOwnTurnsOnly] = useState(true);
  const [minWords, setMinWords] = useState(8);

  const run = useMasterworkRun<IngestSummary>({
    surface: "meeting",
    rulebookId: rulebook.id,
    path: INGEST_PATH,
    parseResult: parseIngestSummary,
  });
  const busy = run.running || previewing || loadingMeetings;
  const summary = run.result ? describeIngest(run.result) : null;

  const visibleMeetings = useMemo(() => {
    if (!meetings) return [];
    const term = search.trim().toLowerCase();
    if (!term) return meetings;
    return meetings.filter((m) => m.title.toLowerCase().includes(term));
  }, [meetings, search]);

  const resetPreview = useCallback(() => {
    setSpeakers(null);
    setMine(new Set());
    setNotes([]);
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoadingMeetings(true);
    try {
      // Direct supabase-js — a plain DB listing, scoped by RLS exactly like the
      // /meetings workspace list. A meeting with no transcript rows is still
      // shown, with "no transcript yet" on it, because hiding it would leave
      // the Expert looking for a meeting they know they had.
      const { data, error } = await supabase
        .schema("communication")
        .from("meet_meetings")
        .select("id, title, slug, started_at, scheduled_for")
        .is("deleted_at", null)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw operationFailed("load your meetings", error);
      const rows = data ?? [];
      const ids = rows.map((m) => m.id);
      const counts = new Map<string, number>();
      if (ids.length) {
        const { data: segs, error: segErr } = await supabase
          .schema("communication")
          .from("meet_transcript_segments")
          .select("meeting_id")
          .in("meeting_id", ids)
          .eq("is_final", true)
          .limit(20000);
        if (segErr) throw operationFailed("read your meeting transcripts", segErr);
        for (const seg of segs ?? [])
          counts.set(seg.meeting_id, (counts.get(seg.meeting_id) ?? 0) + 1);
      }
      setMeetings(
        rows.map((m) => ({
          id: m.id,
          title: m.title?.trim() || "Untitled meeting",
          slug: m.slug,
          startedAt: m.started_at ?? m.scheduled_for ?? null,
          segments: counts.get(m.id) ?? 0,
        })),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load your meetings.",
      );
    } finally {
      setLoadingMeetings(false);
    }
  }, []);

  useEffect(() => {
    if (open && tab === "platform" && meetings === null && !loadingMeetings) {
      void loadMeetings();
    }
  }, [open, tab, meetings, loadingMeetings, loadMeetings]);

  const sourceBody = useCallback((): Record<string, unknown> | null => {
    if (tab === "platform") {
      if (selected.size === 0) return null;
      return { meeting_ids: [...selected] };
    }
    if (tab === "upload") {
      if (!fileId) return null;
      return { file_id: fileId };
    }
    if (text.trim().length < 40) return null;
    return { text };
  }, [tab, selected, fileId, text]);

  /** Read the chosen meetings and list the voices. No AI, no writes, no cost. */
  const readVoices = async () => {
    const body = sourceBody();
    if (!body) {
      toast.error(
        tab === "platform"
          ? "Pick at least one meeting first."
          : tab === "upload"
            ? "Choose a transcript file first."
            : "Paste a real transcript first.",
      );
      return;
    }
    setPreviewing(true);
    try {
      let rows: SpeakerRow[] = [];
      const seenNotes: string[] = [];
      const response = await store.dispatch(
        callApi({ path: PREVIEW_PATH, method: "POST", body: body as never }),
      );
      const payload = (response as { meetings?: unknown[]; notes?: string[] }) ?? {};
      for (const note of payload.notes ?? []) seenNotes.push(String(note));
      const merged = new Map<string, SpeakerRow>();
      for (const meeting of (payload.meetings ?? []) as {
        speakers?: {
          key?: string;
          name?: string;
          turns?: number;
          words?: number;
          is_you?: boolean;
        }[];
      }[]) {
        for (const speaker of meeting.speakers ?? []) {
          const key = String(speaker.key ?? "");
          if (!key) continue;
          const existing = merged.get(key);
          if (existing) {
            existing.turns += speaker.turns ?? 0;
            existing.words += speaker.words ?? 0;
            existing.isYou = existing.isYou || Boolean(speaker.is_you);
            continue;
          }
          merged.set(key, {
            key,
            name: String(speaker.name ?? key),
            turns: speaker.turns ?? 0,
            words: speaker.words ?? 0,
            isYou: Boolean(speaker.is_you),
          });
        }
      }
      rows = [...merged.values()].sort((a, b) => b.words - a.words);
      if (rows.length === 0) {
        toast.error("We couldn't find any speakers in that.");
        return;
      }
      setSpeakers(rows);
      setNotes(seenNotes);
      // A platform meeting PROVES which voice is the Expert (the participant
      // roster names the user). An uploaded transcript cannot, so nothing is
      // pre-ticked and the Expert says — a guess here would file a colleague's
      // words under their name.
      setMine(new Set(rows.filter((r) => r.isYou).map((r) => r.key)));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "We couldn't read that transcript.",
      );
    } finally {
      setPreviewing(false);
    }
  };

  const scavenge = async () => {
    const body = sourceBody();
    if (!body) return;
    if (ownTurnsOnly && mine.size === 0) {
      toast.error(
        "Tick which voice is you — otherwise there is nothing of yours to scavenge.",
      );
      return;
    }
    const label =
      sourceNote.trim() ||
      (tab === "platform"
        ? `${selected.size} meeting${selected.size === 1 ? "" : "s"}`
        : "a meeting transcript");
    await run.launch(
      {
        ...body,
        rulebook_id: rulebook.id,
        speaker_keys: [...mine],
        own_turns_only: ownTurnsOnly,
        min_moment_words: minWords,
        source_note: sourceNote.trim() || undefined,
      },
      label,
    );
  };

  useEffect(() => {
    if (!run.result) return;
    onIngested?.();
    if (run.result.followupSeed) onFollowupSeed?.(run.result.followupSeed);
  }, [run.result, onIngested, onFollowupSeed]);

  const toggleMeeting = (id: string) => {
    resetPreview();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onFile = async (chosen: File) => {
    resetPreview();
    setFile(chosen);
    setFileId(null);
    try {
      const uploaded = await upload(
        { kind: "file", file: chosen },
        {
          folderPath: "Masterwork/Meeting Transcripts",
          fileName: chosen.name,
          metadata: { sourceFeature: "masterwork", rulebook_id: rulebook.id },
        },
      );
      setFileId(uploaded.fileId);
    } catch (err) {
      setFile(null);
      toast.error(
        err instanceof Error ? err.message : "That file could not be uploaded.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={durableRunDialogOnOpenChange({
        running: run.running,
        reset: run.reset,
        onOpenChange,
        runLabel: "The Meeting Scavenger",
      })}
    >
      <DialogContent className="flex max-h-[88dvh] max-w-3xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden="true" />
            The Meeting Scavenger
          </DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>

        {/* A failure STAYS on screen with its reason and a way out. */}
        <DurableRunFailure
          error={run.error}
          retry={run.retry}
          running={run.running}
        />
        <DurableRunInterruption interruption={run.interruption} />
        <DurableRunStopped message={run.stoppedMessage} retry={run.retry} />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-3">
            {TAB_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={busy}
                onClick={() => {
                  setTab(option.value);
                  resetPreview();
                }}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  tab === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                  busy && "opacity-60",
                )}
              >
                <div className="text-sm font-medium">{option.title}</div>
                <div className="text-xs text-muted-foreground">
                  {option.blurb}
                </div>
              </button>
            ))}
          </div>

          {tab === "platform" ? (
            <div className="space-y-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your meetings"
                disabled={busy}
              />
              {loadingMeetings ? (
                <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <LoadingSpinner size="sm" />
                  Reading your meetings…
                </div>
              ) : meetings && meetings.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  You have no meetings here yet. Start one from the Meetings
                  page and the transcript lands automatically — or upload a
                  transcript from whatever tool you already use.
                </p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
                  {visibleMeetings.map((meeting) => (
                    <label
                      key={meeting.id}
                      className="flex cursor-pointer items-start gap-3 rounded p-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.has(meeting.id)}
                        onCheckedChange={() => toggleMeeting(meeting.id)}
                        disabled={busy || meeting.segments === 0}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {meeting.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatWhen(meeting.startedAt)} ·{" "}
                          {meeting.segments === 0
                            ? "no transcript yet — nothing to scavenge"
                            : `${meeting.segments} transcript lines`}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "upload" ? (
            <div className="space-y-2">
              <Label htmlFor="meeting-transcript">Transcript file</Label>
              <input
                id="meeting-transcript"
                type="file"
                accept={TRANSCRIPT_ACCEPT}
                disabled={busy}
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  if (chosen) void onFile(chosen);
                }}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <FileUp className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Zoom, Teams and Google Meet all save a .vtt subtitle file with
                the meeting. Any transcript works as long as it says who spoke.
              </p>
              {file ? (
                <p className="text-xs text-muted-foreground">
                  {file.name} {fileId ? "· ready" : "· uploading…"}
                </p>
              ) : null}
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Mic className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                An audio or video recording on its own does not say who spoke.
                For a solo recording use “Just talk — upload a recording”.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="meeting-paste">Paste the transcript</Label>
              <ProTextarea
                id="meeting-paste"
                value={text}
                onChange={(event) => {
                  resetPreview();
                  setText(event.target.value);
                }}
                disabled={busy}
                rows={8}
                placeholder={
                  "Dana: Northline wants a per-pound number today.\n" +
                  "Arman: We are not quoting before we have seen the manifest."
                }
              />
            </div>
          )}

          {notes.length ? (
            <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-500">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          {speakers ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">Which voice is you?</div>
              <p className="text-xs text-muted-foreground">
                We only turn your own moments into rules. Everyone else stays as
                context.
              </p>
              <div className="space-y-1">
                {speakers.map((speaker) => (
                  <label
                    key={speaker.key}
                    className="flex cursor-pointer items-center gap-3 rounded p-1.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={mine.has(speaker.key)}
                      onCheckedChange={() =>
                        setMine((prev) => {
                          const next = new Set(prev);
                          if (next.has(speaker.key)) next.delete(speaker.key);
                          else next.add(speaker.key);
                          return next;
                        })
                      }
                      disabled={busy}
                    />
                    <span className="flex-1 text-sm">
                      {speaker.name}
                      {speaker.isYou ? (
                        <span className="ml-2 text-xs text-primary">
                          your account
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {speaker.turns} turns · {speaker.words} words
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm">Only my own turns</div>
                <div className="text-xs text-muted-foreground">
                  Off, we read every speaker in the room — for a house standard
                  rather than your own judgment.
                </div>
              </div>
              <Switch
                checked={ownTurnsOnly}
                onCheckedChange={setOwnTurnsOnly}
                disabled={busy}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="meeting-min-words" className="text-sm">
                  Shortest moment to read
                </Label>
                <div className="text-xs text-muted-foreground">
                  Anything shorter is “yeah”, “agreed”, “next one” — not a
                  judgment.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="meeting-min-words"
                  type="number"
                  min={1}
                  max={200}
                  value={minWords}
                  onChange={(event) =>
                    setMinWords(
                      Math.max(1, Math.min(200, Number(event.target.value) || 1)),
                    )
                  }
                  disabled={busy}
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">words</span>
              </div>
            </div>
          </div>

          {summary ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              {summary}
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="meeting-note">What are these meetings? (optional)</Label>
            <Input
              id="meeting-note"
              value={sourceNote}
              onChange={(event) => setSourceNote(event.target.value)}
              placeholder="the Tuesday supplier reviews"
              disabled={busy}
            />
          </div>

          <AgentCredit mandate={MEETING_MANDATE_KEY} />
        </div>

        <DialogFooter className="gap-2">
          {run.running ? (
            <DurableRunStopButton
              cancel={run.cancel}
              cancelling={run.cancelling}
              running={run.running}
              leaveLabel="Cancel"
              reason="stopped from the Meeting Scavenger dialog"
              onLeave={() => {
                run.reset();
                onOpenChange(false);
              }}
            />
          ) : null}
          {speakers ? (
            <Button variant="outline" onClick={resetPreview} disabled={busy}>
              Change the selection
            </Button>
          ) : null}
          {speakers ? (
            <Button onClick={scavenge} disabled={busy}>
              {run.running ? "Scavenging…" : "Scavenge these meetings"}
            </Button>
          ) : (
            <Button onClick={readVoices} disabled={busy}>
              {previewing ? "Reading…" : "Read who spoke"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
