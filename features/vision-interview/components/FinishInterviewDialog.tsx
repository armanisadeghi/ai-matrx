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
// 🚨 ONE PRESS FINISHES IT, AND THE CHOICE IS INFORMED BEFORE THE PRESS
// (cold walks 2 and 3 of the Masterwork pipeline, 2026-09-15 and -16).
//
// This dialog used to make the person perform the server's two journeys
// themselves, under two different labels: "Finish the interview" started the
// run, and "Write the documents" sent `done` — and the gate then answered
// that first `done` by running ANOTHER interview round. Two independent cold
// walks pressed Finish twice, watched the round counter climb and the
// open-question count go from five to eight, and never received a Vision
// document, a Requirements document or a cleaned transcript. The room the
// product is named after could not be finished by the button labelled to
// finish it.
//
// Both halves now live behind one press (`useInterviewRun.finish`), and the
// server honours the first `done` (aidream `routing.done_decision`). The
// second-chance consent that used to hide behind the click is now IN FRONT of
// it: this dialog names what the room still wants — open questions, open
// holes — before anything is sent, which is where a confirmation a person can
// actually read belongs.
//
// WHAT HAPPENS, stated honestly on screen:
//   1. The guided run starts if it is not already waiting. The room's experts
//      take one round together (their words land in the expert feed as
//      `interview.turn` rows, NOT in the person's chat tabs — the run uses
//      fresh conversations).
//   2. The moment the run hands back, `done` is sent for them.
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
  selectOpenHoleCount,
  selectOpenQuestionCount,
  selectRunError,
  selectRunPhase,
} from "../redux/vision-interview.slice";
import { ROLES, type DocView } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface DeliverableRow {
  key: Extract<DocView, "vision" | "requirements" | "transcript">;
  label: string;
  icon: LucideIcon;
  content: string;
}

export interface FinishInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Finish the interview — start the guided run if none is waiting and send
   * `done`, as one action. See `useInterviewRun.finish`.
   */
  onFinish: () => Promise<boolean>;
}

export function FinishInterviewDialog({
  open,
  onOpenChange,
  onFinish,
}: FinishInterviewDialogProps) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectRoomSession);
  const runPhase = useAppSelector(selectRunPhase);
  const runError = useAppSelector(selectRunError);
  const interrupt = useAppSelector(selectPendingInterrupt);
  const speaker = useAppSelector(selectActiveSpeaker);
  const [busy, setBusy] = useState(false);
  // What the room still wants, read from the SAME state the room's own
  // Questions panel renders. This is the second chance that used to hide
  // behind the click as an extra interview round: the person reads it, then
  // decides. It is never a reason the control refuses — Finish always
  // finishes.
  const openQuestions = useAppSelector(selectOpenQuestionCount);
  const openHoles = useAppSelector(selectOpenHoleCount);

  // Said the way a person says it, not as two counts in a row.
  const stillOpen = [
    openQuestions > 0
      ? `${openQuestions} question${openQuestions === 1 ? "" : "s"} it has not had an answer to`
      : null,
    openHoles > 0
      ? `${openHoles} gap${openHoles === 1 ? "" : "s"} it wanted to close`
      : null,
  ]
    .filter(Boolean)
    .join(" and ");

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

  const title = working
    ? "The room is working"
    : failed
      ? "The room couldn't finish the interview"
      : finalizedAt
        ? "Write the documents again"
        : "Finish this interview";

  const description = working
    ? `${speaker ? `${ROLES[speaker].name} is speaking. ` : ""}You can close this window — the run continues on the server, and your documents will be here when it lands.`
    : failed
      ? "Nothing you have said is lost — the whole interview lives in the room's own records. You can try again right now."
      : finalizedAt
        ? "Your documents were written once already. Running this again takes everything said since then into account and rewrites all three."
        : "Everything you have told your experts is already saved. Finishing closes the interview and writes your Vision document, your Requirements document and a cleaned transcript from the whole record.";

  // ONE LABEL, ONE MEANING. The button used to change its own name between
  // presses — "Finish the interview", then "Write the documents", then
  // "Finish anyway" — because each press did a different thing on the server.
  // Only the room's own state changes it now.
  const confirmLabel = working
    ? "Working…"
    : failed
      ? "Try again"
      : finalizedAt
        ? "Write them again"
        : "Finish and write the documents";

  const act = async () => {
    if (busy || working) return;
    setBusy(true);
    try {
      await onFinish();
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
          {/* THE SECOND CHANCE, IN FRONT OF THE CLICK. This used to be an
              extra interview round the person never asked for; it is now a
              sentence they can read before deciding. It never blocks the
              button — it informs it. */}
          {!working && !failed && stillOpen ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              The room still has {stillOpen} on the table. Finishing now closes
              the interview anyway and writes the documents from everything
              said so far — nothing you have told it is lost, and you can
              always come back and write them again.
            </p>
          ) : null}
          {waiting && interrupt?.prompt && (
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              {interrupt.prompt}
            </div>
          )}
          {failed && runError && (
            <p className="break-words rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              {runError}
              <ErrorAlchemyMenu error={runError} />
            </p>
          )}
          {working && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {runPhase === "starting"
                ? "Handing the interview to the room…"
                : "The room is taking its last round together, and then it writes your documents. You do not have to do anything else."}
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
