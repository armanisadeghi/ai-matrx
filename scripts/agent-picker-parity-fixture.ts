/**
 * scripts/agent-picker-parity-fixture.ts
 *
 * THE PARITY PROOF for `@ai-matrx/agents/catalog`.
 *
 * The picker's filter/sort/search/count behaviour is moving into the package
 * (AGENT-PICKER-DESIGN.md, wave 1). "Ported verbatim" is a claim, so this
 * script turns it into evidence:
 *
 *   1. It builds a deterministic fixture of 66 realistic `agx_get_list_full`
 *      rows (owned / directly-shared / org-shared / builtin, favorites,
 *      archived, categories, tags, null fields, unicode and duplicate names).
 *   2. It runs THE ORIGINAL selectors in this repo — `makeSelectFilteredAgents`
 *      against a real RootState shape, plus the count selectors and the four
 *      category/tag option selectors — across a full matrix of consumer states
 *      (every tab × every sort × favoritesFirst × favorite filter × archive
 *      filter × access filter × category/tag inclusion including the
 *      none-sentinel × search queries × server-matched ids).
 *   3. It writes the fixture and the EXPECTED ORDERED ID LISTS to JSON inside
 *      the package's tests, where `catalog/__tests__/parity.test.ts` asserts
 *      the ported selectors reproduce them exactly.
 *
 * Run:  pnpm tsx scripts/agent-picker-parity-fixture.ts
 *
 * This script is the ONLY thing this campaign adds to matrx-frontend in wave 1.
 * Adoption (deleting the originals) is wave 2 and lands separately.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  filterBuiltinTypeAgents,
  filterUserTypeAgents,
  makeSelectFilteredAgents,
  selectAllAgentCategories,
  selectAllAgentTags,
  selectAllSystemAgentCategories,
  selectAllSystemAgentTags,
  selectTotalBuiltinAgentsCount,
  selectTotalFavoriteAgentsCount,
  selectTotalOwnedAgentsCount,
  selectTotalSharedAgentsCount,
  selectTotalUserAgentsCount,
} from "@/features/agents/redux/agent-consumers/selectors";
import {
  DEFAULT_AGENT_CONSUMER_STATE,
  AGENT_NONE_SENTINEL,
  type AgentConsumerState,
  type AgentSortOption,
  type AgentTab,
} from "@/features/agents/redux/agent-consumers/slice";
import type { RootState } from "@/lib/redux/store";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";

const OUT_DIR = join(
  process.cwd(),
  "..",
  "aidream",
  "apps",
  "shared",
  "matrx-agents",
  "catalog",
  "__tests__",
);

// ── A deterministic fixture ────────────────────────────────────────────────
// Seeded PRNG so the same fixture and the same expectations come out every
// run — a fixture that changes between runs cannot prove anything.

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RawRow {
  id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  agent_type: "user" | "builtin";
  model_id: string | null;
  is_active: boolean;
  is_archived: boolean;
  is_favorite: boolean;
  created_by: string | null;
  organization_id: string | null;
  task_id: string | null;
  source_agent_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_owner: boolean | null;
  access_level: string | null;
  shared_by_email: string | null;
}

const CATEGORIES = [
  "Writing",
  "Research",
  "Images",
  "Code",
  "Support",
  null,
  "writing", // deliberate case twin — category sort is a plain localeCompare
];
const TAG_POOL = [
  "fast",
  "beta",
  "image",
  "internal",
  "seo",
  "légal", // unicode, so localeCompare is exercised
  "zzz",
];
const NAME_WORDS = [
  "Image Generator",
  "Reimagine Helper",
  "Basic Image Generator",
  "Research Analyst",
  "Contract Reviewer",
  "SEO Writer",
  "Support Triage",
  "Code Reviewer",
  "Émile Assistant",
  "Data Extractor",
];

function uuid(i: number): string {
  const hex = i.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

function buildFixture(): RawRow[] {
  const rnd = mulberry32(20260908);
  const rows: RawRow[] = [];

  const push = (row: RawRow) => rows.push(row);

  for (let i = 0; i < 60; i += 1) {
    const kind = i % 5; // 0,1 owned · 2 direct-shared · 3 org-shared · 4 builtin
    const isBuiltin = kind === 4;
    const isOwner = isBuiltin ? null : kind <= 1;
    const accessLevel = isBuiltin
      ? "system"
      : kind <= 1
        ? "owner"
        : kind === 2
          ? (["editor", "viewer", "admin"][i % 3] ?? "viewer")
          : "viewer";
    const name =
      i % 17 === 0
        ? null
        : `${NAME_WORDS[i % NAME_WORDS.length]} ${String(i).padStart(2, "0")}`;
    const tagCount = i % 4; // 0 → untagged, exercising the none-sentinel
    const tags =
      i % 11 === 0
        ? null
        : Array.from(
            { length: tagCount },
            (_, t) => TAG_POOL[(i + t) % TAG_POOL.length] ?? "fast",
          );
    // Timestamps intentionally collide for some rows so the comparator's tie
    // break (and therefore sort STABILITY) is exercised.
    const day = 1 + (i % 20);
    push({
      id: uuid(i),
      name,
      description:
        i % 7 === 0 ? null : `Handles ${NAME_WORDS[(i + 3) % NAME_WORDS.length]}`,
      category: CATEGORIES[i % CATEGORIES.length] ?? null,
      tags,
      agent_type: isBuiltin ? "builtin" : "user",
      model_id: i % 5 === 0 ? null : `gpt-model-${i % 6}`,
      is_active: true,
      is_archived: !isBuiltin && i % 9 === 0,
      is_favorite: i % 6 === 0,
      created_by: isOwner ? "user-me" : `user-${i % 4}`,
      organization_id: "org-1",
      task_id: null,
      source_agent_id: i % 13 === 0 ? uuid(i - 1) : null,
      created_at: `2026-0${1 + (i % 8)}-${String(day).padStart(2, "0")}T00:00:00Z`,
      updated_at: `2026-0${1 + ((i + 4) % 8)}-${String(day).padStart(2, "0")}T12:00:00Z`,
      is_owner: isOwner,
      access_level: accessLevel,
      shared_by_email:
        isOwner === false ? `sharer${i % 3}@example.com` : null,
    });
    // Keep the PRNG advancing so future rows can use it without changing these.
    rnd();
  }

  // Six deliberate edge rows.
  push({
    ...blank(uuid(900)),
    name: "Image Generator 00", // exact duplicate name of an earlier row
    agent_type: "user",
    is_owner: true,
    access_level: "owner",
    category: null,
    tags: [],
    created_at: null,
    updated_at: null,
  });
  push({
    ...blank(uuid(901)),
    name: null, // no name at all
    agent_type: "builtin",
    access_level: "system",
    is_favorite: true,
    tags: null,
  });
  push({
    ...blank(uuid(902)),
    name: "Shared With No Access Level", // isOwner false but access_level null
    agent_type: "user",
    is_owner: false,
    access_level: null,
  });
  push({
    ...blank(uuid(903)),
    name: "Archived Favorite",
    agent_type: "user",
    is_owner: true,
    access_level: "owner",
    is_archived: true,
    is_favorite: true,
    category: "Writing",
    tags: ["fast"],
  });
  push({
    ...blank(uuid(904)),
    name: "ZZZ Last Alphabetically",
    agent_type: "user",
    is_owner: true,
    access_level: "admin",
    category: "Support",
    tags: ["zzz", "légal"],
    updated_at: "2027-01-01T00:00:00Z",
  });
  push({
    ...blank(uuid(905)),
    name: "Prompt Only Match", // only reachable via a serverMatchedIds hit
    description: null,
    agent_type: "user",
    is_owner: true,
    access_level: "owner",
    category: null,
    tags: [],
  });

  return rows;
}

function blank(id: string): RawRow {
  return {
    id,
    name: null,
    description: null,
    category: null,
    tags: [],
    agent_type: "user",
    model_id: null,
    is_active: true,
    is_archived: false,
    is_favorite: false,
    created_by: "user-me",
    organization_id: "org-1",
    task_id: null,
    source_agent_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_owner: true,
    access_level: "owner",
    shared_by_email: null,
  };
}

/**
 * The EXACT mapping `fetchAgentsListFull` performs on each row before it
 * reaches the store — so the expectations below are produced by the same
 * pipeline the live app runs.
 */
