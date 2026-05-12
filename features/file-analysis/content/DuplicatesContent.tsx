/**
 * DuplicatesContent — page groupings for each duplicate-detection method.
 * Each method (exact / normalized / structural / shingle / visual) gets its
 * own sub-section with the groups it found.
 */

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  allResults,
  asObject,
  type DuplicatePagesPayload,
} from "./utils";
import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

interface Props {
  results: FileAnalysisResultRow[];
  onJumpToPage?: (pageNumber: number) => void;
}

const METHODS: Array<{ kind: string; label: string; description: string }> = [
  { kind: "duplicate_pages_exact", label: "Exact", description: "Identical text content" },
  { kind: "duplicate_pages_normalized", label: "Normalized", description: "Same after whitespace/case strip" },
  { kind: "duplicate_pages_structural", label: "Structural", description: "Same block layout" },
  { kind: "duplicate_pages_shingle", label: "Shingle", description: "Near-duplicate text" },
  { kind: "duplicate_pages_visual", label: "Visual (pHash)", description: "Same rendered appearance" },
];

export function DuplicatesContent({ results, onJumpToPage }: Props) {
  const [tier, setTier] = useState<"low" | "medium" | "high">("medium");

  const hasAny = METHODS.some((m) => allResults(results, m.kind).length > 0);
  if (!hasAny) {
    return (
      <div className="rounded border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
        Duplicate-page detection hasn't finished yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Visual / shingle tier
        </span>
        {(["low", "medium", "high"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(t)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] capitalize transition-colors",
              tier === t
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {METHODS.map(({ kind, label, description }) => {
        const rows = allResults(results, kind);
        const isTiered = kind.endsWith("_visual") || kind.endsWith("_shingle");
        const row = isTiered
          ? rows.find((r) => r.confidence_tier === tier) ?? rows[0]
          : rows[0];
        const groups =
          asObject<DuplicatePagesPayload>(row?.payload)?.groups ?? [];
        return (
          <div key={kind} className="rounded border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[10px] text-muted-foreground">{description}</span>
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                {groups.length} group{groups.length === 1 ? "" : "s"}
              </span>
            </div>
            {!groups.length ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                None.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {groups.map((g, gi) => (
                  <li
                    key={gi}
                    className="flex items-center gap-2 px-3 py-2 text-xs"
                  >
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {g.count} pages identical
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {g.pages.map((p) =>
                        onJumpToPage ? (
                          <button
                            key={p}
                            type="button"
                            onClick={() => onJumpToPage(p)}
                            className="rounded bg-muted px-1.5 py-px text-[10px] tabular-nums hover:bg-accent"
                          >
                            {p}
                          </button>
                        ) : (
                          <span
                            key={p}
                            className="rounded bg-muted px-1.5 py-px text-[10px] tabular-nums"
                          >
                            {p}
                          </span>
                        ),
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
