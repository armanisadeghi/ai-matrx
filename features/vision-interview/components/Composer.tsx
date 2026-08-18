"use client";

// features/vision-interview/components/Composer.tsx
//
// The human's seat at the table — and the room's no-dead-end guarantee.
//
// The textarea is ALIVE in every phase (never disabled):
//   · Before a run — type or DICTATE (ProTextarea's built-in mic) an opening
//     statement / additional vision; Start sends it (it rides the session's
//     vision_statement through useInterviewRun.start).
//   · While the room works — keep composing; the draft queues, the status
//     line says so honestly, and Send arms the instant the interrupt arrives.
//   · On any failure — the run phase returns to an actionable state, the
//     draft SURVIVES (start/resume return acceptance), and Start re-arms.
// Buttons carry their own busy state; nothing global ever locks.
//
// Also carries the role-summon control ("bring in the Adversary" →
// summon_role on the resume payload, design-doc open Q3).

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  CornerDownLeft,
  MessageCircleQuestion,
  Play,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import {
  subscribeDictationAudio,
  type FailedDictationAudio,
} from "@/features/audio/dictationAudioRegistry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useDurableDraft } from "@/hooks/useDurableDraft";
import {
  composerInsertConsumed,
  dictationAudioQueuedForTurn,
  dictationAudioSaved,
  selectActiveSpeaker,
  selectComposerInsert,
  selectPendingAudioFileIds,
  selectPendingInterrupt,
  selectRoomSession,
  selectRunError,
  selectRunPhase,
} from "../redux/vision-interview.slice";
import { ROLE_ORDER, ROLES, type RoleKey } from "../types";
import type { ResumeInput } from "../hooks/useInterviewRun";
import { RoleAvatar } from "./RoleAvatar";

interface ComposerProps {
  /** From the route — stable on first render, so the durable-draft key can
   *  never wobble through a pre-hydration window (Bugbot, PR #152). */
  sessionId: string;
  onResume: (input: ResumeInput) => Promise<boolean>;
  onStart: (openingMessage?: string) => Promise<boolean>;
}

