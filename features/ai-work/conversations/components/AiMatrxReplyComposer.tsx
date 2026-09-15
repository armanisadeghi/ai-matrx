"use client";

// AI Matrx reply — the second door on a mirrored coding-session transcript.
//
// A provider transcript is a MIRROR: nothing we write here can reach the
// coding tool's own session. But a person reading this page must still be able
// to ask a question and get an answer, so this composer posts the reply onto
// the SAME canonical conversation through the ordinary continuation route, and
// an AI Matrx agent answers there.
//
// THE SENTENCE IS THE FEATURE — AND IT IS THE SERVER'S SENTENCE.
// The one thing that makes this honest instead of misleading is that the
// person is told, always and in plain sight (never a tooltip, never on hover),
// WHO is about to answer and that the coding tool will not see what they type.
// That sentence is `composer_label` from
// `GET /coding-sessions/conversations/{id}/responder`, composed out of the same
// resolution that picks the answering agent — so the label and the agent cannot
// disagree, and re-binding the mandate relabels this composer with no frontend
// release.
//
// 🚨 NEVER re-derive, re-word or template that sentence here, and never keep a
// client-side one as a fallback. Until the report lands this says nothing about
// who answers; if the read fails it says the label could not be loaded. It used
// to hardcode "AI Matrx is answering — Claude Code will not see this reply"
// while production was silently taking the platform-default stand-in, because
// no agent was bound for the job (V-XT/V3, 2026-09-15).

import { useId, useState } from "react";
import { AlertTriangle, CircleAlert, Info, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callConversationContinue } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { useCodingReplyResponder } from "./useCodingReplyResponder";

/** `source_feature` for every reply sent from this composer (registered slug). */
export const CODING_SESSION_REPLY_SOURCE_FEATURE = "coding_session_reply";

type SendState =
  | { phase: "idle" }
  | { phase: "answering" }
  | { phase: "failed"; message: string; nextStep: string };

/**
 * What to do next, stated for the failure that actually happened — never a
 * generic "try again". A 409 means a run is already live on this conversation,
 * which resolves itself; anything else is reported with the server's own words.
 */
function nextStepFor(status: number | undefined): string {
  if (status === 409) {
    return "A run is already going on this conversation. Wait for it to finish — new turns appear above as they arrive — then send this again.";
  }
  if (status === 422) {
    return "The server rejected this reply as it stands. Nothing was sent, and your text is still here; report this message if it keeps happening.";
  }
  if (status === 401 || status === 403) {
    return "Your session is not authorized to reply on this conversation. Sign in again, then send this once more.";
  }
  return "Nothing was sent and your text is still here. Send it again, or report this message if it keeps happening.";
}

