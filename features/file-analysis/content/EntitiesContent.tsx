"use client";

/**
 * EntitiesContent — the file's named entities (NER), grouped by category.
 *
 * Reads `GET /files/{id}/entities` (file_entities — detector-extracted +
 * user-promoted named entities for this document) and presents them grouped
 * by `label_category` with counts and a per-entity jump-to-page. This is the
 * "incorporate our NER data into Analysis" surface: run/refresh the
 * knowledge+NER pipeline from the Overview's Knowledge panel, then review
 * the resulting entities here.
 */

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Tag } from "lucide-react";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type { EntityOut } from "@/features/file-analysis/api/file-analysis";

interface Props {
  fileId: string;
  onJumpToPage?: (page: number) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  person: "People",
  org: "Organizations",
  organization: "Organizations",
  location: "Locations",
  date: "Dates",
  money: "Monetary",
  pii: "PII",
  medical: "Medical",
  legal: "Legal",
  custom: "Custom",
};

function prettyCategory(cat: string): string {
  return CATEGORY_LABEL[cat] ?? cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EntitiesContent({ fileId }: Props) {
  const [entities, setEntities] = useState<EntityOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntities(null);
    setError(null);
    Api.listEntities(fileId)
      .then(({ data }) => {
        if (!cancelled) setEntities(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (error) {
    return (
      <div className="p-4 text-xs text-destructive">
        Couldn&apos;t load entities: {error}
      </div>
    );
  }

  if (!entities) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading entities…
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Sparkles className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">No entities extracted yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Run the knowledge + NER pipeline from the{" "}
          <span className="font-medium text-foreground">Overview</span> tab
          (&ldquo;Index for knowledge&rdquo;), or draw an annotation and mark
          it as an entity. Detected named entities appear here grouped by type.
        </p>
      </div>
    );
  }

  // Group by category.
  const groups = new Map<string, EntityOut[]>();
  for (const e of entities) {
    const cat = e.label_category || "custom";
    (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(e);
  }
  const sortedGroups = Array.from(groups.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Tag className="h-3.5 w-3.5" />
        {entities.length} entit{entities.length === 1 ? "y" : "ies"} across{" "}
        {sortedGroups.length} categor
        {sortedGroups.length === 1 ? "y" : "ies"}
      </div>

      {sortedGroups.map(([cat, items]) => (
        <div key={cat} className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="text-xs font-semibold">{prettyCategory(cat)}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {items.length}
            </span>
          </div>
          <ul className="flex flex-wrap gap-1.5 p-2">
            {items.map((e) => (
              <li
                key={e.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px]"
                title={e.label}
              >
                <span className="truncate">{e.canonical_value || e.label}</span>
                {e.is_user_named ? (
                  <span className="shrink-0 rounded bg-primary/10 px-1 text-[9px] font-medium text-primary">
                    user
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
