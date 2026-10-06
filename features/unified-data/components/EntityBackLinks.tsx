"use client";

// features/unified-data/components/EntityBackLinks.tsx
//
// THE "LINKED RECORDS" SECTION OF EVERY PLATFORM RECORD VIEW (AP-4, Arman 2026-10-06: an
// organization's own custom rows that link to a CRM contact or an HR employee show on that record).
//
//   <EntityBackLinks entityToken="hr_employee" recordId={employee.id} organizationId={row.organization_id} />
//
// `EntityCustomFields` renders it, so every page, peek and Detail host that carries the custom-fields
// line carries this one too; a record view that carries its custom fields another way (the party's
// StandardRecordForm) mounts it beside that form. G1 fails a record view with neither
// (every-record-view-has-custom-fields.test.ts, "record view without Linked records").
//
// The store answers (`custom.entity_back_links`, through hub/doors.ts): which custom rows link here,
// by which field, in which table. The organization is the ROW's, never the active one. Rows group by
// table and each opens its custom record page; more load through `next_cursor`.

import { useState } from "react";
import { Link2 } from "lucide-react";
import { recordsDataSource } from "@ai-matrx/records-ui";
import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { createClient } from "@/utils/supabase/client";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import {
  entityBackLinks,
  type EntityBackLinkItem,
  type EntityBackLinksAnswer,
} from "@/features/unified-data/hub/doors";
import { recordPageHref } from "@/features/unified-data/table-page/recordPageHref";

export interface EntityBackLinksProps {
  entityToken: string;
  recordId: string;
  /** The row's organization (never the active one). Nothing is asked until it is known. */
  organizationId: string | null;
  className?: string;
}

export const backLinksKey = (organizationId: string, token: string, recordId: string) =>
  `unified-data.back-links:${organizationId}:${token}:${recordId}`;

type FirstPage = { kind: "page"; answer: EntityBackLinksAnswer } | { kind: "door-absent" };

let announcedAbsent = false;

/** Group items by table, keeping the order the store gave. */
export function groupBackLinksByTable(items: EntityBackLinkItem[]) {
  const groups = new Map<string, { tableId: string; tableLabel: string | null; items: EntityBackLinkItem[] }>();
  for (const item of items) {
    const group = groups.get(item.table_id) ?? { tableId: item.table_id, tableLabel: item.table_label, items: [] };
    group.items.push(item);
    groups.set(item.table_id, group);
  }
  return [...groups.values()];
}

export function EntityBackLinks({ entityToken, recordId, organizationId, className }: EntityBackLinksProps) {
  const read = useStoreRead<FirstPage>(
    organizationId ? backLinksKey(organizationId, entityToken, recordId) : null,
    async () => {
      const answer = await entityBackLinks(recordsDataSource(createClient()), organizationId!, entityToken, recordId);
      if (answer.ok) return { kind: "page", answer: answer.data };
      if (answer.error.sqlstate === "PGRST202" || answer.error.sqlstate === "42883") return { kind: "door-absent" };
      console.error("[EntityBackLinks] custom.entity_back_links failed", { entityToken, recordId, error: answer.error });
      throw new Error(answer.error.message);
    },
  );
  const [more, setMore] = useState<{ items: EntityBackLinkItem[]; cursor: string | null | undefined; busy: boolean; failed: boolean }>({
    items: [],
    cursor: undefined,
    busy: false,
    failed: false,
  });

  if (!organizationId) return null;
  if (read.data?.kind === "door-absent") {
    if (!announcedAbsent) {
      announcedAbsent = true;
      console.warn("[EntityBackLinks] custom.entity_back_links is not on this database yet; the Linked records section stays hidden until it is.");
    }
    return null;
  }
  if (read.status === "error" && !read.hasData) {
    return (
      <section data-section="back-links" data-state="error" className={className}>
        <h3 className="text-sm font-medium">Linked records</h3>
        <span className="text-xs text-muted-foreground">Couldn&apos;t read linked records</span>
        <Button size="sm" variant="ghost" onClick={() => void read.refresh()}>
          Retry
        </Button>
      </section>
    );
  }
  if (read.data?.kind !== "page") return null;

  const first = read.data.answer;
  const items = [...first.items, ...more.items];
  const cursor = more.cursor === undefined ? first.next_cursor : more.cursor;

  const loadMore = async () => {
    if (!cursor || !organizationId) return;
    setMore((m) => ({ ...m, busy: true, failed: false }));
    const answer = await entityBackLinks(recordsDataSource(createClient()), organizationId, entityToken, recordId, cursor);
    if (!answer.ok) {
      console.error("[EntityBackLinks] custom.entity_back_links (next page) failed", { entityToken, recordId, error: answer.error });
      setMore((m) => ({ ...m, busy: false, failed: true }));
      return;
    }
    setMore((m) => ({ items: [...m.items, ...answer.data.items], cursor: answer.data.next_cursor, busy: false, failed: false }));
  };

  return (
    <section data-section="back-links" data-state={items.length ? "ready" : "empty"} className={className}>
      <h3 className="text-sm font-medium">Linked records</h3>
      {items.length === 0 ? (
        <EmptyState icon={<Link2 className="h-5 w-5" />} title="Nothing links here" />
      ) : (
        <div className="flex flex-col gap-2">
          {groupBackLinksByTable(items).map((group) => (
            <div key={group.tableId} data-back-links-table={group.tableId} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{group.tableLabel ?? "Table"}</span>
              {group.items.map((item) => (
                <EntityRef
                  key={`${item.record.id}:${item.field_id}`}
                  token="record"
                  id={item.record.id}
                  name={item.record.label}
                  href={recordPageHref(item.table_id, item.record.id)}
                  showIcon={false}
                  disablePeek
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {cursor ? (
        <Button size="sm" variant="ghost" disabled={more.busy} onClick={() => void loadMore()}>
          {more.failed ? "Retry" : "Load more"}
        </Button>
      ) : null}
    </section>
  );
}
