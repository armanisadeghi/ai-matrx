"use client";

// Shows exactly what an agent receives for global system context (no scope),
// straight from the live resolver — the end-to-end proof that feeds deliver.
// What every agent gets with no scope selected: ambient values compute per
// request; datasets arrive as pointers. It is the body of the
// `system-context-preview` canvas tab (systemContextPreviewKind.ts); the pane
// header is its chrome.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ResolvedPreviewEntry } from "@/app/api/admin/system-context/route";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function SystemContextPreview() {
  const [entries, setEntries] = useState<ResolvedPreviewEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/system-context?preview=1");
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        if (!cancelled) setError(String(error));
        return;
      }
      const { resolved } = (await res.json()) as {
        resolved: ResolvedPreviewEntry[];
      };
      if (!cancelled) setEntries(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background p-3">
        {error ? (
          <p className="py-6 text-center text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>
        ) : entries === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Resolving…
          </div>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No global system context resolves yet.
          </p>
        ) : (
          <div className="space-y-2 py-1">
            {entries.map((e) => (
              <div
                key={e.key}
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs font-semibold text-foreground">
                    {e.key}
                  </code>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {e.type}
                  </span>
                </div>
                {e.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {e.description}
                  </div>
                )}
                <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-[11px] text-foreground">
                  {typeof e.value === "string"
                    ? e.value
                    : JSON.stringify(e.value, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}

    </div>
  );
}
