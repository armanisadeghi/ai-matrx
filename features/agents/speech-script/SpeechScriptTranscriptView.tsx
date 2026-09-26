"use client";

import { readTurns } from "./types";

/**
 * The script a speech turn PERFORMED, as it reads in a transcript (live and
 * after reload): speaker, line, and the direction the voice was given. The
 * builder owns the editor; this is the read-only record of the ask.
 */
export function SpeechScriptTranscriptView({
  payload,
}: {
  payload: Record<string, unknown> | null | undefined;
}) {
  const turns = readTurns(payload).filter((t) => t.text.trim());
  return (
    <div className="my-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs">
      <div className="mb-1.5 font-medium text-foreground">
        Speech script {turns.length > 0 ? `(${turns.length} lines)` : ""}
      </div>
      {turns.length === 0 ? (
        <div className="text-muted-foreground">This speech script has no lines.</div>
      ) : (
        <ol className="space-y-1.5">
          {turns.map((turn, i) => (
            <li key={i} className="min-w-0">
              <span className="font-medium text-foreground">
                {turn.speaker.trim() || "Speaker"}:
              </span>{" "}
              <span className="text-foreground/90">{turn.text}</span>
              {turn.direction ? (
                <span className="text-muted-foreground"> ({turn.direction})</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
