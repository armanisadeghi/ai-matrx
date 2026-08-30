"use client";

// Continue on my Mac — the capability-gated NATIVE continuation door.
//
// Shown only for Claude Code bindings. The verdict comes from the user's OWN
// Matrx Local app over the per-user bridge channel: native resume is offered
// when, and only when, Claude's own transcript for this session exists on that
// machine and its workspace folder is still present. Every other state is
// stated truthfully (app unreachable, transcript not on this machine,
// workspace missing) — never a generic "Resume" that would seed a new session
// while wearing resume's name. The labeled seeded-handoff path stays where it
// already lives (conversation tools); this panel never fakes it.

import { useEffect, useState } from "react";
import { AlertTriangle, Laptop, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import {
  checkLocalResumable,
  startLocalRuntimeSession,
  type LocalResumableVerdict,
} from "@/features/ai-work/lib/matrxLocalRuntime";

type VerdictState =
  | { state: "loading" }
  | { state: "unreachable"; reason: string }
  | { state: "ready"; verdict: LocalResumableVerdict };

function reasonText(reason: string | undefined): string {
  switch (reason) {
    case "transcript_not_on_this_machine":
      return "Claude's own transcript for this session is not on your Mac, so a native resume is impossible there. You can still read everything here, or start a labeled seeded handoff from the conversation.";
    case "workspace_missing":
      return "The folder this session worked in no longer exists on your Mac.";
    case "workspace_unknown":
      return "The session's working folder could not be determined from Claude's local records.";
    case "not_a_claude_local_session_identity":
      return "This binding does not carry a local Claude session identity.";
    default:
      return reason ?? "Native resume is not available.";
  }
}

export function ContinueOnMyMacPanel({
  providerSessionId,
  conversationId,
}: {
  providerSessionId: string;
  /** The conversation this panel is shown on, to report where turns land. */
  conversationId: string;
}) {
  const [verdict, setVerdict] = useState<VerdictState>({ state: "loading" });
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);
  const [startedConversationId, setStartedConversationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    checkLocalResumable(providerSessionId)
      .then((next) => {
        if (!cancelled) setVerdict({ state: "ready", verdict: next });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setVerdict({
            state: "unreachable",
            reason:
              error instanceof Error
                ? error.message
                : "Matrx Local is not reachable.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [providerSessionId]);

  const start = async () => {
    if (verdict.state !== "ready" || !verdict.verdict.resumable) return;
    if (!prompt.trim()) {
      toast.error("Write what Claude Code should do next.");
      return;
    }
    setStarting(true);
    try {
      const run = await startLocalRuntimeSession({
        workspace: verdict.verdict.workspace!,
        prompt: prompt.trim(),
        resume_session_id: verdict.verdict.session_id ?? providerSessionId,
      });
      setStartedConversationId(run.conversation_id);
      toast.success(
        "Claude Code is continuing this session on your Mac, with its full history.",
      );
    } catch (error) {
      console.error("[ai-work] local continue failed", error);
      toast.error(
        error instanceof Error
          ? `The session could not continue on your Mac — ${error.message}`
          : "The session could not continue on your Mac.",
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Laptop className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          Continue on my Mac
        </span>
      </div>

      {verdict.state === "loading" && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Asking your Matrx Local app whether this session can natively
          resume…
        </div>
      )}

      {verdict.state === "unreachable" && (
        <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          {verdict.reason}
        </div>
      )}

      {verdict.state === "ready" && !verdict.verdict.resumable && (
        <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          {reasonText(verdict.verdict.reason)}
        </div>
      )}

      {verdict.state === "ready" && verdict.verdict.resumable && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Claude's own transcript is on your Mac
            {verdict.verdict.workspace
              ? ` (${verdict.verdict.workspace})`
              : ""}
            , so this is a NATIVE resume — the session continues with its full
            history, using your own Claude Code login.
          </p>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="What should Claude Code do next in this session?"
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void start()} disabled={starting}>
              {starting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              Continue on my Mac
            </Button>
            {startedConversationId &&
              (startedConversationId === conversationId ? (
                <span className="text-xs text-muted-foreground">
                  Running — new turns and tool activity appear on this page as
                  they arrive.
                </span>
              ) : (
                <a
                  href={`/work/conversations/${startedConversationId}`}
                  className="text-xs text-primary hover:underline"
                >
                  Running — the native ledger lands in its own conversation.
                  Open it.
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