function toRecord(row: RawRow): AgentDefinitionRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags ?? [],
    agentType: row.agent_type,
    modelId: row.model_id,
    isActive: row.is_active,
    isArchived: row.is_archived,
    isFavorite: row.is_favorite,
    createdBy: row.created_by,
    organizationId: row.organization_id,
    taskId: row.task_id ?? null,
    sourceAgentId: row.source_agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isVersion: false,
    isOwner: row.is_owner,
    accessLevel: row.access_level,
    sharedByEmail: row.shared_by_email,
  } as unknown as AgentDefinitionRecord;
}

// ── The matrix ─────────────────────────────────────────────────────────────

const TABS: AgentTab[] = ["mine", "shared", "all", "system"];
const SORTS: AgentSortOption[] = [
  "updated-desc",
  "created-desc",
  "name-asc",
  "name-desc",
  "category-asc",
];
const FAV_FILTERS = ["all", "yes", "no"] as const;
const ARCH_FILTERS = ["active", "archived", "both"] as const;
const ACCESS_FILTERS = ["any", "owned", "shared", "editable"] as const;
const SEARCHES = [
  "",
  "image",
  "Image Generator 00",
  "gen img",
  "image gen",
  "légal",
  uuid(4),
  "0000",
  "sharer1@example.com",
  "gpt-model-3",
];
const CATEGORY_SETS: string[][] = [
  [],
  ["Writing"],
  ["Writing", "Support"],
  [AGENT_NONE_SENTINEL],
  [AGENT_NONE_SENTINEL, "Images"],
];
const TAG_SETS: string[][] = [
  [],
  ["fast"],
  ["fast", "zzz"],
  [AGENT_NONE_SENTINEL],
  [AGENT_NONE_SENTINEL, "légal"],
];
const SERVER_MATCHED: string[][] = [[], [uuid(905), uuid(904)]];

