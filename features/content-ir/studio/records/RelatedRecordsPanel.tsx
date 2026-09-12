"use client";

// features/content-ir/studio/records/RelatedRecordsPanel.tsx
//
// The detail panel of /shapes/[kind]/table: the record itself, and ONE TAB PER
// CHILD KIND the parent's shape declares (DD-131 slice 2, item 5).
//
// GENERIC, BY CONSTRUCTION. The tabs come from `content_ir.kind_edge` — the
// shape graph — read through the schema chokepoint. The rows in a tab come
// from the `part_of` associations, ordered by `position`. Nothing in this file
// or the service under it names a kind, so `keyword_relationship_research`
// gets its "Keyword lists" tab for exactly the same reason any future parent
// shape gets its own: it declared a child edge.
//
// EACH TAB CARRIES ITS OWN FILTERS — the same two standing axes the records
// grid outside it has: confirmation (All / Unconfirmed / Confirmed) and the
// canonical archive tri-state. They are independent per tab, because two child
// kinds are two different lists and a filter that leaked between them would
// describe rows the person cannot see.
//
// NOTHING FAILS SILENTLY. A failed read says what failed and offers Try again.
// An empty tab says whether it is empty because nothing exists or because a
// filter is hiding everything, and the archive control's numbers are computed
// from the very rows behind them.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Archive, BadgeCheck, CircleDashed, RotateCw } from "lucide-react";
import {
  ArchiveFilter,
  DEFAULT_ARCHIVE_FILTER,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
  type ArchiveFilterValue,
} from "@ai-matrx/design-system";
import { DataRowInspector } from "@ai-matrx/design-system/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmationBadge } from "@/features/content-ir/records/ConfirmationBadge";
import { shapeInstancePermalink } from "@/features/content-ir/studio/constants";
import {
  listChildKindEdgesFromTables,
  type KindChildEdge,
} from "@/features/content-ir/registry/schema-source-kind-tables";
import { humanizeKey, schemaFields, type SchemaField } from "./buildRecordColumns";
import {
  listRelatedChildRecords,
  type RelatedRecordRow,
  type RelatedRecordsResult,
} from "./related-records-service";
import type { ConfirmationFilter, KindRecordRow } from "./types";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The child kinds one parent kind declares, read once per parent kind per
 * mount. The graph does not change while a person reads a table.
 */
