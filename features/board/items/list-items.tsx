"use client";

/**
 * Pick list on a board — the `/pick-lists` feature. A list is a Table of choices in the record store
 * (`custom.*`, one Record per choice), and `/pick-lists/<id>` opens it as the store's table page
 * (`UnifiedDataTablePage`). The tile body IS that page's body: `TableRecordBody`
 * (`useUnifiedTable` + `UnifiedTableBody`, the same component the Table item and the page render),
 * so every column, row action, Share and menu of the list's own page is here, and the
 * `matrx-user/data-tables` surface the body mounts is the page's surface for this list (values,
 * write targets, client tools). Only the page's one explanatory line and back link are left out.
 *
 * Start new places a tile at once; the list is made when the person presses Create (never on mount)
 * through `createList` — `custom.pick_list_create`, filed in the organization the gate resolves.
 * Bring in lists every pick list the person may open across ALL their organizations, from THE LIST
 * INDEX (`readPickListIndex`), never the active organization.
 */

import { useEffect, useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import { BasicInput } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { readOf } from "@/components/read-state/ReadGate";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { createList } from "@/features/data-tables/pick-lists/service";
import { listAddress } from "@/features/data-tables/pick-lists/where-lists-live";
import { readPickListIndex, type PickListEntry } from "@/features/data-tables/pick-lists/pick-list-index";
import { findPickLists } from "./record-finders";
import { DATA_TABLES_SURFACE } from "@/features/unified-data/grid-agent-context/RecordStoreTableSurface";
import type { NodeSource } from "../board/document";
import type { BoardItemType, ItemBodyProps, PickerProps } from "./types";
import { RecordList } from "./feature-items";
import { TableRecordBody } from "./data-items";

import { Spinner } from "@/components/ui/loaders/Spinner";
export const LIST_ITEM_KEY = "list";
const NEW_LIST_TITLE = "New pick list";

export function listSource(id: string | null): NodeSource {
  return { kind: "entity", entity: LIST_ITEM_KEY, id };
}

export function listIdOf(source: NodeSource): string | null {
  return source.kind === "entity" && source.entity === LIST_ITEM_KEY ? source.id : null;
}

// ─── Bring in ────────────────────────────────────────────────────────────────

type Read =
  | { phase: "reading" }
  | { phase: "read"; lists: PickListEntry[]; archivedIds: ReadonlySet<string> }
  | { phase: "failed"; why: string };

function ListPicker({ onPick, onCancel }: PickerProps) {
  const [read, setRead] = useState<Read>({ phase: "reading" });
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let alive = true;
    setRead({ phase: "reading" });
    void readPickListIndex(supabase, { everywhere: true }).then((answered) => {
      if (!alive) return;
      setRead(answered.ok ? { phase: "read", lists: answered.lists, archivedIds: new Set(answered.archivedIds) } : { phase: "failed", why: answered.why });
    });
    return () => {
      alive = false;
    };
  }, [again]);
  return (
    <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
      <RecordList
        rows={read.phase === "read" ? read.lists : []}
        read={readOf(
          { loading: read.phase === "reading", error: read.phase === "failed" ? new Error(read.why) : null },
          { what: "your pick lists", onRetry: () => setAgain((n) => n + 1) },
        )}
        rowKey={(l) => l.id}
        isArchived={(l) => read.phase === "read" && read.archivedIds.has(l.id)}
        rowText={(l) => `${l.listName} ${l.organizationName ?? ""}`}
        onChoose={(l) => onPick([{ title: l.listName, source: listSource(l.id) }])}
        onCancel={onCancel}
        emptyState={<>No pick lists yet. Make one with New pick list.</>}
        renderRow={(l) => (
          <>
            <span className="min-w-0 flex-1 truncate">{l.listName}</span>
            <span className="shrink-0 truncate type-secondary text-muted-foreground">
              {l.itemCount} {l.itemCount === 1 ? "choice" : "choices"}
              {l.organizationName ? ` · ${l.organizationName}` : ""}
            </span>
          </>
        )}
      />
    </div>
  );
}

