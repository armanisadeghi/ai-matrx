"use client";

// features/spaces/data/SourcePicker.tsx — "Linked view of database": choose the records a data block
// shows. The person's real tables (every table they can see, across all their organizations — the data
// home's own list) and the agency sample. Never filtered by the active organization (access ladder).

import { SearchField } from "@ai-matrx/design-system/controls";
import { Database, FlaskConical } from "lucide-react";
import { useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTablesEverywhere } from "@/features/unified-data/hub/useTablesEverywhere";

import { AGENCY_SAMPLE_ID, agencySample } from "./sources";

export interface PickedSource {
  tableId: string;
  name: string;
  sample?: string;
}

function Lists({ query, onPick }: { query: string; onPick: (s: PickedSource) => void }) {
  const tables = useTablesEverywhere();
  const q = query.trim().toLowerCase();
  const real = tables.rows.filter((t) => !q || `${t.table_name} ${t.organization_name}`.toLowerCase().includes(q));
  const sample = agencySample().tables.filter((t) => !q || t.name.toLowerCase().includes(q));
  return (
    <div className="max-h-[min(460px,60dvh)] overflow-y-auto py-1">
      <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">Your tables</div>
      {tables.loading && !tables.rows.length ? <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div> : null}
      {tables.error ? <div className="px-3 py-2 text-sm text-muted-foreground">Your tables could not be listed.</div> : null}
      {!tables.loading && !tables.error && !real.length ? <div className="px-3 py-2 text-sm text-muted-foreground">No tables</div> : null}
      {real.map((t) => (
        <button key={t.table_id} type="button" className="spaces-db-menurow" onClick={() => onPick({ tableId: t.table_id, name: t.table_name })}>
          <Database size={15} className="text-muted-foreground" />
          <span className="flex-1 truncate text-left">{t.table_name}</span>
          <span className="truncate text-xs text-muted-foreground">{t.organization_name}</span>
        </button>
      ))}
      <div className="px-3 pt-3 pb-1 text-xs text-muted-foreground">Sample agency</div>
      {sample.map((t) => (
        <button key={t.id} type="button" className="spaces-db-menurow" onClick={() => onPick({ tableId: t.id, name: t.name, sample: AGENCY_SAMPLE_ID })}>
          <FlaskConical size={15} className="text-muted-foreground" />
          <span className="flex-1 truncate text-left">{t.name}</span>
          <span className="text-xs text-muted-foreground">{t.rows} rows</span>
        </button>
      ))}
    </div>
  );
}

/** Returns the dialog to render and an async `pick()` that resolves with the chosen source (or null). */
export function useSourcePicker(): [React.ReactNode, () => Promise<PickedSource | null>] {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const resolve = useRef<((s: PickedSource | null) => void) | null>(null);
  const finish = (s: PickedSource | null) => {
    resolve.current?.(s);
    resolve.current = null;
    setOpen(false);
    setQuery("");
  };
  const element = (
    <Dialog open={open} onOpenChange={(o) => (o ? null : finish(null))}>
      <DialogContent className="max-w-[520px] gap-0 p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Choose a data source</DialogTitle>
        <div className="border-b border-border p-2">
          <SearchField autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a data source…" aria-label="Search data sources" />
        </div>
        {open ? <Lists query={query} onPick={finish} /> : null}
      </DialogContent>
    </Dialog>
  );
  const pick = () =>
    new Promise<PickedSource | null>((r) => {
      resolve.current = r;
      setOpen(true);
    });
  return [element, pick];
}
