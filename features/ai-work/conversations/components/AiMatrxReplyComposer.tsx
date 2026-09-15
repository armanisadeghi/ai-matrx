"use client";

// AI Matrx reply — the second door on a mirrored coding-session transcript.
//
// A provider transcript is a MIRROR: nothing we write here can reach the
// coding tool's own session. But a person reading this page must still be able
// to ask a question and get an answer, so this composer posts the reply onto
// the SAME canonical conversation through the ordinary continuation route, and
// an AI Matrx agent answers there.
//
// THE SENTENCE IS THE FEATURE. The one thing that makes this honest instead of
// misleading is that the person is told, always and in plain sight (never a
// tooltip, never on hover), that the coding tool will not see what they type.
// `replyBoundarySentence` below is that promise; it renders unconditionally
// whenever this control is on screen.
//
// The server decides WHICH agent answers — a layered platform setting, not a
// client choice. This component never names, picks, or defaults an agent.

import { useState } from "react";
import { AlertTriangle, CircleAlert, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callConversationContinue } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";

/**
 * The verbatim boundary promise, with the provider's own label substituted and
 * NOTHING else changed. Exported so the guard test asserts the exact string
 * rather than a paraphrase of it.
 */
export function replyBoundarySentence(providerLabel: string): string {
  return `AI Matrx is answering — ${providerLabel} will not see this reply`;
}

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
  providerLabel,
  onAnswered,
}: {
  conversationId: string;
  providerLabel: string;
  onAnswered: () => void;
}) {
  const dispatch = useAppDispatch();
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
  const canSend = text.trim().length > 0 && !busy;

  async function submit() {
    const body = text.trim();
    // An empty or whitespace-only message NEVER sends: there is nothing for an
    // agent to answer, and a turn written from it would be a lie in the
    // transcript.
    if (body.length === 0 || busy) return;

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
      {/* The boundary promise. Always rendered, always visible, never a
          tooltip — it is the only thing standing between this control and a
          person believing they just messaged their coding tool. */}
      <p className="mt-1 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{replyBoundarySentence(providerLabel)}</span>
      </p>

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        disabled={busy}
        placeholder="Ask AI Matrx about this session, or say what to do next."
        className="mt-3 text-sm"
        aria-label="Your reply to AI Matrx"
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
