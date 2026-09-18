/**
 * 🚨 EVERY COLUMN NAME THE HEALTH STRIP TRIES IS A COLUMN THAT EXISTS — AND
 * EVERY COLUMN A SYNCED TABLE CARRIES FOR A ROLE THE STRIP READS IS NAMED.
 *
 * THE DEFECT THIS CLOSES (lane F-54, the class behind F-51). `sourceHealth.ts`
 * locates a synced row's provider, product, external identity, connection,
 * freshness and provider address by trying candidate column names in order.
 * F-51 found `ACCOUNT_COLUMNS` carrying three spellings NO table has; the F-54
 * census found the same fiction in every sibling list — of seventeen names,
 * EIGHT matched no column on any table carrying `sync_status`:
 *
 *   sync_provider         no table anywhere
 *   source_provider       only `seo.keyword_market` (not synced)
 *   capability_key        no table anywhere
 *   product_key           no table anywhere
 *   external_message_id   no table anywhere
 *   provider_id           7 tables, none synced
 *   last_refreshed_at     no table anywhere (and it sat FIRST in its list)
 *   web_url               no table anywhere
 *   source_url            13 tables, none synced
 *
 * The strip only worked because each synced table happened to carry one of the
 * survivors. A fiction costs nothing until the day it is the only name a new
 * table would have matched — then the strip goes quiet, or answers about the
 * wrong account, exactly as F-51 found.
 *
 * WHAT GUARDS WHAT. The compiler owns direction one: every list is `satisfies
 * readonly SyncedRoleColumn[]`, a union COMPUTED from `types/database.types.ts`,
 * so a fiction is a type error naming the spelling. This file owns what a type
 * cannot see — that the derivation is still narrow, and the REVERSE direction:
 * a synced table carrying a role-shaped column no list names.
 *
 * IT READS THE GENERATED FILE ITSELF, not a fixture, so it fails on the real
 * `pnpm db-types` output.
 *
 * 🚨 THE REVERSE HALF RECOGNISES THE ACCOUNT ROLE BY STRUCTURE, NOT SPELLING
 * (lane F-81, hostile verifier V-21). It used to ask its question through a
 * per-role regex listing remembered names, so it could only find a column
 * somebody had already thought of. `web.youtube_video` is a mirror
 * (`external_id`, `external_url`, `synced_at`) and names its connection side
 * `channel_resource_id`: no spelling matched, `UNREAD_ROLE_COLUMNS` came back
 * empty, and this guard was GREEN while the strip could not read that table's
 * account at all — F-51 re-armed on the third mirror table, invisible to the
 * guard written to prevent it. The ACCOUNT shape is now the noun set of the
 * connection-side relations (`users.integration_connections` and its child
 * `users.integration_connection_resources`) with any prefix and the `_id`
 * suffix, which also surfaced a second blind-spot column,
 * `workbench.google_document.resource_id`.
 *
 * 🚨 RESIDUAL BLIND SPOT, STATED PLAINLY. The rule would rather read the foreign
 * key and CANNOT: every FK on all three mirror tables points out of the
 * generated schema set (`users.*`, `iam.*`, `auth.*`) and Supabase typegen drops
 * a cross-schema relationship, so all three carry `Relationships: []` here while
 * the constraints are live (`youtube_video_channel_resource_id_fkey →
 * users.integration_connection_resources`, `calendar_event_synced_via_connection_id_fkey
 * → users.integration_connections`, read live 2026-09-18). What IS readable from
 * the generated types is the one hop inside `users` —
 * `integration_connection_resources.connection_id → integration_connections` —
 * and this file asserts it, so the seed the noun set stands on cannot vanish
 * quietly. A mirror that names its connection side with none of those nouns
 * (`refreshed_through`, `google_account_ref`) is STILL invisible to this census;
 * the day typegen emits cross-schema FKs, replace the noun set with the FK and
 * this paragraph goes away.
 */

import fs from "node:fs";
import path from "node:path";

import {
  ACCOUNT_COLUMNS,
  ACCOUNT_RELATION_CHILD,
  ACCOUNT_RELATION_SEED,
  PROJECTED_ROLE_COLUMNS,
  REFRESHED_COLUMNS,
  ROLE_COLUMN_SHAPE,
  SYNCED_ROLE_CANDIDATES,
  UNREAD_ROLE_COLUMNS,
  type SyncedRoleColumn,
} from "../syncedColumns";

