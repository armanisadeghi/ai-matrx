"use client";

// features/spaces/data/published-rows.tsx — the rows a page published to the web carries (J1, Notion).
//
// Publishing a page publishes what is on it. `content.space_public_view` answers, behind the page's own
// "Published to the web", the rows of each database block on that page through that block's own views
// (filters, sort, hidden properties) as the publisher sees them. Here they become a read-only in-memory
// record store, one per organization, so the same grid, board and chart draw them for a signed-out reader —
// no table grant, no second read. A table not in the answer is not on the web, and says so.

import type { RecordsConfig } from "@ai-matrx/records";
import { memoryDataSource, stableId, type MemoryField, type MemoryOption, type MemoryTable, type MemoryWorld } from "@ai-matrx/records/memory";
import { createContext, useContext, type ReactNode } from "react";

import type { PublishedDatabase } from "./published-databases";

function emptyWorld(organizationId: string): MemoryWorld {
  return {
    organization_id: organizationId,
    user_id: stableId("spaces-published-reader"),
    timezone: "UTC",
    today: new Date().toISOString().slice(0, 10),
    businessName: "",
    tables: [],
    tableById: new Map(),
    views: [],
    forms: [],
    dashboards: [],
    recordTable: new Map(),
    stageField: new Map(),
  };
}

/** Every published block's rows → one in-memory store per organization (blocks on one table merge). */
export function publishedWorlds(databases: Record<string, PublishedDatabase>): Map<string, RecordsConfig> {
  const worlds = new Map<string, MemoryWorld>();
  for (const db of Object.values(databases)) {
    if (db.unreadable || !db.organizationId) continue;
    let world = worlds.get(db.organizationId);
    if (!world) {
      world = emptyWorld(db.organizationId);
      worlds.set(db.organizationId, world);
    }
    let table = world.tableById.get(db.tableId);
    if (!table) {
      table = {
        id: db.tableId,
        token: typeof db.table.slug === "string" ? db.table.slug : db.tableId,
        document: { ...db.table, fields: [] as string[] },
        fields: [],
        options: new Map(),
        rows: new Map(),
        order: [],
      } satisfies MemoryTable;
      world.tables.push(table);
      world.tableById.set(table.id, table);
    }
    const t = table;
    const keys = t.document.fields as string[];
    for (const f of db.fields) {
      const key = String(f.data.key ?? "");
      if (!key || t.fields.some((x) => x.data.key === key)) continue;
      t.fields.push({ id: f.id, table_id: t.id, data: { ...f.data, entity_definition_id: t.id } } satisfies MemoryField);
      keys.push(key);
    }
    for (const [key, opts] of Object.entries(db.options)) {
      if (t.options.has(key)) continue;
      const list: MemoryOption[] = Object.entries(opts)
        .filter(([, o]) => o && o.retired !== true)
        .sort(([, a], [, b]) => (a.position ?? 0) - (b.position ?? 0))
        .map(([optKey, o]) => ({ id: o.id ?? stableId(`${t.id}:${key}:${optKey}`), key: optKey, label: o.label ?? optKey, color: o.color ?? null }));
      t.options.set(key, list);
    }
    for (const r of db.rows) {
      if (!t.rows.has(r.id)) t.order.push(r.id);
      t.rows.set(r.id, { ...(t.rows.get(r.id) ?? {}), ...r.data });
      world.recordTable.set(r.id, t);
    }
  }
  const configs = new Map<string, RecordsConfig>();
  for (const world of worlds.values()) {
    const config: RecordsConfig = {
      dataSource: memoryDataSource(world),
      actor: { actor: "user", user_id: world.user_id },
      organizationId: world.organization_id,
      // Nothing outside this tab changes a published row: the lists are as live as they can be.
      realtime: { subscribeRecords: () => () => undefined },
    };
    for (const table of world.tables) configs.set(table.id, config);
  }
  return configs;
}

/** table id → the read-only store that carries its published rows; null = not on a public page. */
const PublishedRowsContext = createContext<Map<string, RecordsConfig> | null>(null);

export function PublishedRowsProvider({ databases, children }: { databases: Record<string, PublishedDatabase>; children: ReactNode }) {
  // React Compiler memoises this on `databases` (the door's answer, read once per page).
  const configs = publishedWorlds(databases);
  return <PublishedRowsContext.Provider value={configs}>{children}</PublishedRowsContext.Provider>;
}

/** Inside a public page: the published stores by table id. Outside one: null (the live store reads). */
export function usePublishedRows(): Map<string, RecordsConfig> | null {
  return useContext(PublishedRowsContext);
}
