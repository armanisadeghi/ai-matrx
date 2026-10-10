"use client";

// features/start/widgets/DataPagePicker.tsx — choose one of the person's data pages for the `page` widget.
// Reads the same corpus /data/pages lists (`createDataHomeCorpus`, kind "page"; every organization the
// person reaches) — no second list service. Their own pages first.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRecordsClient } from "@ai-matrx/records/react";
import { Select } from "@ai-matrx/design-system/controls";
import { useRecordsDataSource } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { createDataHomeCorpus } from "@/features/unified-data/home/dataHomeCorpus";
import type { DataHomeRow } from "@/features/unified-data/home/dataHomeRows";

/** Pages only, the person's own first, then by name. */
export function dataPageChoices(rows: readonly DataHomeRow[]): { value: string; label: string; meta?: string }[] {
  return rows
    .filter((r) => r.kind === "page")
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name))
    .map((r) => ({ value: r.itemId, label: r.name || "Untitled page", ...(r.organizationName ? { meta: r.organizationName } : {}) }));
}

export function DataPagePicker({ value, onChange }: { value: string; onChange: (pageId: string) => void }) {
  const client = useRecordsClient();
  const dataSource = useRecordsDataSource();
  const [state, setState] = useState<{ rows: DataHomeRow[] | null; error: string | null }>({ rows: null, error: null });
  useEffect(() => {
    let live = true;
    createDataHomeCorpus(client, dataSource)
      .load()
      .then(
        (rows) => live && setState({ rows, error: null }),
        (e: unknown) => live && setState({ rows: [], error: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      live = false;
    };
  }, [client, dataSource]);
  if (state.error) return <p className="text-xs text-destructive">{state.error}</p>;
  const choices = dataPageChoices(state.rows ?? []);
  if (state.rows && choices.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No data pages yet ·{" "}
        <Link href="/make" className="underline">
          Make a page
        </Link>
      </p>
    );
  }
  const options = value && !choices.some((c) => c.value === value) ? [{ value, label: "Current page" }, ...choices] : choices;
  return (
    <Select
      aria-label="Page"
      value={value}
      disabled={!state.rows}
      options={state.rows ? options : [{ value, label: "Loading pages" }]}
      onValueChange={onChange}
    />
  );
}
