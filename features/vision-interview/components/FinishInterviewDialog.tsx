"use client";

// features/vision-interview/components/FinishInterviewDialog.tsx
//
// THE GUIDED RUN'S HOME (v3, 2026-08-18).
//
// In v3 the person drives the conversation themselves — every stage tab is an
// ordinary agent chat, and `POST /roles` opens them all the moment the room
// loads. That left the orchestrated workflow run with exactly ONE job the
// chat cannot do: `interview.finalize` — the step that writes
// `session.cleaned_transcript` / `vision_document` / `requirements_document`.
// It was also unreachable: the only Start control lived inside the
// "expert hasn't joined yet" empty state, which the /roles wiring turned into
// an edge case. A person could hold the whole interview and never be able to
// produce the documents the room's own Vision / Requirements / Transcript
// tabs render. That is a dead end, so the run moved here, behind the room
// header's Finish control.
//
// WHAT THIS ACTUALLY DOES — stated honestly on screen, because it is not one
// click on the server:
//   1. Start the run. The room's experts take one guided round together
//      (their words land in the expert feed as `interview.turn` rows, NOT in
//      the person's chat tabs — the run uses fresh conversations), and the
//      run then waits on the human.
//   2. Send `done`. The gate answers the FIRST done with what is still open
//      and runs another round; a REPEATED done is honored as the person's
//      call (aidream `interview_actions.interview_gate`). This dialog shows
//      that answer verbatim, so "Finish anyway" is an informed choice.
//   3. The gate converges → `interview.finalize` writes the three documents
//      server-side. They arrive here through the session-row realtime
//      subscription, and this dialog opens them (invariant: no dead ends).
//
// Invariant 5 (human-controlled movement rides the resume payload, armed only
// while the run waits on the human, disabled states carry an honest tooltip)
// and invariant 7 (never a dead end, per-button busy, nothing global locks)
// both bind this surface.

import { useState } from "react";
import {
  BookOpenText,
  Loader2,
  ScrollText,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  docViewChanged,
  selectActiveSpeaker,
  selectPendingInterrupt,
  selectRoomSession,
  selectRunError,
  selectRunPhase,
} from "../redux/vision-interview.slice";
import { ROLES, type DocView } from "../types";

interface DeliverableRow {
  key: Extract<DocView, "vision" | "requirements" | "transcript">;
  label: string;
  icon: LucideIcon;
  content: string;
}

export interface FinishInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start the guided run — the only path that reaches finalize. */
  onStart: () => Promise<boolean>;
  /** Tell the waiting run the interview is done (resume payload `done`). */
  onFinish: () => Promise<boolean>;
}

export function FinishInterviewDialog({
  open,
  onOpenChange,
  onStart,
  onFinish,
}: FinishInterviewDialogProps) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectRoomSession);
  const runPhase = useAppSelector(selectRunPhase);
  const runError = useAppSelector(selectRunError);
  const interrupt = useAppSelector(selectPendingInterrupt);
  const speaker = useAppSelector(selectActiveSpeaker);
  const [busy, setBusy] = useState(false);
  // Did WE already tell this run the interview is done? The gate answers the
  // first done with what is still open and runs another round, so coming back
  // to `waiting_human` after a done IS the refusal — that, not the presence of
  // a prompt (every interrupt carries one), is what makes the next click
  // "Finish anyway".
  const [doneSent, setDoneSent] = useState(false);

  const waiting = runPhase === "waiting_human";
  const working = runPhase === "starting" || runPhase === "running";
  const failed = runPhase === "error";
  const finalizedAt = session?.finalized_at ?? null;

  const deliverables: DeliverableRow[] = [
    {
      key: "vision",
      label: "Vision document",
      icon: BookOpenText,
      content: session?.vision_document ?? "",
    },
    {
      key: "requirements",
      label: "Requirements document",
      icon: ListChecks,
      content: session?.requirements_document ?? "",
    },
    {
      key: "transcript",
      label: "Cleaned transcript",
      icon: ScrollText,
      content: session?.cleaned_transcript ?? "",
    },
  ];

  const openDocument = (view: DocView) => {
    dispatch(docViewChanged(view));
    onOpenChange(false);
  };

  const title = waiting
    ? "Finish this interview"
    : working
      ? "The room is working"
      : failed
        ? "The room couldn't finish the interview"
        : finalizedAt
          ? "Write the documents again"
          : "Finish this interview";

  const description = waiting
    ? doneSent
      ? "You said you were finished and the room came back with what it still wants to cover. Saying it again is your call, and the room will honour it."
      : "The room has handed the interview back to you — this is what it just said. Finish now and it closes the interview and writes the documents."
    : working
      ? `${speaker ? `${ROLES[speaker].name} is speaking. ` : ""}You can close this window — the run continues on the server, and the Finish control will be waiting when the room hands back.`
      : failed
        ? "Nothing you have said is lost — the whole interview lives in the room's own records. You can try again right now."
        : finalizedAt
          ? "Your documents were written once already. Running this again takes everything said since then into account and rewrites all three."
          : "Everything you have told your experts is already saved. Finishing hands the interview to the guided run: your experts take one round together, and then the room writes the documents from the whole record.";

  const confirmLabel = waiting
    ? doneSent
      ? "Finish anyway"
      : "Write the documents"
    : working
      ? "Working…"
      : failed
        ? "Try again"
        : finalizedAt
          ? "Write them again"
          : "Finish the interview";

  const act = async () => {
    if (busy || working) return;
    setBusy(true);
    try {
      // Waiting on the human → the `done` directive rides the resume payload
      // (invariant 5). Otherwise there is no run to answer — start one.
      if (waiting) {
        if (await onFinish()) setDoneSent(true);
      } else {
        await onStart();
        setDoneSent(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      cancelLabel="Not yet"
      confirmLabel={confirmLabel}
      busy={busy || working}
      onConfirm={act}
      content={
        <div className="space-y-3 text-sm">
          {waiting && interrupt?.prompt && (
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              {interrupt.prompt}
            </div>
          )}
          {failed && runError && (
            <p className="break-words rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              {runError}
            </p>
          )}
          {working && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {runPhase === "starting"
                ? "Handing the interview to the room…"
                : "The guided round is running. It ends by asking you whether you are finished."}
            </p>
          )}

          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-medium text-foreground">
              What the room writes
            </p>
            <ul className="mt-2 space-y-1.5">
              {deliverables.map(({ key, label, icon: Icon, content }) => {
                const ready = content.trim().length > 0;
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{label}</span>
                    </span>
                    {ready ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-xs"
                        onClick={() => openDocument(key)}
                      >
                        Open
                      </Button>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground/70">
                        not written yet
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground/80">
              Nothing you have said is edited or removed — the transcript, your
              questions and the living document stay exactly as they are.
            </p>
          </div>
        </div>
      }
    />
  );
}
