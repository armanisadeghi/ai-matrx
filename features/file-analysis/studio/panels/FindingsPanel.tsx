/**
 * Right-rail Findings panel — flattened key findings driven by user
 * annotations. Each label → list of values w/ jump-to-page.
 */

"use client";

import { Loader2 } from "lucide-react";
import { useKeyFindings } from "@/features/file-analysis/hooks/useKeyFindings";
import { useLabelCatalog } from "@/features/file-analysis/hooks/useLabelCatalog";

interface Props {
  fileId: string;
  onJumpToPage: (pageNumber: number, pageId?: string | null) => void;
}

function valueText(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") {
    const obj = v as { value?: unknown; raw?: unknown };
    if (obj.value !== undefined && obj.value !== null) return String(obj.value);
    if (obj.raw !== undefined && obj.raw !== null) return String(obj.raw);
    try {
      return JSON.stringify(v);
    } catch {
      return "[object]";
    }
  }
  return String(v);
}

export function FindingsPanel({ fileId, onJumpToPage }: Props) {
  const { data, loading } = useKeyFindings(fileId);
  const { byId } = useLabelCatalog();

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading findings…
      </div>
    );
  }
  const entries = Object.entries(data?.findings ?? {});
  if (!entries.length) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        No findings yet. Annotate fields like Applicant Name, DOB, WPI %,
        Impairment Code… and they'll show up here grouped by label.
      </div>
    );
  }
  return (
    <div className="space-y-1 p-2 text-xs">
      <div className="rounded border border-border bg-card">
        <div className="border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Key findings ({data?.count ?? 0})
        </div>
        <ul>
          {entries.map(([label, items]) => {
            const display = byId.get(label)?.display_name ?? label.replace(/_/g, " ");
            return (
              <li
                key={label}
                className="flex items-start justify-between gap-2 border-b border-border/40 px-2 py-1.5 last:border-0"
              >
                <span className="font-medium capitalize">{display}</span>
                <div className="flex max-w-[60%] flex-col items-end gap-0.5">
                  {items.map((it, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onJumpToPage(it.page, null)}
                      className="truncate text-right text-muted-foreground hover:text-foreground hover:underline"
                      title={`Page ${it.page}`}
                    >
                      {valueText(it.value)}{" "}
                      <span className="text-[10px] tabular-nums">p{it.page}</span>
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
