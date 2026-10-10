"use client";

import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  fullDownloadOne,
  readRawTranscriptSources,
  type FullDownloadResult,
} from "@/features/ai-work/lib/fullDownload";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
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
          message: "No coding session linked",
        });
        return;
      }
      const results: FullDownloadResult[] = [];
      for (const source of sources) results.push(await fullDownloadOne(source, organizationId));
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
        title="The full transcript, with every tool input and output"
      >
        {state.phase === "working" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Full Download
      </button>
      {state.phase === "failed" ? (
        <p className="max-w-sm truncate text-right text-xs text-amber-700 dark:text-amber-400" title={state.message}>
          {state.message}
        <ErrorAlchemyMenu error={state.message} /></p>
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

/**
 * One short line per session (interface text: secondary slot, 60 chars); the
 * detail — the saved path, or why each source could not provide it — sits in
 * the tooltip (140 chars).
 */
function FullDownloadOutcome({ result }: { result: FullDownloadResult }) {
  const name = PROVIDER_NAMES[result.provider] ?? result.provider;
  const step = result.step;
  if (step.kind === "this_computer") {
    return <span title={clip(step.savedPath)}>{name}: saved to Downloads</span>;
  }
  if (step.kind === "cloud_backup") {
    return <span title={clip(step.thisComputer)}>{name}: downloaded cloud backup</span>;
  }
  return (
    <span className="text-amber-700 dark:text-amber-400" title={clip(step.reasons.join(" "))}>
      {name}: not available
    <ErrorAlchemyMenu error={clip(step.reasons.join(" "))} /></span>
  );
}

function clip(text: string): string {
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}
