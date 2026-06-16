import { AlertTriangle } from "lucide-react";

/**
 * Shown ABOVE preserved content when a generation stopped early (e.g. a Gemini
 * safety finish) but still produced output. Amber, not red — this is "the
 * provider stopped, here's what we got", NOT "AI Matrx broke". The content
 * stays visible; only the reason is annotated.
 */
export function StoppedEarlyNote({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400 mb-2">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>
        <span className="font-semibold">Provider stopped early:</span> {reason}
        {" — showing what was generated before it stopped."}
      </span>
    </div>
  );
}
