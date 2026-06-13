"use client";

// DictionaryContextCard — the FULL dictionary view for the transcript cleanup
// page. Unlike the compact indicator (selection only), this shows the merged,
// de-duplicated entries with their source level, plus inline selection. The
// cleanup agent run includes this dictionary as context; the page's own
// recording biases STT with it.

import { useMemo, useState } from "react";
import { BookA, ChevronDown, Search, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDictionaryContext } from "@/features/dictionary/hooks/useDictionaryContext";
import { useOpenDictionarySelectorWindow } from "@/features/overlays/openers/dictionarySelectorWindow";
import { DICT_LEVEL_LABELS } from "@/features/dictionary/constants";

const SOURCE_BADGE: Record<string, string> = {
  user: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  organization: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  scope_type: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  scope: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function DictionaryContextCard({ surfaceKey }: { surfaceKey: string }) {
  const { consumption, activeCount, selection } = useDictionaryContext(surfaceKey);
  const openSelector = useOpenDictionarySelectorWindow();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);

  const entries = consumption?.resolved.entries ?? [];
  const sourceCount = consumption?.resolved.source_count ?? 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.sounds_like.some((s) => s.toLowerCase().includes(q)) ||
        (e.definition ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  const selectionSummary = selection.all
    ? "Everything"
    : [
        selection.includePersonal && "Personal",
        selection.organizationIds.length && `${selection.organizationIds.length} org`,
        selection.scopeTypeIds.length && `${selection.scopeTypeIds.length} scope type`,
        selection.scopeIds.length && `${selection.scopeIds.length} scope`,
      ]
        .filter(Boolean)
        .join(" · ") || "Personal";

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <BookA className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Dictionary</span>
        <Badge variant="secondary" className="ml-0.5">{activeCount}</Badge>
        <span className="ml-auto text-[11px] text-muted-foreground truncate max-w-[140px]">
          {selectionSummary}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 p-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search terms…"
                className="pl-8 h-8 text-sm"
                style={{ fontSize: "16px" }}
              />
            </div>
            <button
              type="button"
              onClick={() => openSelector({ surfaceKey })}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" /> Sources
            </button>
          </div>

          <ScrollArea className="max-h-72">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {entries.length === 0
                  ? "No active dictionary terms. Add to your personal dictionary or pick sources."
                  : "No matches."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((e) => (
                  <li key={`${e.source_level}:${e.id}`} className="px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{e.term}</span>
                      {(e.pronunciation || e.ipa) && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {e.pronunciation || `/${e.ipa}/`}
                        </span>
                      )}
                      <span
                        className={cn(
                          "ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0",
                          SOURCE_BADGE[e.source_level] ?? "bg-muted text-muted-foreground",
                        )}
                        title={`${DICT_LEVEL_LABELS[e.source_level]} · ${e.source_name}`}
                      >
                        {e.source_name}
                      </span>
                    </div>
                    {e.sounds_like.length > 0 && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        ≈ {e.sounds_like.join(", ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>

          {sourceCount > 1 && (
            <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              Merged from {sourceCount} sources · most-specific level wins on conflicts.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
