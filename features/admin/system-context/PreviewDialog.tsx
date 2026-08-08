"use client";

// Shows exactly what an agent receives for global system context (no scope),
// straight from the live resolver — the end-to-end proof that feeds deliver.

import { useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ResolvedPreviewEntry } from "@/app/api/admin/system-context/route";

export function PreviewDialog({ onClose }: { onClose: () => void }) {
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-sky-500" /> What agents receive
          </DialogTitle>
          <DialogDescription>
            The live global system context — what every agent gets with no scope
            selected, straight from{" "}
            <code className="text-xs">resolve_full_context</code>. Ambient
            values compute fresh per request; dataset feeds arrive as pointers
            agents query with the RAG tools.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
