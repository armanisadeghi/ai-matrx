// features/spaces/state/template-tables.ts — I3: "Use template" into another organization brings the
// template's tables along. A copy filed in organization B whose database blocks still named organization
// A's tables showed rows B's members may not open (and wrote into A). Every table such a block names that
// lives outside the copy's organization is duplicated into it (records `tableDuplicate`, with its
// records, views and choice lists) and the blocks are pointed at the copy — the sample's install /
// repoint path, for any template.

import { createRecordsClient, supabaseDataSource } from "@ai-matrx/records/core";

import { resolveObjectOrganization } from "@/features/unified-data/objectOrganization";
import { createClient } from "@/utils/supabase/client";

import type { SpaceBlock, SpaceDoc, SpaceId, SpacesStore } from "../contract";
import { pageOrganizationId } from "../data/agency-install";
import { saveOnCurrent } from "../store/sample";

type TableSource = { kind: "table"; tableId: string; viewId?: string };

function tableSourceOf(b: SpaceBlock): TableSource | null {
  if (b.type !== "database") return null;
  const src = (b.props as { source?: unknown } | undefined)?.source as Partial<TableSource> | undefined;
  return src?.kind === "table" && typeof src.tableId === "string" && src.tableId ? (src as TableSource) : null;
}

/** Every table id a page's database blocks name (at any depth). */
export function tableIdsIn(blocks: SpaceBlock[]): string[] {
  const out = new Set<string>();
  const walk = (bs: SpaceBlock[]) => {
    for (const b of bs) {
      const src = tableSourceOf(b);
      if (src) out.add(src.tableId);
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return [...out];
}

/** The blocks with every named table swapped for its copy (a saved view id of the old table goes too). */
export function repointTables(blocks: SpaceBlock[], copies: ReadonlyMap<string, string>): { blocks: SpaceBlock[]; changed: boolean } {
  let changed = false;
  const walk = (bs: SpaceBlock[]): SpaceBlock[] =>
    bs.map((b) => {
      const src = tableSourceOf(b);
      const to = src ? copies.get(src.tableId) : undefined;
      let next = b;
      if (src && to) {
        changed = true;
        next = { ...b, props: { ...(b.props ?? {}), source: { kind: "table", tableId: to } } };
      }
      return next.children?.length ? { ...next, children: walk(next.children) } : next;
    });
  return { blocks: walk(blocks), changed };
}

/**
 * After `space_duplicate` filed `copyId` (and its sub-pages) in another organization: duplicate the
 * outside tables its blocks name into the copy's organization and point the blocks at them.
 * Answers how many tables were brought along.
 */
export async function bringTemplateTables(store: SpacesStore, copyId: SpaceId, onProgress?: (line: string) => void): Promise<number> {
  const copyOrg = await pageOrganizationId(copyId);
  if (!copyOrg) return 0;
  const tree = await store.list();
  const pages: SpaceId[] = [copyId];
  for (let i = 0; i < pages.length; i++) for (const s of tree) if (s.parentId === pages[i]) pages.push(s.id);
  const docs = (await Promise.all(pages.map((id) => store.get(id)))).filter((d): d is SpaceDoc => Boolean(d));
  const named = [...new Set(docs.flatMap((d) => tableIdsIn(d.blocks)))];
  if (!named.length) return 0;
  const dataSource = supabaseDataSource(createClient());
  const client = createRecordsClient({ dataSource, actor: { actor: "user" }, organizationId: copyOrg });
  const copies = new Map<string, string>();
  for (const tableId of named) {
    const where = await resolveObjectOrganization(dataSource, tableId);
    if (where.state !== "found" || where.organizationId === copyOrg) continue;
    onProgress?.(`Copying tables… ${copies.size + 1}/${named.length}`);
    const made = await client.tableDuplicate({ tableId, organizationId: copyOrg, withRecords: true, name: null });
    if (!made.ok) throw new Error(`A table of this template could not be copied: ${made.error.message}`);
    copies.set(tableId, made.data.table.id);
  }
  if (!copies.size) return 0;
  for (const d of docs) {
    if (!tableIdsIn(d.blocks).some((id) => copies.has(id))) continue;
    await saveOnCurrent(store, d.id, (cur) => ({ ...cur, blocks: repointTables(cur.blocks, copies).blocks }));
  }
  return copies.size;
}
