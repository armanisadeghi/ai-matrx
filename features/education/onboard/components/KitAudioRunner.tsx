"use client";

// features/education/onboard/components/KitAudioRunner.tsx
//
// Runs the audio overview the study kit just created, IN PLACE on the kit board.
//
// Why this exists: the audio generator creates a durable run + a `study_media`
// row and stashes the request for the audio-study page to stream. If the student
// stayed on /education/start — which is exactly what the kit invites them to do
// — nobody ever consumed that stashed request, so the audio row spun forever,
// no audio was ever produced, and the board's "we'll keep working even if you
// close this" was untrue. This component hosts the SAME `useStudioRun` the
// audio-study page uses (same start, same checkpointed resume, same persistence
// hook), so the work actually happens and the student watches real stage labels
// instead of an unexplained spinner.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";
import { studyMediaService } from "@/features/education/media/service";
import { useAudioStudyRunPersistence } from "@/features/education/media/audio/useAudioStudyRunPersistence";
import type { StudyMediaRow } from "@/features/education/media/types";

export function KitAudioRunner({
  artifactId,
  accentBar,
}: {
  artifactId: string;
  accentBar: string;
}) {
  const [media, setMedia] = useState<StudyMediaRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void studyMediaService.getById(artifactId).then((res) => {
      if (!active) return;
      setMedia(res.data);
      if (!res.data) setLoadError(res.error ?? "Couldn't load the audio study");
    });
    return () => {
      active = false;
    };
  }, [artifactId]);

  if (loadError) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {loadError}
      </p>
    );
  }

  if (!media || !media.run_id) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        Setting up the recording…
      </p>
    );
  }

  return (
    <LiveKitAudio media={media} runId={media.run_id} accentBar={accentBar} />
  );
}

function LiveKitAudio({
  media,
  runId,
  accentBar,
}: {
  media: StudyMediaRow;
  runId: string;
  accentBar: string;
}) {
  const run = useStudioRun(runId);
  const { state } = run;
  const [ready, setReady] = useState(false);

  useAudioStudyRunPersistence({
    media,
    state,
    streaming: run.streaming,
    onReady: () => setReady(true),
    // The board says it in place, right on the row — a toast on top of that is
    // noise while several targets are finishing at once.
    announce: false,
  });

  if (ready || state.status === "done") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Audio ready —{" "}
        <Link
          href={`/education/audio-study/${media.id}`}
          className="underline underline-offset-2"
        >
          listen now
        </Link>
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {state.error ?? "The audio run failed"} —{" "}
        <Link
          href={`/education/audio-study/${media.id}`}
          className="underline underline-offset-2"
        >
          open it to retry
        </Link>
      </p>
    );
  }

  const pct = Math.max(0, Math.min(100, state.progress || 0));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1 truncate">
          {state.currentLabel ||
            "Writing the script — an audio overview takes a few minutes"}
        </span>
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", accentBar)}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Keep this open to watch it — if you leave, it keeps running and picks up
        where it left off on the audio page.
      </p>
    </div>
  );
}