export function Composer({ sessionId, onResume, onStart }: ComposerProps) {
  const dispatch = useAppDispatch();
  const runPhase = useAppSelector(selectRunPhase);
  const composerInsert = useAppSelector(selectComposerInsert);
  const pendingInterrupt = useAppSelector(selectPendingInterrupt);
  const activeSpeaker = useAppSelector(selectActiveSpeaker);
  const runError = useAppSelector(selectRunError);
  // NEVER-LOSE-CONTENT: the draft survives reloads, crashes, and error
  // storms — it is cleared ONLY after the room durably accepted it
  // (Arman's ruling, 2026-08-16, after a dictated vision was lost).
  const {
    draft: text,
    setDraft: setText,
    clearDraft,
  } = useDurableDraft(`vision-interview:${sessionId}`);
  const [summon, setSummon] = useState<RoleKey | null>(null);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Raw-audio capture (v2 §13.1) ──────────────────────────────────────────
  // The canonical recorder saves EVERY dictation's audio durably on its own
  // (independent of any run call — §17.1 ordering). Here we only listen for
  // that save landing, so the file id can be stamped onto the human turn this
  // message becomes. A failed upload keeps its blob retryable in memory
  // (localStorage cannot hold blobs) — surfaced honestly below.
  const session = useAppSelector(selectRoomSession);
  const pendingAudio = useAppSelector(selectPendingAudioFileIds);
  const [failedAudio, setFailedAudio] = useState<FailedDictationAudio | null>(
    null,
  );
  const [retryingAudio, setRetryingAudio] = useState(false);
  useEffect(() => {
    return subscribeDictationAudio((event) => {
      const origin =
        event.type === "saved" ? event.saved.origin : event.failed.origin;
      if (
        origin?.surface !== "vision-interview.composer" ||
        origin.entityId !== sessionId
      ) {
        return;
      }
      if (event.type === "saved") {
        setFailedAudio(null);
        dispatch(
          dictationAudioSaved({
            fileId: event.saved.fileId,
            savedAtMs: event.saved.savedAtMs,
          }),
        );
      } else {
        setFailedAudio(event.failed);
      }
    });
  }, [dispatch, sessionId]);

  const retryAudioUpload = async () => {
    if (!failedAudio || retryingAudio) return;
    setRetryingAudio(true);
    try {
      await failedAudio.retry();
      // Success clears via the "saved" announcement above.
    } catch {
      // Failure re-announces; the banner stays with the fresh error.
    } finally {
      setRetryingAudio(false);
    }
  };

  // Consume text another surface handed the composer (a question's Answer
  // button) — append to the durable draft, then focus so they just type.
  useEffect(() => {
    if (!composerInsert) return;
    setText(text ? `${text.replace(/\s+$/, "")}\n\n${composerInsert}` : composerInsert);
    dispatch(composerInsertConsumed());
    requestAnimationFrame(() => {
      const el = wrapperRef.current?.querySelector("textarea");
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when an insert lands; draft setter is stable for the key
  }, [composerInsert]);

  const canAnswer = runPhase === "waiting_human";
  const canStart =
    runPhase === "idle" || runPhase === "complete" || runPhase === "error";
  const working = runPhase === "starting" || runPhase === "running";
  const hasDraft = text.trim().length > 0;
  const speakerMeta = activeSpeaker ? ROLES[activeSpeaker] : null;

  const send = async () => {
    if (!canAnswer || sending) return;
    const message = text.trim();
    if (!message && !summon) return;
    setSending(true);
    try {
      const accepted = await onResume({
        message,
        summonRole: summon ?? undefined,
      });
      if (accepted) {
        clearDraft();
        setSummon(null);
        // The recordings behind this message now belong to the turn the
        // server creates for it (useTurnAudioAttachment stamps it on land).
        dispatch(dictationAudioQueuedForTurn({ sentAtMs: Date.now() }));
      }
    } finally {
      setSending(false);
    }
  };

  const start = async () => {
    if (!canStart || starting) return;
    setStarting(true);
    try {
      const accepted = await onStart(text.trim() || undefined);
      // Cleared only when the statement durably landed on the session row
      // (and is now visible in the transcript pane as "Your vision").
      if (accepted) {
        clearDraft();
        // The backend seeds the human's turn 0 from the vision statement —
        // dictated audio belongs to that turn.
        dispatch(dictationAudioQueuedForTurn({ sentAtMs: Date.now() }));
      }
    } finally {
      setStarting(false);
    }
  };

  const submit = () => {
    if (canAnswer) void send();
    else if (canStart) void start();
  };

  return (
    <div className="shrink-0 border-t border-border bg-background px-2 pb-2 pt-1.5">
      {/* Raw-audio honesty: an upload failure never loses the recording —
          the blob is held in memory and retried from right here. */}
      {failedAudio && (
        <p className="mb-1.5 flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs">
          <AudioLines
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
            aria-hidden
          />
          <span className="min-w-0 text-foreground">
            Your recording could not be saved to the cloud yet — it is still
            held safely on this device (your words are already in the text
            below).{" "}
            <button
              type="button"
              onClick={() => void retryAudioUpload()}
              disabled={retryingAudio}
              className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
            >
              {retryingAudio ? "Retrying…" : "Retry saving the audio"}
            </button>
          </span>
        </p>
      )}
      {/* Status line — always honest about what the room is doing. */}
      {canAnswer && pendingInterrupt?.prompt ? (
        // Height-capped: a long round summary must never squash the
        // transcript above it (it once left the transcript 8px tall).
        <p className="mb-1.5 flex max-h-32 items-start gap-1.5 overflow-y-auto rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-xs text-foreground">
          <MessageCircleQuestion
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
            aria-hidden
          />
          <span className="min-w-0 whitespace-pre-wrap">
            {pendingInterrupt.prompt}
          </span>
        </p>
      ) : working ? (
        <p className="mb-1 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-current",
              speakerMeta?.accent.text ?? "text-primary",
            )}
            aria-hidden
          />
          {speakerMeta
            ? `${speakerMeta.name} is speaking`
            : "The room is working"}
          {hasDraft && " — your message sends on your turn"}
        </p>
      ) : runPhase === "error" && runError ? (
        // FAILURE HONESTY (v2 §17): a run error must SAY the Expert's words
        // are safe — the draft persists on this device (useDurableDraft) and
        // every sent message already landed as a turn before agents ran —
        // and offer the retry in the same breath (Try again below).
        <p className="mb-1.5 flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            {runError}
            <span className="mt-0.5 block text-foreground">
              Your words are safe: {hasDraft ? "this draft stays right here, and " : ""}
              everything you sent is already saved on this session. Press Try
              again when ready — nothing needs re-typing.
            </span>
          </span>
        </p>
      ) : null}

      {summon && (
        <p className="mb-1 flex items-center gap-1.5 px-1 text-xs">
          <RoleAvatar role={summon} size="sm" />
          {/* v2: a summoned role becomes the PRIMARY of the next round. */}
          <span className={ROLES[summon].accent.text}>
            The {ROLES[summon].name} leads the next round
          </span>
          <button
            type="button"
            onClick={() => setSummon(null)}
            aria-label="Clear summon"
            className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </p>
      )}

      {/* Origin stamp: every dictation started inside this subtree is saved
          by the shared recorder WITH attribution to this session, and its
          save is announced back to this composer (v2 §13.1). */}
      <RecordingOriginProvider
        origin={{
          surface: "vision-interview.composer",
          entityId: sessionId,
          label: session?.title || "Vision interview",
          href: `/vision-interview/${sessionId}`,
        }}
      >
      <div
        ref={wrapperRef}
        className="rounded-xl border border-border bg-card shadow-sm transition-colors focus-within:border-primary/40"
      >
        <ProTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            canAnswer
              ? "Answer the room…"
              : working
                ? "Draft your next message — it sends on your turn…"
                : runPhase === "complete"
                  ? "Add to your vision, or start another run…"
                  : "Share your vision — type or dictate, then press Start…"
          }
          autoGrow
          minHeight={44}
          maxHeight={240}
          // A chat composer is not a document field — the pinned stats bar
          // ("0 c 0 w…") is pure clutter here, worst on mobile where it ate a
          // full row under the composer (Arman's screenshots, 2026-08-16).
          enableTextStats={false}
          wrapperClassName="w-full"
          className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0 sm:text-sm"
        />
        <div className="flex items-center gap-1.5 px-2 pb-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                disabled={!canAnswer || sending}
                aria-label="Choose who leads the next round"
                title={
                  canAnswer
                    ? "Bring in a role — it leads the next round"
                    : "Roles can be summoned on your turn"
                }
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Who leads the next round…</DropdownMenuLabel>
              {ROLE_ORDER.map((key) => {
                const role = ROLES[key];
                return (
                  <DropdownMenuItem key={key} onSelect={() => setSummon(key)}>
                    <RoleAvatar role={key} size="sm" className="mr-2" />
                    <span className="flex flex-col">
                      <span>{role.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {role.description}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          {pendingAudio.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
              title="Your dictation's audio is saved and will be attached to this message"
            >
              <AudioLines className="h-3 w-3" aria-hidden />
              {pendingAudio.length === 1
                ? "audio saved"
                : `${pendingAudio.length} recordings saved`}
            </span>
          )}
          <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
            <CornerDownLeft className="h-3 w-3" aria-hidden />
            ⌘↵ to {canStart ? "start" : "send"}
          </span>
          {canStart ? (
            <Button
              size="sm"
              className="h-7 px-3"
              onClick={() => void start()}
              disabled={starting}
              aria-label="Start the interview"
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              {starting
                ? "Starting…"
                : runPhase === "error"
                  ? "Try again"
                  : runPhase === "complete"
                    ? "Continue"
                    : "Start"}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 px-3"
              onClick={() => void send()}
              disabled={
                !canAnswer || sending || (!hasDraft && !summon)
              }
              aria-label="Send your turn"
              title={
                canAnswer
                  ? "Send your turn"
                  : "Sends the moment the room hands back to you"
              }
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              {sending ? "Sending…" : "Send"}
            </Button>
          )}
        </div>
      </div>
      </RecordingOriginProvider>
    </div>
  );
}
