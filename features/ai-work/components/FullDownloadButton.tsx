"use client";

import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  fullDownloadOne,
  readRawTranscriptSources,
  type FullDownloadResult,
} from "@/features/ai-work/lib/fullDownload";

type State =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "done"; results: FullDownloadResult[] }
  | { phase: "failed"; message: string };

const PROVIDER_NAMES: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  vscode: "VS Code",
};

/**
 * "Full Download" on a coding conversation: the complete provider transcript,
 * from this computer first, then the cloud backup, else an honest reason.
 */
export function FullDownloadButton({
  conversationId,
  organizationId,
}: {
  conversationId: string;
  organizationId: string | null;
}) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<State>({ phase: "idle" });

  const run = useCallback(async () => {
    setState({ phase: "working" });
    try {
      const sources = await readRawTranscriptSources(dispatch, conversationId, organizationId);
      if (sources.length === 0) {
        setState({
          phase: "failed",
          message: "This conversation is not linked to a coding session, so there is no provider transcript to download.",
        });
        return;
      }
      const results: FullDownloadResult[] = [];
      for (const source of sources) results.push(await fullDownloadOne(source));
      setState({ phase: "done", results });
    } catch (error) {
      setState({
        phase: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [conversationId, organizationId, dispatch]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state.phase === "working"}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-accent disabled:opacity-60"
        title="Download the complete transcript, including every tool input and output"
      >
        {state.phase === "working" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Full Download
      </button>
      {state.phase === "failed" ? (
        <p className="max-w-sm text-right text-xs text-amber-700 dark:text-amber-400">{state.message}</p>
      ) : null}
      {state.phase === "done" ? (
        <ul className="max-w-sm space-y-1 text-right text-xs text-muted-foreground" aria-live="polite">
          {state.results.map((result) => (
            <li key={`${result.provider}:${result.providerSessionId}`}>
              <FullDownloadOutcome result={result} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FullDownloadOutcome({ result }: { result: FullDownloadResult }) {
  const name = PROVIDER_NAMES[result.provider] ?? result.provider;
  const step = result.step;
  if (step.kind === "this_computer") {
    return (
      <span>
        {name}: saved from your computer to <span className="font-mono">{step.savedPath}</span>
        {step.subagentStreams > 0 ? ` (plus ${step.subagentStreams} sub-agent streams beside it)` : ""}.
        {step.backupNote ? ` ${step.backupNote}` : ""}
      </span>
    );
  }
  if (step.kind === "cloud_backup") {
    return (
      <span>
        {name}: downloaded the cloud backup as <span className="font-mono">{step.fileName}</span>{" "}
        because this computer could not provide it ({step.thisComputer})
      </span>
    );
  }
  return (
    <span className="text-amber-700 dark:text-amber-400">
      {name}: not available. {step.reasons.join(" ")}
    </span>
  );
}
