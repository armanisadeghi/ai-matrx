"use client";

// features/spaces/data/SourcePicker.tsx — "Linked view of database": choose the records a data block
// shows. Built-in modules (tasks, projects, deals, employees — read as the person), the person's real
// tables (every table they can see, across all their organizations — the data home's own list) and the
// agency sample. Never filtered by the active organization (access ladder).

import { Button, RegionSkeleton, SearchField } from "@ai-matrx/design-system/controls";
import { CircleCheckBig, Contact, Database, FlaskConical, FolderKanban, Handshake } from "lucide-react";
import { useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTablesEverywhere } from "@/features/unified-data/hub/useTablesEverywhere";

import { AGENCY_SAMPLE_ID, BUILT_IN_SOURCES, agencySample } from "./sources";

const BUILT_IN_ICON = { task: CircleCheckBig, project: FolderKanban, deal: Handshake, employee: Contact } as const;

export interface PickedSource {
  /** A custom table's id; empty for a built-in source. */
  tableId: string;
  name: string;
  sample?: string;
  /** A built-in source's token (`{kind: "entity", token}`). */
  entity?: string;
}

function Lists({ query, onPick }: { query: string; onPick: (s: PickedSource) => void }) {
  const tables = useTablesEverywhere();
  const q = query.trim().toLowerCase();
  const real = tables.rows.filter((t) => !q || `${t.table_name} ${t.organization_name}`.toLowerCase().includes(q));
  const sample = agencySample().tables.filter((t) => !q || t.name.toLowerCase().includes(q));
  const builtIn = BUILT_IN_SOURCES.filter((b) => !q || b.name.toLowerCase().includes(q));
  // The list appears once, whole: drawing the sample rows while "Your tables" is still loading moved
  // them down under the pointer when the tables arrived, and a click picked the wrong source.
  if (tables.loading && !tables.rows.length) {
    return (
      <div className="max-h-[min(460px,60dvh)] overflow-hidden px-3 py-2">
        <RegionSkeleton shape="rows" count={8} aria-label="Loading data sources" />
      </div>
    );
  }
  return (
    <div className="max-h-[min(460px,60dvh)] overflow-y-auto py-1">
      {builtIn.length ? <div className="px-3 pt-2 pb-1 type-secondary text-muted-foreground">Built-in</div> : null}
      {builtIn.map((b) => {
        const Icon = BUILT_IN_ICON[b.icon];
        return (
          <Button variant="quiet" icon={<Icon size={15} />} key={b.token} onClick={() => onPick({ tableId: "", name: b.name, entity: b.token })}>
            <span className="flex-1 truncate text-left">{b.name}</span>
          </Button>
        );
      })}
      <div className="px-3 pt-3 pb-1 type-secondary text-muted-foreground">Your tables</div>
      {tables.error ? <div className="px-3 py-2 type-body text-muted-foreground">Your tables could not be listed.</div> : null}
      {!tables.loading && !tables.error && !real.length ? <div className="px-3 py-2 type-body text-muted-foreground">No tables</div> : null}
      {real.map((t) => (
        <Button variant="quiet" icon={<Database size={15} />} key={t.table_id} onClick={() => onPick({ tableId: t.table_id, name: t.table_name })}>
          <span className="flex-1 truncate text-left">{t.table_name}</span>
          <span className="truncate type-secondary text-muted-foreground">{t.organization_name}</span>
        </Button>
      ))}
      <div className="px-3 pt-3 pb-1 type-secondary text-muted-foreground">Sample agency</div>
      {sample.map((t) => (
        <Button variant="quiet" icon={<FlaskConical size={15} />} key={t.id} onClick={() => onPick({ tableId: t.id, name: t.name, sample: AGENCY_SAMPLE_ID })}>
          <span className="flex-1 truncate text-left">{t.name}</span>
          <span className="type-secondary text-muted-foreground">{t.rows} rows</span>
        </Button>
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
