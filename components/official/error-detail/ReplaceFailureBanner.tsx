import { AlertTriangle } from "lucide-react";
import { explainError } from "./explainError";

/**
 * Full-width, wrapping failure banner. Never a truncated footer string and
 * never an inline table-cell dump — those two shapes are the defect this
 * closes. The title is human; the original refusal stays in a wrapping
 * detail block the reader can copy.
 */
export function ReplaceFailureBanner({ error }: { error: string }) {
  const explained = explainError(error);
  return (
    <div
      role="alert"
      className="shrink-0 space-y-2 border-t border-destructive/30 bg-destructive/5 px-5 py-3"
    >
      <p className="flex items-start gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0">{explained.title}</span>
      </p>
      {explained.summary ? (
        <p className="text-sm leading-relaxed text-foreground">
          {explained.summary}
        </p>
      ) : null}
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/80 p-2 text-xs leading-relaxed text-muted-foreground">
        {explained.detail}
      </pre>
    </div>
  );
}
