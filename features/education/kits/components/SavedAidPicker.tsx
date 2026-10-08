"use client";

// features/education/kits/components/SavedAidPicker.tsx
//
// THE saved-study-aid picker: search + paged checklist over the learner's
// Education Library ("mine"). One component for both places aids join a kit —
// the create page's "Saved aids" mode and the kit page's Add saved aids dialog.
// Controlled: the host owns the selection; the picker owns search and paging and
// reports each page it reads (`onVisibleRows`) for the agent surface scope.

import { useEffect, useEffectEvent, useState } from "react";
import { Button, Input } from "@ai-matrx/design-system";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import type { EducationLibraryRow } from "@/features/education/library/types";
import { educationLibraryHref } from "@/features/education/library/types";
import { artifactVisual } from "@/features/education/library/artifactVisuals";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { ErrorNotice } from "@ai-matrx/design-system";
import { describeFailure } from "@/lib/failure/transport";

export const SAVED_AID_PAGE_SIZE = 25;

export const savedAidKey = (row: Pick<EducationLibraryRow, "kind" | "id">) => `${row.kind}:${row.id}`;

export function SavedAidPicker({
  selected,
  onToggle,
  exclude,
  onVisibleRows,
}: {
  selected: readonly EducationLibraryRow[];
  onToggle: (row: EducationLibraryRow) => void;
  /** `kind:id` keys never offered (aids already in the kit). */
  exclude?: ReadonlySet<string>;
  onVisibleRows?: (rows: EducationLibraryRow[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EducationLibraryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The host keeps the rows for its agent scope (a ref, never a re-render).
  const report = useEffectEvent((shown: EducationLibraryRow[]) => onVisibleRows?.(shown));
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setLoading(true); });
    void fetchEducationLibraryPage(
      { ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, search, page },
      { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: SAVED_AID_PAGE_SIZE },
    )
      .then((result) => {
        if (!active) return;
        setRows(result.rows);
        report(result.rows);
        setTotal(result.total);
        setError(null);
        setLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        setError(describeFailure(cause, { action: "loading your study aids", read: true, fallback: "Could not load your study aids." }).sentence);
        setLoading(false);
      });
    return () => { active = false; };
  }, [page, search]);

  const visible = exclude ? rows.filter((row) => !exclude.has(savedAidKey(row))) : rows;
  const isSelected = (row: EducationLibraryRow) => selected.some((item) => savedAidKey(item) === savedAidKey(row));

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Find saved study aids
        {/* ui-exception: a search query over saved aids, not writing */}
        <Input
          className="mt-1"
          placeholder="Search by name or type, like flashcards"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
      </label>
      <div className="space-y-2 rounded-xl border border-border p-3">
        {visible.map((row) => (
          <div key={savedAidKey(row)} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/50">
            <input type="checkbox" aria-label={`Add ${row.title}`} checked={isSelected(row)} onChange={() => onToggle(row)} />
            <EntityRef token={row.kind} id={row.id} name={row.title} href={educationLibraryHref(row)} openInNewTab showIcon={false} fill className="min-w-0 flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground">{artifactVisual(row.subtype).label}</span>
          </div>
        ))}
        {loading && <p className="text-sm text-muted-foreground">Loading study aids…</p>}
        {!loading && !visible.length && !error && <p className="text-sm text-muted-foreground">No matching study aids.</p>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
        <span className="text-sm text-muted-foreground">{page * SAVED_AID_PAGE_SIZE < total ? "More results available" : "End of results"}</span>
        <Button variant="outline" disabled={page * SAVED_AID_PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Next</Button>
      </div>
      {error && <ErrorNotice size="inline" message={error} error={error} operation="Load saved study aids" />}
    </div>
  );
}
