"use client";

// features/admin/relationships/components/ReachabilityInspectorClient.tsx
//
// The "why can they see this?" debugger — its own tab on the Relationships
// hub. Self-fetching via the admin_reachability_* SECURITY DEFINER RPCs
// (super-admin re-checked in the DB); no server props needed.
//
// THE DOOR LAW: every row here is a REAL record (a note, a file, a project…),
// and the row already knows its own entity token — so the id column is a
// `MatrxUuidCell` with a per-row token, which resolves route + new tab + peek
// from the registries. A bare uuid in this table was a dead end with extra
// steps.
//
// It is also a DESTINATION: `?mode=&type=&id=` prefills the form and runs the
// lookup on mount, so a "N conveying containers" count elsewhere (the Exposure
// Audit) can reach the actual containers instead of just naming them.

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, RefreshCw, Search } from "lucide-react";
import { toast } from "@/lib/toast";

import { createClient } from "@/utils/supabase/client";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { EntityTypeCombobox } from "@/components/entity-types/EntityTypeCombobox";
import {
  MatrxDataTable,
  MatrxUuidCell,
} from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConveyPill } from "./shared";
import { reachabilityCoverage } from "./reachability-coverage";
import { RELATIONSHIPS_LOCATION } from "../utils";
import type { ReachabilityContainer, ReachabilityContent } from "../types";
import {
  booleanUrlCodec,
  enumUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@ai-matrx/kit/url-state";
import { extractErrorMessage } from "@ai-matrx/data/net";

export type ReachabilityMode = "contents" | "containers";

export interface ReachabilityInspectorClientProps {
  /** Deep link: which direction to inspect. */
  initialMode?: ReachabilityMode;
  /** Deep link: entity token of the record to inspect. */
  initialType?: string;
  /** Deep link: record id. With `initialType`, the lookup runs on mount. */
  initialId?: string;
}

const contentsColumns: MatrxColumnDef<ReachabilityContent>[] = [
  {
    id: "item_type",
    accessorKey: "item_type",
    header: "Item",
    cell: (row) => <EntityTypeChip token={row.item_type} showToken />,
    width: 208,
  },
  {
    id: "item_id",
    accessorKey: "item_id",
    header: "ID",
    cell: (row) => (
      <MatrxUuidCell value={row.item_id} token={row.item_type} label="Item" />
    ),
    width: 384,
  },
  {
    id: "depth",
    accessorKey: "depth",
    header: "Depth",
    filter: "number",
    align: "right",
    cell: (row) => <span className="text-xs tabular-nums">{row.depth}</span>,
    width: 80,
  },
  {
    id: "max_level",
    accessorKey: "max_level",
    header: "Max level",
    cell: (row) => <ConveyPill level={row.max_level} />,
    width: 112,
  },
];

const containersColumns: MatrxColumnDef<ReachabilityContainer>[] = [
  {
    id: "container_type",
    accessorKey: "container_type",
    header: "Container",
    cell: (row) => <EntityTypeChip token={row.container_type} showToken />,
    width: 208,
  },
  {
    id: "container_id",
    accessorKey: "container_id",
    header: "ID",
    cell: (row) => (
      <MatrxUuidCell
        value={row.container_id}
        token={row.container_type}
        label="Container"
      />
    ),
    width: 384,
  },
  {
    id: "depth",
    accessorKey: "depth",
    header: "Depth",
    filter: "number",
    align: "right",
    cell: (row) => <span className="text-xs tabular-nums">{row.depth}</span>,
    width: 80,
  },
  {
    id: "max_level",
    accessorKey: "max_level",
    header: "Max level",
    cell: (row) => <ConveyPill level={row.max_level} />,
    width: 112,
  },
];

export function ReachabilityInspectorClient({
  initialMode,
  initialType,
  initialId,
}: ReachabilityInspectorClientProps = {}) {
  const supabase = useMemo(() => createClient(), []);
  const initialDeepLink = useRef(Boolean(initialType && initialId));
  const [mode, setMode] = useUrlState(
    "mode",
    enumUrlCodec<ReachabilityMode>(["contents", "containers"], "contents"),
  );
  const [entityType, setEntityType] = useUrlState(
    "type",
    stringUrlCodec("thread"),
  );
  const [entityId, setEntityId] = useUrlState("id", stringUrlCodec());
  const [hasRun, setHasRun] = useUrlState("run", booleanUrlCodec(false));
  const [loading, setLoading] = useState(false);
  const [contents, setContents] = useState<ReachabilityContent[] | null>(null);
  const [containers, setContainers] = useState<ReachabilityContainer[] | null>(
    null,
  );
  /** The lookup that produced the current results — the form fields may have
   *  been edited since, so copy payloads read this, never the live inputs. */
  const [lastLookup, setLastLookup] = useState<{
    mode: ReachabilityMode;
    entityType: string;
    entityId: string;
  } | null>(null);

  // Only the LATEST lookup may write results. Two can overlap — the deep-link
  // effect plus a manual "Look up", or a second ?mode=&type=&id= navigation
  // before the first RPC returns — and an out-of-order finish would leave the
  // table showing an older query's answer under the newer URL. Reporting the
  // wrong record's containers is a wrong door.
  const lookupSeq = useRef(0);

  /** Run the lookup for EXPLICIT arguments — a deep link can't wait for state. */
  async function lookupFor(
    lookupMode: ReachabilityMode,
    lookupType: string,
    rawId: string,
  ) {
    const id = rawId.trim();
    if (!id) {
      toast.error("Enter an entity UUID");
      return;
    }
    if (!lookupType) {
      toast.error("Pick an entity type");
      return;
    }
    const seq = ++lookupSeq.current;
    const isStale = () => seq !== lookupSeq.current;

    setLoading(true);
    setContents(null);
    setContainers(null);
    try {
      if (lookupMode === "contents") {
        const { data, error } = await supabase.rpc(
          "admin_reachability_contents",
          { p_type: lookupType, p_id: id },
        );
        if (error) throw error;
        if (isStale()) return;
        setContents(data ?? []);
        setLastLookup({
          mode: lookupMode,
          entityType: lookupType,
          entityId: id,
        });
      } else {
        const { data, error } = await supabase.rpc(
          "admin_reachability_containers",
          { p_type: lookupType, p_id: id },
        );
        if (error) throw error;
        if (isStale()) return;
        setContainers(data ?? []);
        setLastLookup({
          mode: lookupMode,
          entityType: lookupType,
          entityId: id,
        });
      }
    } catch (e) {
      if (isStale()) return;
      toast.error(
        `Lookup failed: ${extractErrorMessage(e)}`,
      );
    } finally {
      if (!isStale()) setLoading(false);
    }
  }

  // Deep link (?mode=&type=&id=): run the lookup so the caller that linked here
  // lands on the answer, not on a form it has to re-fill. Keyed by the link
  // itself, not by "have we run once" — a client-side navigation to a DIFFERENT
  // record re-renders this same component instance, so a one-shot ref would
  // leave the old answer on screen under the new URL (or run the wrong RPC,
  // since `mode` also comes from the link). Kicked off from a microtask so no
  // setState runs synchronously in the effect body.
  useEffect(() => {
    if (!initialDeepLink.current) return;
    initialDeepLink.current = false;
    setHasRun(true);
  }, [setHasRun]);

  useEffect(() => {
    if (!hasRun || !entityType || !entityId) return;
    queueMicrotask(() => void lookupFor(mode, entityType, entityId));
  }, [entityId, entityType, hasRun, mode]);

  const rows = mode === "contents" ? contents : containers;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Layers className="h-4 w-4" />
        Reachability inspector
        <span className="font-normal text-muted-foreground">
          — the &ldquo;why can they see this?&rdquo; debugger
        </span>
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={mode}
          onValueChange={(v) => {
            setMode(v as typeof mode);
            setHasRun(false);
            setContents(null);
            setContainers(null);
          }}
        >
          <SelectTrigger className="h-8 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contents">
              What does this container reach?
            </SelectItem>
            <SelectItem value="containers">
              Which containers convey access to this item?
            </SelectItem>
          </SelectContent>
        </Select>
        <EntityTypeCombobox
          value={entityType || null}
          onChange={(t) => {
            setEntityType(t);
            setHasRun(false);
            setContents(null);
            setContainers(null);
          }}
          placeholder="entity type…"
          className="w-52"
        />
        <Input
          value={entityId}
          onChange={(e) => {
            setEntityId(e.target.value);
            setHasRun(false);
            setContents(null);
            setContainers(null);
          }}
          placeholder="entity UUID"
          className="h-8 w-80 font-mono text-xs"
        />
        <Button
          size="sm"
          disabled={loading}
          onClick={() => {
            if (hasRun) void lookupFor(mode, entityType, entityId);
            else setHasRun(true);
          }}
        >
          {loading ? (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          Look up
        </Button>
        {rows !== null && rows.length > 0 && lastLookup !== null && (
          <CopyButtons
            size="sm"
            label={
              lastLookup.mode === "contents"
                ? "Reachable contents"
                : "Conveying containers"
            }
            human={() =>
              [
                lastLookup.mode === "contents"
                  ? `Everything reachable from ${lastLookup.entityType} ${lastLookup.entityId} (${rows.length} rows):`
                  : `Containers conveying access to ${lastLookup.entityType} ${lastLookup.entityId} (${rows.length} rows):`,
                ...rows.map((row) => {
                  const type =
                    "item_type" in row ? row.item_type : row.container_type;
                  const id = "item_id" in row ? row.item_id : row.container_id;
                  return `${type} ${id} — depth=${row.depth} max_level=${row.max_level}`;
                }),
              ].join("\n")
            }
            json={() => rows}
            agent={() => ({
              kind:
                lastLookup.mode === "contents"
                  ? "reachability-contents"
                  : "reachability-containers",
              location: RELATIONSHIPS_LOCATION,
              description:
                lastLookup.mode === "contents"
                  ? "Reachability inspector result: every record this container conveys access to, with depth and max access level."
                  : "Reachability inspector result: every container that conveys access to this record, with depth and max access level.",
              data: rows,
              attributes: {
                mode: lastLookup.mode,
                entity_type: lastLookup.entityType,
                entity_id: lastLookup.entityId,
                rows: rows.length,
              },
            })}
          />
        )}
      </div>

      {mode === "contents" && contents !== null ? (
        <MatrxDataTable<ReachabilityContent>
          data={contents}
          columns={contentsColumns}
          getRowId={(row) => `${row.item_type}:${row.item_id}`}
          defaultSort={{ id: "depth", direction: "asc" }}
          pageSize={0}
          hidePagination
          copy={false}
          coverage={reachabilityCoverage("reachable item", contents.length)}
          emptyState={{ title: "This container reaches nothing." }}
          toolbar={{
            title: "Reachable contents",
            search: true,
            searchPlaceholder: "Search reachable contents…",
          }}
        />
      ) : null}
      {mode === "containers" && containers !== null ? (
        <MatrxDataTable<ReachabilityContainer>
          data={containers}
          columns={containersColumns}
          getRowId={(row) => `${row.container_type}:${row.container_id}`}
          defaultSort={{ id: "depth", direction: "asc" }}
          pageSize={0}
          hidePagination
          copy={false}
          coverage={reachabilityCoverage("conveying container", containers.length)}
          emptyState={{ title: "No container conveys access to this item." }}
          toolbar={{
            title: "Conveying containers",
            search: true,
            searchPlaceholder: "Search conveying containers…",
          }}
        />
      ) : null}
    </section>
  );
}