interface Case {
  key: string;
  consumer: AgentConsumerState;
  includeSystemInAll: boolean;
  ids: string[];
}

function main(): void {
  const rows = buildFixture();
  const records = rows.map(toRecord);
  const agentsById: Record<string, AgentDefinitionRecord> = {};
  for (const r of records) agentsById[r.id] = r;

  const baseState = {
    agentDefinition: {
      agents: agentsById,
      activeAgentId: null,
      status: "succeeded",
      error: null,
    },
    agentConsumers: { consumers: {} as Record<string, AgentConsumerState> },
  };

  const cases: Case[] = [];

  const record = (
    key: string,
    patch: Partial<AgentConsumerState>,
    includeSystemInAll = false,
  ) => {
    const consumer: AgentConsumerState = {
      ...DEFAULT_AGENT_CONSUMER_STATE,
      ...patch,
    };
    // Build a FRESH state + a FRESH selector per case so no memoized result
    // from an earlier case can be mistaken for this one's answer.
    const state = {
      ...baseState,
      agentConsumers: { consumers: { fixture: consumer } },
    } as unknown as RootState;
    const select = makeSelectFilteredAgents("fixture", includeSystemInAll);
    const ids = select(state).map((a) => a.id);
    cases.push({ key, consumer, includeSystemInAll, ids });
  };

  // Every tab × every sort × favoritesFirst.
  for (const tab of TABS) {
    for (const sortBy of SORTS) {
      for (const favoritesFirst of [true, false]) {
        record(`tab=${tab}|sort=${sortBy}|favFirst=${favoritesFirst}`, {
          tab,
          sortBy,
          favoritesFirst,
        });
      }
    }
  }

  // Favorite / archive / access filters on every tab.
  for (const tab of TABS) {
    for (const favFilter of FAV_FILTERS) {
      record(`tab=${tab}|fav=${favFilter}`, { tab, favFilter });
    }
    for (const archFilter of ARCH_FILTERS) {
      record(`tab=${tab}|arch=${archFilter}`, { tab, archFilter });
    }
    for (const accessFilter of ACCESS_FILTERS) {
      record(`tab=${tab}|access=${accessFilter}`, { tab, accessFilter });
    }
  }

  // Category / tag inclusion, including the none-sentinel, on every tab.
  for (const tab of TABS) {
    for (const includedCats of CATEGORY_SETS) {
      record(`tab=${tab}|cats=${includedCats.join("+") || "none"}`, {
        tab,
        includedCats,
      });
    }
    for (const includedTags of TAG_SETS) {
      record(`tab=${tab}|tags=${includedTags.join("+") || "none"}`, {
        tab,
        includedTags,
      });
    }
  }

  // Search × server-matched ids × sort, on every tab.
  for (const tab of TABS) {
    for (const searchTerm of SEARCHES) {
      for (const serverMatchedIds of SERVER_MATCHED) {
        for (const sortBy of ["updated-desc", "name-asc"] as AgentSortOption[]) {
          record(
            `tab=${tab}|q=${searchTerm || "empty"}|srv=${serverMatchedIds.length}|sort=${sortBy}`,
            { tab, searchTerm, serverMatchedIds, sortBy },
          );
        }
      }
    }
  }

  // The ADMIN reading of "All" — system agents blended in.
  for (const sortBy of SORTS) {
    record(`admin-all|sort=${sortBy}`, { tab: "all", sortBy }, true);
    record(
      `admin-all|sort=${sortBy}|q=image`,
      { tab: "all", sortBy, searchTerm: "image" },
      true,
    );
  }

  // Combined pressure — several filters at once.
  record("combo|mine+fav+cat+tag+sort", {
    tab: "mine",
    favFilter: "yes",
    includedCats: ["Writing", AGENT_NONE_SENTINEL],
    includedTags: ["fast", AGENT_NONE_SENTINEL],
    sortBy: "name-asc",
    favoritesFirst: false,
  });
  record("combo|all+arch-both+access-editable+q", {
    tab: "all",
    archFilter: "both",
    accessFilter: "editable",
    searchTerm: "image",
    sortBy: "category-asc",
  });
  record("combo|system+cat+tag+q", {
    tab: "system",
    includedCats: ["Images", AGENT_NONE_SENTINEL],
    includedTags: [AGENT_NONE_SENTINEL],
    searchTerm: "generator",
  });

  // The two exported pure pipelines, called directly, over a couple of states.
  const directCases = [
    {
      key: "direct|user|mine|name-asc",
      fn: "filterUserTypeAgents" as const,
      consumer: {
        ...DEFAULT_AGENT_CONSUMER_STATE,
        tab: "mine" as AgentTab,
        sortBy: "name-asc" as AgentSortOption,
      },
    },
    {
      key: "direct|builtin|q=image",
      fn: "filterBuiltinTypeAgents" as const,
      consumer: { ...DEFAULT_AGENT_CONSUMER_STATE, searchTerm: "image" },
    },
  ].map(({ key, fn, consumer }) => {
    const pool =
      fn === "filterUserTypeAgents"
        ? records.filter((a) => a.agentType === "user")
        : records.filter((a) => a.agentType === "builtin");
    const out =
      fn === "filterUserTypeAgents"
        ? filterUserTypeAgents(pool, consumer)
        : filterBuiltinTypeAgents(pool, consumer);
    return { key, fn, consumer, ids: out.map((a) => a.id) };
  });

  const fullState = baseState as unknown as RootState;
  const counts = {
    totalUser: selectTotalUserAgentsCount(fullState),
    totalOwned: selectTotalOwnedAgentsCount(fullState),
    totalShared: selectTotalSharedAgentsCount(fullState),
    totalBuiltin: selectTotalBuiltinAgentsCount(fullState),
    totalFavorite: selectTotalFavoriteAgentsCount(fullState),
  };

  const options = {
    userCategories: selectAllAgentCategories(fullState),
    systemCategories: selectAllSystemAgentCategories(fullState),
    userTags: selectAllAgentTags(fullState),
    systemTags: selectAllSystemAgentTags(fullState),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const fixturePath = join(OUT_DIR, "parity-fixture.json");
  const expectedPath = join(OUT_DIR, "parity-expected.json");
  mkdirSync(dirname(fixturePath), { recursive: true });

  writeFileSync(fixturePath, `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(
    expectedPath,
    `${JSON.stringify(
      {
        generatedFrom:
          "matrx-frontend features/agents/redux/agent-consumers/selectors.ts",
        generatedBy: "matrx-frontend/scripts/agent-picker-parity-fixture.ts",
        rowCount: rows.length,
        counts,
        options,
        cases,
        directCases,
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(
    `Wrote ${rows.length} fixture rows and ${cases.length + directCases.length} expectations:\n` +
      `  ${fixturePath}\n  ${expectedPath}\n`,
  );
}

main();
