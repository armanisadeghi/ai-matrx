"use client";

/**
 * The performed speech script, shown beside the audio it produced.
 *
 * A speech-script run stamps `metadata.speech_script` (variables already
 * filled) on its audio part, so the transcript under a player is exactly what
 * was spoken, by whom, with the direction each line was given.
 */

import React from "react";

export interface PerformedTurn {
  speaker: string;
  text: string;
  direction?: string | null;
  pause_after_ms?: number | null;
}

export interface PerformedScript {
  turns: PerformedTurn[];
}

/** Read the script off an audio block's data without trusting its shape. */
export function readPerformedScript(
  data: Record<string, unknown> | null | undefined,
): PerformedScript | null {
  const meta = (data?.metadata ?? null) as Record<string, unknown> | null;
  const raw = (data?.speech_script ?? meta?.speech_script) as
    | { turns?: unknown }
    | undefined;
  if (!raw || !Array.isArray(raw.turns) || raw.turns.length === 0) return null;
  const turns = raw.turns
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      speaker: typeof t.speaker === "string" ? t.speaker : "",
      text: typeof t.text === "string" ? t.text : "",
      direction: typeof t.direction === "string" ? t.direction : null,
      pause_after_ms: typeof t.pause_after_ms === "number" ? t.pause_after_ms : null,
    }))
    .filter((t) => t.text);
  return turns.length ? { turns } : null;
}

const SpeechScriptPanel: React.FC<{ script: PerformedScript }> = ({ script }) => {
  const multi = new Set(script.turns.map((t) => t.speaker)).size > 1;
  return (
    <ol
      className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
      aria-label="Speech script"
      data-testid="performed-speech-script"
    >
      {script.turns.map((turn, index) => (
        <li key={index} className="flex flex-col gap-0.5">
          {(multi || turn.direction) && (
            <div className="flex items-baseline gap-2 text-xs">
              {multi && <span className="font-medium text-foreground">{turn.speaker}</span>}
              {turn.direction && (
                <span className="italic text-muted-foreground">{turn.direction}</span>
              )}
            </div>
          )}
          <p className="leading-relaxed text-foreground">{turn.text}</p>
          {turn.pause_after_ms ? (
            <span className="text-[10px] font-mono text-muted-foreground">
              pause {turn.pause_after_ms} ms
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
};

export default SpeechScriptPanel;
