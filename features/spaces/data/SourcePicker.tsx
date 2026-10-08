"use client";

// features/spaces/data/SourcePicker.tsx — "Linked view of database": choose the records a data block
// shows. Built-in modules (tasks, projects, deals, employees — read as the person), the person's real
// tables (every table they can see, across all their organizations — the data home's own list) and the
// agency sample — picking one installs the agency's real tables in the PAGE's organization, as "Add the
// sample" does (once; a second pick reuses them; the active organization only when the page is unsaved). The lists are never filtered by the active organization (access ladder).

import { Button, RegionSkeleton, SearchField } from "@ai-matrx/design-system/controls";
import { CircleCheckBig, Contact, Database, FlaskConical, FolderKanban, Handshake, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useTablesEverywhere } from "@/features/unified-data/hub/useTablesEverywhere";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

import { installAgencySample, pageOrganizationId, type AgencyToken } from "./agency-install";
import { AGENCY_SPEC } from "./agency-spec";
import { BUILT_IN_SOURCES } from "./sources";

const BUILT_IN_ICON = { task: CircleCheckBig, project: FolderKanban, deal: Handshake, employee: Contact } as const;

export interface PickedSource {
  /** A custom table's id; empty for a built-in source. */
  tableId: string;
  name: string;
  sample?: string;
  /** A built-in source's token (`{kind: "entity", token}`). */
  entity?: string;
}

function Lists({ query, onPick, spaceId }: { query: string; onPick: (s: PickedSource) => void; spaceId?: string }) {
  const tables = useTablesEverywhere();
  const q = query.trim().toLowerCase();
  const real = tables.rows.filter((t) => !q || `${t.table_name} ${t.organization_name}`.toLowerCase().includes(q));
  const sample = AGENCY_SPEC.tables.filter((t) => !q || t.name.toLowerCase().includes(q));
  // org-filter: write-target a sample picked on an unsaved page installs in the active organization
  const activeOrg = useAppSelector(selectActiveOrganizationId);
  const dispatch = useAppDispatch();
  const [installing, setInstalling] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const pickSample = async (token: AgencyToken | "offer") => {
    setInstalling(token);
    setFailed(null);
    try {
      // The page and its tables share one organization (the same rule as "Add the sample").
      const orgId = (spaceId ? await pageOrganizationId(spaceId) : null) ?? (await ensureOrgId(activeOrg));
      const made = (await installAgencySample(orgId, dispatch))[token];
      if (!made) throw new Error("This organization's sample has no such table yet.");
      onPick({ tableId: made.tableId, name: made.name });
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "The sample could not be added.");
    } finally {
      setInstalling(null);
    }
  };
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
        <Button
          variant="quiet"
          icon={installing === t.token ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
          key={t.token}
          disabled={installing !== null}
          onClick={() => void pickSample(t.token as AgencyToken | "offer")}
        >
          <span className="flex-1 truncate text-left">{t.name}</span>
          <span className="type-secondary text-muted-foreground">{t.rows.length} rows</span>
        </Button>
      ))}
      {failed ? <div className="px-3 py-2 type-body text-destructive">{failed}</div> : null}
    </div>
  );
}

/** Returns the dialog to render and an async `pick()` that resolves with the chosen source (or null).
 *  `spaceId` is the page the block sits on: a picked sample installs into that page's organization. */
export function useSourcePicker(spaceId?: string): [React.ReactNode, () => Promise<PickedSource | null>] {
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
      <DialogContent padding="none" showCloseButton={false}>
        <DialogTitle className="sr-only">Choose a data source</DialogTitle>
        <div className="border-b border-border p-2">
          <SearchField autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a data source…" aria-label="Search data sources" />
        </div>
        {open ? <Lists query={query} onPick={finish} spaceId={spaceId} /> : null}
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