export function useChildKindEdges(kindDefinitionId: string): {
  status: "loading" | "ready" | "error";
  edges: KindChildEdge[];
  message: string | null;
} {
  // The answer is stamped with the request it answers, so a kind change reads
  // as "loading" WITHOUT a reset write in the effect body (the cascading-render
  // pattern React refuses).
  const [answer, setAnswer] = useState<{
    key: string;
    edges: KindChildEdge[];
    message: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const edges = await listChildKindEdgesFromTables(kindDefinitionId);
        if (!cancelled) {
          setAnswer({ key: kindDefinitionId, edges, message: null });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setAnswer({
            key: kindDefinitionId,
            edges: [],
            message: messageOf(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kindDefinitionId]);

  const current = answer && answer.key === kindDefinitionId ? answer : null;
  if (!current) return { status: "loading", edges: [], message: null };
  if (current.message !== null) {
    return { status: "error", edges: [], message: current.message };
  }
  return { status: "ready", edges: current.edges, message: null };
}

export interface RelatedRecordsPanelProps {
  row: KindRecordRow;
  /** The parent kind's slug — used in the record tab's copy payloads. */
  kind: string;
  /** The parent kind's human label. */
  label: string;
  /** The parent kind's child edges (read once by the host table). */
  childEdges: KindChildEdge[];
  /** True while the edge graph is still being read. */
  edgesLoading: boolean;
  /** The reason the edge graph could not be read, when it could not. */
  edgesError: string | null;
}

export function RelatedRecordsPanel({
  row,
  kind,
  label,
  childEdges,
  edgesLoading,
  edgesError,
}: RelatedRecordsPanelProps) {
  const [tab, setTab] = useState("record");

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-col">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="record">{label}</TabsTrigger>
        {childEdges.map((edge) => (
          <TabsTrigger key={edge.fieldName} value={edge.fieldName}>
            {humanizeKey(edge.fieldName)}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="record" className="min-h-0">
        {/* The edge graph's own state is said out loud on the record tab,
            because a MISSING tab is indistinguishable from a shape with no
            children unless the screen says which one it is. */}
        {edgesError ? (
          <p
            className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              <strong>The related records could not be listed.</strong>{" "}
              {edgesError} Any records that belong to this one are still there —
              this panel simply could not read which shapes they are.
            </span>
          </p>
        ) : edgesLoading ? (
          <p className="mb-2 text-xs text-muted-foreground">
            Looking for records that belong to this one…
          </p>
        ) : null}
        <DataRowInspector
          row={row}
          recordKind={kind}
          recordLabel={`${label} record`}
          location={`/shapes/${kind}/table`}
        />
      </TabsContent>

      {childEdges.map((edge) => (
        <TabsContent key={edge.fieldName} value={edge.fieldName} className="min-h-0">
          <RelatedChildList parentId={row.id} edge={edge} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

interface ListState {
  status: "loading" | "ready" | "error";
  result: RelatedRecordsResult | null;
  message: string | null;
}

const LOADING: ListState = { status: "loading", result: null, message: null };

/** One completed read, stamped with the request it answers. */
interface ListAnswer {
  key: string;
  result: RelatedRecordsResult | null;
  message: string | null;
}

/** ONE child kind's rows under one parent, with this tab's own two filters. */
function RelatedChildList({
  parentId,
  edge,
}: {
  parentId: string;
  edge: KindChildEdge;
}) {
  const [confirmation, setConfirmation] = useState<ConfirmationFilter>("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilterValue>(
    DEFAULT_ARCHIVE_FILTER,
  );
  const [answer, setAnswer] = useState<ListAnswer | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  const [fields] = useState<SchemaField[]>(() =>
    schemaFields(edge.childEmittedJsonSchema),
  );

  // The whole query said once. Changing a filter reads as "loading" because
  // the stamped answer no longer matches the question — no reset write.
  const requestKey = [
    parentId,
    edge.childDefinitionId,
    confirmation,
    archiveFilter,
    reloadKey,
  ].join("|");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await listRelatedChildRecords({
          parentId,
          childDefinitionId: edge.childDefinitionId,
          confirmation,
          archiveFilter,
        });
        if (!cancelled) setAnswer({ key: requestKey, result, message: null });
      } catch (error: unknown) {
        if (!cancelled) {
          setAnswer({ key: requestKey, result: null, message: messageOf(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `requestKey` IS every input this read takes, said once.
  }, [requestKey, parentId, edge.childDefinitionId, confirmation, archiveFilter]);

  const current = answer && answer.key === requestKey ? answer : null;
  const state: ListState = !current
    ? LOADING
    : current.message !== null
      ? { status: "error", result: null, message: current.message }
      : { status: "ready", result: current.result, message: null };
  const result = state.result;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          value={confirmation}
          onValueChange={(value) => {
            if (value === "all" || value === "unconfirmed" || value === "confirmed") {
              setConfirmation(value);
            }
          }}
          aria-label={`Standing of these ${edge.childLabel} records`}
        >
          <ToggleGroupItem value="all">
            All
            {result ? ` ${result.confirmationCounts.all}` : ""}
          </ToggleGroupItem>
          <ToggleGroupItem value="unconfirmed">
            <CircleDashed className="mr-1 h-3.5 w-3.5" />
            Unconfirmed
            {result ? ` ${result.confirmationCounts.unconfirmed}` : ""}
          </ToggleGroupItem>
          <ToggleGroupItem value="confirmed">
            <BadgeCheck className="mr-1 h-3.5 w-3.5" />
            Confirmed
            {result ? ` ${result.confirmationCounts.confirmed}` : ""}
          </ToggleGroupItem>
        </ToggleGroup>
        <ArchiveFilter
          value={archiveFilter}
          onValueChange={setArchiveFilter}
          counts={result?.archiveCounts}
          size="sm"
          aria-label={`Archived ${edge.childLabel} records`}
        />
      </div>

      {state.status === "loading" ? (
        <p className="text-xs text-muted-foreground">
          Reading the {edge.childLabel} records that belong to this one…
        </p>
      ) : state.status === "error" ? (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="min-w-0">
            <strong>These records could not be read.</strong> {state.message}
            <Button
              size="sm"
              variant="outline"
              className="ml-2 h-6 px-2 text-xs"
              onClick={reload}
            >
              <RotateCw className="mr-1 h-3 w-3" />
              Try again
            </Button>
          </span>
        </div>
      ) : result && result.rows.length > 0 ? (
        <ol className="space-y-1.5">
          {result.rows.map((child) => (
            <RelatedChildRow key={child.id} row={child} fields={fields} />
          ))}
        </ol>
      ) : (
        <EmptyRelatedList
          edge={edge}
          result={result}
          archiveFilter={archiveFilter}
          confirmation={confirmation}
          onShowArchived={() => setArchiveFilter("archived")}
          onClearConfirmation={() => setConfirmation("all")}
        />
      )}
    </div>
  );
}

/**
 * A list may not say "none" while its own filters are hiding rows. Each branch
 * below names the number it is hiding and offers the one click that reaches
 * it; the last one is the honest "there really are none".
 */
function EmptyRelatedList({
  edge,
  result,
  archiveFilter,
  confirmation,
  onShowArchived,
  onClearConfirmation,
}: {
  edge: KindChildEdge;
  result: RelatedRecordsResult | null;
  archiveFilter: ArchiveFilterValue;
  confirmation: ConfirmationFilter;
  onShowArchived: () => void;
  onClearConfirmation: () => void;
}) {
  const archivedHidden =
    archiveFilter === "active" ? (result?.archiveCounts.archived ?? 0) : 0;
  const confirmationHidden =
    confirmation !== "all" && result ? result.confirmationCounts.all : 0;

  if (archivedHidden > 0) {
    return (
      <div className="rounded-md border border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
        <p>
          Nothing live here — all {archivedHidden} {edge.childLabel} record
          {archivedHidden === 1 ? " is" : "s are"} archived.
        </p>
        <Button size="sm" className="mt-2 h-7 px-2 text-xs" onClick={onShowArchived}>
          <Archive className="mr-1 h-3.5 w-3.5" />
          Show archived
        </Button>
      </div>
    );
  }

  if (confirmationHidden > 0) {
    return (
      <div className="rounded-md border border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
        <p>
          None of the {confirmationHidden} {edge.childLabel} record
          {confirmationHidden === 1 ? "" : "s"} here{" "}
          {confirmationHidden === 1 ? "is" : "are"} {confirmation}.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 px-2 text-xs"
          onClick={onClearConfirmation}
        >
          Show all standings
        </Button>
      </div>
    );
  }

  return (
    <p className="rounded-md border border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
      This record declares a <strong>{humanizeKey(edge.fieldName)}</strong> field,
      but no {edge.childLabel} records have been written for it yet. They appear
      here, in the order the record declares them, as soon as one exists.
    </p>
  );
}

/** One child row: its place in the parent, its name, its standing, its values. */
function RelatedChildRow({
  row,
  fields,
}: {
  row: RelatedRecordRow;
  fields: SchemaField[];
}) {
  const preview = fields
    .map((field) => {
      const value = row.data[field.key];
      if (value === null || value === undefined || value === "") return null;
      const text = Array.isArray(value)
        ? value.map((v) => String(v)).join(", ")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
      return { label: field.label, text };
    })
    .filter((entry): entry is { label: string; text: string } => entry !== null);

  return (
    <li className="rounded-md border border-border/70 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          {/* The position is part of the record's meaning: this IS the third
              item of the parent's array, and the screen says so. */}
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {row.position === null ? "—" : row.position + 1}
          </span>
          <Link
            href={shapeInstancePermalink(row.id)}
            className="truncate text-xs font-medium text-foreground hover:underline"
          >
            {row.title?.trim() || "Untitled record"}
          </Link>
        </div>
        <ConfirmationBadge confirmation={row.confirmation} className="shrink-0" />
      </div>
      {preview.length > 0 ? (
        <dl className="mt-1 space-y-0.5">
          {preview.map((entry) => (
            <div key={entry.label} className="flex gap-1.5 text-[11px]">
              <dt className="shrink-0 text-muted-foreground">{entry.label}</dt>
              <dd className="line-clamp-2 min-w-0 text-foreground" title={entry.text}>
                {entry.text}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}