// ─── Start new ───────────────────────────────────────────────────────────────

type Failure = { reason: string; cancelled: boolean };

/** Outside the component: a `try` inside one makes the React Compiler skip it. */
async function makeList(name: string, userId: string): Promise<{ id: string } | { failure: Failure }> {
  try {
    // A NEW pick list is filed in the organization the gate resolves (it asks when none is set).
    // org-filter: write-target — the same birth the Pick lists page does
    const organizationId = await ensureOrgId(null);
    const made = (await createList({
      p_list_name: name,
      p_user_id: userId,
      p_organization_id: organizationId,
      p_items: [],
    })) as { list_id?: string; id?: string } | null;
    const id = made?.list_id ?? made?.id;
    if (!id) throw new Error("The list was made but its address did not come back. It is on the Pick lists page.");
    return { id };
  } catch (err) {
    console.error("[board/list] could not create the pick list", err);
    return { failure: { reason: err instanceof Error ? err.message : String(err), cancelled: false } };
  }
}

/** A new pick list tile before its list exists: nothing is made until Create is pressed. */
function ListDraftBody({ onSource }: Pick<ItemBodyProps, "onSource">) {
  const userId = useAppSelector(selectUserId);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const busy = useRef(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy.current || !userId) return;
    busy.current = true;
    setCreating(true);
    setFailure(null);
    const result = await makeList(trimmed, userId);
    busy.current = false;
    setCreating(false);
    if ("failure" in result) setFailure(result.failure);
    else onSource(listSource(result.id), trimmed);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-card p-6 text-center">
      {failure ? (
        <ErrorNotice
          size="compact"
          title={failure.cancelled ? "No workspace chosen" : "This pick list could not be created"}
          message={failure.reason}
          operation="Create a pick list on the board"
        />
      ) : null}
      <BasicInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void create();
        }}
        placeholder="Name the pick list"
        aria-label="Pick list name"
        className="w-full max-w-xs"
      />
      <Button icon={creating ? <Spinner size="xs" className="text-current" /> : <ListChecks />} variant="primary" onClick={() => void create()} disabled={creating || !name.trim() || !userId}>
        Create
      </Button>
    </div>
  );
}

function ListBody(props: ItemBodyProps) {
  const id = listIdOf(props.source);
  return id ? <TableRecordBody key={id} id={id} {...props} /> : <ListDraftBody onSource={props.onSource} />;
}

export const LIST_ITEMS: readonly BoardItemType[] = [
  {
    key: LIST_ITEM_KEY,
    // The page mounts no surface of its own; the table page's body mounts the data-tables surface.
    surface: { name: DATA_TABLES_SURFACE },
    // A pick list is a record-store table: like the Table item it has no thread of its own.
    comments: null,
    label: "Pick list",
    kindLabel: "pick list",
    icon: ListChecks,
    group: "work",
    accent: "teal",
    status: { none: "A list of choices has no running state." },
    // Wide enough for the table's Name column (~170 px, equal-share columns) to read a normal name beside five other columns and
    // the pinned Actions column (at 760 it was ~96 px: "Cigna ...").
    defaultSize: { w: 1240, h: 560 },
    matches: (s) => s.kind === "entity" && s.entity === LIST_ITEM_KEY,
    Body: ListBody,
    startNew: { label: NEW_LIST_TITLE, create: () => ({ title: NEW_LIST_TITLE, source: listSource(null) }) },
    bringIn: { label: "Pick list", Picker: ListPicker },
    // Pick lists are not in the search projection: the pick list picker's own index, matched on the name.
    record: {
      place: (id, title) => ({ title: title?.trim() || "Pick list", source: listSource(id) }),
      find: (query, limit) => findPickLists(LIST_ITEM_KEY, query, limit, () => readPickListIndex(supabase, { everywhere: true })),
    },
    href: (s) => {
      const id = listIdOf(s);
      return id ? listAddress(id) : null;
    },
    // Same body as the Table item, whose remount case passes (data-table); the list case runs the
    // same cycle against a list source.
    sleeps: true,
  },
];