/**
 * The narrowness proof. `PROJECTED_ROLE_COLUMNS` typed as
 * `Readonly<Record<string, string>>` makes `SyncedRoleColumn` collapse to
 * `string` and every `satisfies` in the module a silent no-op — which this lane
 * hit for real: a planted `web_url` passed. If that ever returns, `pnpm
 * type-check` fails on the next line.
 */
type StringIsNotTheWholeUnion = string extends SyncedRoleColumn ? never : true;
const UNION_STAYS_NARROW: StringIsNotTheWholeUnion = true;

const GENERATED = path.join(__dirname, "..", "..", "..", "types", "database.types.ts");

/** `schema.table` → its `Row` column names, parsed from the generated types. */
function readGeneratedTables(): Map<string, Set<string>> {
  const lines = fs.readFileSync(GENERATED, "utf8").split("\n");
  const tables = new Map<string, Set<string>>();
  let schema: string | null = null;
  let table: string | null = null;
  let inRow = false;
  for (const line of lines) {
    const schemaMatch = /^  ([a-z_0-9]+): \{$/.exec(line);
    if (schemaMatch) {
      schema = schemaMatch[1];
      table = null;
      inRow = false;
      continue;
    }
    const tableMatch = /^      ([a-zA-Z_0-9]+): \{$/.exec(line);
    if (tableMatch) {
      table = tableMatch[1];
      inRow = false;
      continue;
    }
    if (line === "        Row: {") {
      inRow = true;
      continue;
    }
    if (inRow && line === "        }") {
      inRow = false;
      continue;
    }
    if (!inRow || !schema || !table) continue;
    const columnMatch = /^          ([a-zA-Z_0-9]+)\??: /.exec(line);
    if (!columnMatch) continue;
    const key = `${schema}.${table}`;
    const columns = tables.get(key) ?? new Set<string>();
    columns.add(columnMatch[1]);
    tables.set(key, columns);
  }
  return tables;
}

const ALL_TABLES = readGeneratedTables();
/** A synced table IS a table whose `Row` declares `sync_status`. Nothing else. */
const SYNCED = [...ALL_TABLES].filter(([, columns]) => columns.has("sync_status"));
const SYNCED_COLUMNS = new Set(SYNCED.flatMap(([, columns]) => [...columns]));

/**
 * A synced table the strip can ever answer for MIRRORS A PROVIDER RECORD: it
 * carries an external identity. Derived, never listed — `code.code_repositories`
 * (a git checkout) and `commerce.cloud_sync_connection` (the connection itself)
 * carry `sync_status` and no external id, so no row of theirs can reach the
 * strip and their `last_synced_at` / `connection_id` are none of its business.
 */
const EXTERNAL_ID_SHAPE = ROLE_COLUMN_SHAPE.EXTERNAL_ID_COLUMNS;
const MIRRORS = SYNCED.filter(([, columns]) =>
  [...columns].some((column) => EXTERNAL_ID_SHAPE.test(column)),
);

describe("the parse this guard depends on", () => {
  it("reads the generated types and finds the synced tables", () => {
    expect(ALL_TABLES.size).toBeGreaterThan(900);
    expect(SYNCED.length).toBeGreaterThan(0);
    expect(UNION_STAYS_NARROW).toBe(true);
  });
});

describe("every candidate column name is a column that exists", () => {
  for (const [role, names] of Object.entries(SYNCED_ROLE_CANDIDATES)) {
    for (const name of names as readonly string[]) {
      it(`${role} → \`${name}\` is live on a synced table, or a declared projection`, () => {
        const live = SYNCED_COLUMNS.has(name);
        const projected = name in PROJECTED_ROLE_COLUMNS;
        if (!live && !projected) {
          throw new Error(
            `${role} carries \`${name}\`, which is not a column on any table ` +
              "declaring `sync_status` and is not a declared projection. The " +
              "strip will never match it. Remedy: delete it, or — if a " +
              "registration puts it on the row — declare it in " +
              "PROJECTED_ROLE_COLUMNS (features/item-presentation/syncedColumns.ts) " +
              "with the reason.",
          );
        }
        expect(`${name}: ${live || projected}`).toBe(`${name}: true`);
      });
    }
  }

  it("each role's candidates match that role's own naming convention", () => {
    for (const [role, names] of Object.entries(SYNCED_ROLE_CANDIDATES)) {
      const shape = ROLE_COLUMN_SHAPE[role];
      expect(shape).toBeDefined();
      for (const name of names as readonly string[]) {
        expect(`${role}:${name}:${shape.test(name)}`).toBe(`${role}:${name}:true`);
      }
    }
  });
});

describe("no synced table carries a role column the strip cannot see", () => {
  for (const [table, columns] of MIRRORS) {
    for (const [role, shape] of Object.entries(ROLE_COLUMN_SHAPE)) {
      const listed = new Set(SYNCED_ROLE_CANDIDATES[role as keyof typeof SYNCED_ROLE_CANDIDATES] as readonly string[]);
      const unseen = [...columns]
        .filter((column) => shape.test(column) && !listed.has(column))
        .filter((column) => !(`${table}.${column}` in UNREAD_ROLE_COLUMNS))
        .sort();
      it(`${table} — ${role}${unseen.length ? ` (unseen: ${unseen.join(", ")})` : ""}`, () => {
        if (unseen.length) {
          throw new Error(
            `${table} carries ${unseen.map((c) => `\`${c}\``).join(", ")} — ` +
              `columns that play the ${role} role and that no candidate list ` +
              "names, so the strip cannot read them. Remedy: add the column to that list in " +
              "features/item-presentation/syncedColumns.ts — or, when reading it " +
              "would change what a person sees, record the reason in " +
              "UNREAD_ROLE_COLUMNS and escalate the shape.",
          );
        }
        expect(unseen).toEqual([]);
      });
    }
  }

  it("every declared exemption is still a real column on a real synced table", () => {
    for (const key of Object.keys(UNREAD_ROLE_COLUMNS)) {
      const column = key.slice(key.lastIndexOf(".") + 1);
      const table = key.slice(0, key.lastIndexOf("."));
      expect(`${key} exists: ${Boolean(ALL_TABLES.get(table)?.has(column))}`).toBe(
        `${key} exists: true`,
      );
      expect(UNREAD_ROLE_COLUMNS[key].length).toBeGreaterThan(40);
    }
  });

  it("every declared projection is still absent from every synced table", () => {
    for (const name of Object.keys(PROJECTED_ROLE_COLUMNS)) {
      // A projection that becomes a real column is no longer a projection: the
      // entry must go, or it hides a column the strip should be reading live.
      expect(`${name} live: ${SYNCED_COLUMNS.has(name)}`).toBe(`${name} live: false`);
    }
  });
});

/**
 * RULING R28 (chair, 2026-09-18), lane F-56 — a synced record's freshness line
 * reads the provider's own modified time wherever the mirror table carries
 * one, in the same position for every table. F-54 found
 * `communication.calendar_event.external_updated_at` (Google's own updated
 * time) and parked it in `UNREAD_ROLE_COLUMNS` as an open escalation rather
 * than choosing to read it. This pins the ruling's answer: the name is read,
 * not parked. Before the move (HEAD as F-54 left it) the first expectation
 * fails, naming the missing spelling.
 */
describe("ruling R28 — external_updated_at is read, not parked", () => {
  it("REFRESHED_COLUMNS carries `external_updated_at`, after `synced_at` and `external_modified_at`", () => {
    expect([...REFRESHED_COLUMNS]).toEqual([
      "synced_at",
      "external_modified_at",
      "external_updated_at",
    ]);
  });

  it("UNREAD_ROLE_COLUMNS no longer parks the calendar_event escalation", () => {
    expect("communication.calendar_event.external_updated_at" in UNREAD_ROLE_COLUMNS).toBe(
      false,
    );
  });
});

/**
 * LANE F-81 — the ACCOUNT role's structural rule, and the one FK the generated
 * types really do declare. `readSeedFkChildren` looks for relations whose
 * declared FK references `ACCOUNT_RELATION_SEED`; the noun set in
 * `syncedColumns.ts` stands on exactly that hop, so if the constraint (or the
 * generated `Relationships` block carrying it) goes away, this fails instead of
 * the rule quietly becoming a hand list.
 */
function readSeedFkChildren(seed: string): Set<string> {
  const source = fs.readFileSync(GENERATED, "utf8");
  const children = new Set<string>();
  const shape =
    /foreignKeyName: "([a-zA-Z_0-9]+)"\s*\n\s*columns: \[([^\]]*)\]\s*\n\s*isOneToOne: (?:true|false)\s*\n\s*referencedRelation: "([a-zA-Z_0-9]+)"/g;
  for (const match of source.matchAll(shape)) {
    if (match[3] !== seed) continue;
    // The constraint name is `<child>_<column>_fkey`; the child is what the
    // column's own table is called, which is the only thing this needs.
    const column = match[2].replace(/["\s]/g, "");
    const suffix = `_${column}_fkey`;
    if (!match[1].endsWith(suffix)) continue;
    children.add(match[1].slice(0, -suffix.length));
  }
  return children;
}

describe("the ACCOUNT role is recognised by structure, not by spelling (F-81)", () => {
  const SHAPE = ROLE_COLUMN_SHAPE.ACCOUNT_COLUMNS;

  it("the seed relation and its one declared child both exist in the generated types", () => {
    const seedTables = [...ALL_TABLES.keys()].filter(
      (key) => key.slice(key.lastIndexOf(".") + 1) === ACCOUNT_RELATION_SEED,
    );
    expect(seedTables.length).toBeGreaterThan(0);
    const childTables = [...ALL_TABLES.keys()].filter(
      (key) => key.slice(key.lastIndexOf(".") + 1) === ACCOUNT_RELATION_CHILD,
    );
    expect(childTables.length).toBeGreaterThan(0);
    // The hop the noun set stands on: a resource BELONGS to a connection.
    expect([...readSeedFkChildren(ACCOUNT_RELATION_SEED)]).toContain(
      ACCOUNT_RELATION_CHILD,
    );
  });

  it("classifies every live mirror's connection-side column, whatever its prefix", () => {
    const seen: Record<string, string[]> = {};
    for (const [table, columns] of MIRRORS) {
      seen[table] = [...columns].filter((column) => SHAPE.test(column)).sort();
    }
    expect(seen).toEqual({
      "communication.calendar_event": ["synced_via_connection_id"],
      "web.youtube_video": ["channel_resource_id"],
      "workbench.google_document": ["resource_id", "synced_via_connection_id"],
    });
  });

  it("is a strict superset of the spelling list it replaced", () => {
    for (const name of [
      "synced_via_connection_id",
      "connection_id",
      "account_id",
      "refreshed_via_account",
    ]) {
      expect(`${name}:${SHAPE.test(name)}`).toBe(`${name}:true`);
    }
  });

  it("does not sweep in a column that is not connection-side", () => {
    for (const name of [
      "external_id",
      "organization_id",
      "created_by",
      "analysis_agent_id",
      "video_external_id",
      "sync_status",
      "published_at",
    ]) {
      expect(`${name}:${SHAPE.test(name)}`).toBe(`${name}:false`);
    }
  });

  it("the strip reads the connection outright FIRST, then a resource that belongs to one", () => {
    expect([...ACCOUNT_COLUMNS]).toEqual([
      "synced_via_connection_id",
      "resource_id",
      "channel_resource_id",
    ]);
  });
});

/**
 * THE CENSUS, ASSERTED. Not decoration: when the database grows a synced table
 * this fails and names it, which is the only moment anyone will ask whether the
 * strip should answer for it. `web.youtube_video` is the live near-miss — it
 * mirrors a Google record (`external_id`, `synced_at`, `external_url`) and
 * carries NO provider column and no registration that projects one, so
 * `syncedProviderOf` returns null for every row of it and a YouTube video would
 * show no strip at all. No item type reads it today (F-54: the registry's only
 * synced sources are `workbench.google_document` and
 * `communication.calendar_event`), so nothing on a screen is wrong yet.
 */
describe("the synced-table census the strip was measured against", () => {
  it("is exactly the tables carrying `sync_status` that F-54 censused", () => {
    expect(SYNCED.map(([table]) => table).sort()).toEqual([
      "code.code_repositories",
      "commerce.cloud_sync_connection",
      "communication.calendar_event",
      "web.youtube_video",
      "workbench.google_document",
    ]);
  });

  it("names the provider-record mirrors, the only rows that can reach the strip", () => {
    expect(MIRRORS.map(([table]) => table).sort()).toEqual([
      "communication.calendar_event",
      "web.youtube_video",
      "workbench.google_document",
    ]);
  });

  it("`web.youtube_video` names its connection side, and the strip now reads that column", () => {
    const columns = ALL_TABLES.get("web.youtube_video");
    expect([...(columns ?? [])]).toContain("channel_resource_id");
    // It carries NO connection column: `channel_resource_id` is the only thing
    // the strip can read for a YouTube row, which is why leaving it unseen was
    // F-51 waiting for U-M3 to ship.
    expect([...(columns ?? [])]).not.toContain("synced_via_connection_id");
    expect([...ACCOUNT_COLUMNS]).toContain("channel_resource_id");
  });

  it("`web.youtube_video` still has no provider column, so the strip stays silent for it", () => {
    const columns = ALL_TABLES.get("web.youtube_video");
    const providerShape = ROLE_COLUMN_SHAPE.PROVIDER_COLUMNS;
    expect([...(columns ?? [])].filter((column) => providerShape.test(column))).toEqual([]);
  });
});