export function AiMatrxReplyComposer({
  conversationId,
  onAnswered,
}: {
  conversationId: string;
  onAnswered: () => void;
}) {
  const dispatch = useAppDispatch();
  const labelId = useId();
  // Read before the person types. This component only ever mounts on a
  // coding-session transcript, so the read is never made on a page that
  // already knows the conversation is not a mirror.
  const responder = useCodingReplyResponder({ conversationId, enabled: true });
  const report = responder.report;
  // A conversation that is not a mirror gets the ordinary composer with no
  // label at all — exactly what it had before this control existed.
  const label =
    report && report.is_coding_session_mirror
      ? report.composer_label
      : null;
  const standInNotice =
    report && report.responder?.used_platform_default
      ? report.stand_in_notice
      : null;
  // Only the SERVER says a reply cannot be answered. A read that has not
  // landed, or failed, never invents that verdict.
  const replyRefused = report ? !report.can_reply : false;
  const [text, setText] = useState("");
  const [send, setSend] = useState<SendState>({ phase: "idle" });
  /**
   * The in-flight answer, accumulated from the stream so the person sees words
   * instead of a spinner. It is a PREVIEW of rows the server is writing; when
   * the stream ends `onAnswered()` re-reads the transcript and the durable,
   * attributed rows take over — so this is cleared at that moment rather than
   * left on screen as a second copy of the same answer.
   */
  const [preview, setPreview] = useState("");

  const busy = send.phase === "answering";
  const inputBlocked = responder.status === "loading" || replyRefused;
  const canSend = text.trim().length > 0 && !busy && !inputBlocked;

  async function submit() {
    const body = text.trim();
    // An empty or whitespace-only message NEVER sends: there is nothing for an
    // agent to answer, and a turn written from it would be a lie in the
    // transcript.
    if (body.length === 0 || busy || inputBlocked) return;

    setSend({ phase: "answering" });
    setPreview("");
    let streamed = "";
    // A plain `let` assigned only inside the stream callback reads as narrowed
    // to null after the await; a holder keeps the real type.
    const failure: { message: string | null } = { message: null };

    const result = await dispatch(
      callConversationContinue({
        conversationId,
        body: {
          user_input: body,
          stream: true,
          source_feature: CODING_SESSION_REPLY_SOURCE_FEATURE,
          initiation: "user",
        },
        onStreamEvent: (event: TypedStreamEvent) => {
          if (event.event === "chunk") {
            streamed += event.data.text;
            setPreview(streamed);
            return;
          }
          if (event.event === "error") {
            failure.message =
              event.data.user_message?.trim() || event.data.message;
          }
        },
      }),
    );

    if (result.error) {
      setPreview("");
      setSend({
        phase: "failed",
        message: result.error.message,
        nextStep: nextStepFor(result.error.status),
      });
      return;
    }

    if (failure.message) {
      setPreview("");
      setSend({
        phase: "failed",
        message: failure.message,
        // The turn reached the server, so the person's own reply row may
        // already exist — say so instead of implying nothing happened.
        nextStep:
          "Your reply reached AI Matrx but the answer failed partway. Reload this page to see what was stored, then send again if no answer arrived.",
      });
      // The reply row itself may be durable even though the answer died, so
      // the transcript is still re-read.
      onAnswered();
      return;
    }

    setText("");
    setPreview("");
    setSend({ phase: "idle" });
    onAnswered();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-foreground">
        Reply in AI Matrx
      </h2>
      {/* WHO is answering, in the server's own sentence: always visible, never
          a tooltip, and never a guess. It is the only thing standing between
          this control and a person believing they just messaged their coding
          tool — or that an agent nobody bound is the one replying. */}
      {responder.status === "loading" ? (
        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span>Checking who answers here…</span>
        </p>
      ) : responder.status === "error" ? (
        <p className="mt-1 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Who answers here could not be loaded, so this page is not naming
            anyone: {responder.error}
          </span>
        </p>
      ) : label ? (
        <p
          id={labelId}
          className="mt-1 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{label}</span>
        </p>
      ) : null}
      {/* THE ANNOUNCED STAND-IN, on screen and not only in a log: visually
          secondary to the label above, and present only when the server says
          the platform default is standing in. */}
      {standInNotice ? (
        <p className="mt-1 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{standInNotice}</span>
        </p>
      ) : null}

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        disabled={busy || inputBlocked}
        placeholder={
          replyRefused
            ? "No reply can be answered here yet."
            : "Ask AI Matrx about this session, or say what to do next."
        }
        className="mt-3 text-sm"
        aria-label="Your reply to AI Matrx"
        // The visible reason a refused field cannot be typed in is the
        // server's own sentence above it, not a tooltip.
        aria-describedby={replyRefused && label ? labelId : undefined}
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void submit()}
          disabled={!canSend}
          className="gap-1.5"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send to AI Matrx
        </Button>
        {/* Honest about BOTH the state and the reason it cannot send — a
            disabled button that says nothing is the dead control this product
            forbids. */}
        {busy ? (
          <span className="text-xs text-muted-foreground">
            AI Matrx is answering… the finished answer lands in this
            transcript.
          </span>
        ) : replyRefused ? (
          // A disabled field with no explanation is the dead-looking control
          // this product forbids: the reason is the sentence above, repeated
          // here as the reason this cannot send.
          <span className="text-xs text-muted-foreground">
            This reply cannot be sent: {label}
          </span>
        ) : responder.status === "loading" ? (
          <span className="text-xs text-muted-foreground">
            Waiting to learn who answers here before you write.
          </span>
        ) : text.trim().length === 0 ? (
          <span className="text-xs text-muted-foreground">
            Write something to send.
          </span>
        ) : null}
      </div>

      {preview ? (
        <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            AI Matrx is writing this answer now
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {preview}
          </p>
        </div>
      ) : null}

      {send.phase === "failed" ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="min-w-0">
            <span className="block font-medium text-destructive">
              {send.message}
            </span>
            <span className="mt-0.5 block text-foreground">
              {send.nextStep}
            </span>
          </span>
        </div>
      ) : null}
    </section>
  );
}
