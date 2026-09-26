import type { Database } from "@/types/database.types";

const TOPIC_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";

type QueryResult<T = unknown> = {
  data: T[];
  error: null;
  count: number;
};

type QueryBuilder = {
  select: (columns: string, options?: { count?: "exact" }) => QueryBuilder;
  eq: (column: string, value: string) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  range: (from: number, to: number) => Promise<QueryResult>;
};

const sourceRows: Database["research"]["Tables"]["rs_source"]["Row"][] =
  Array.from({ length: 1_001 }, (_, index) => ({
    analysis_status: null,
    authority_ranked_at: null,
    authority_reasoning: null,
    authority_score: null,
    authority_tier: null,
    created_by: null,
    custom_fields: {},
    deleted_at: null,
    description: null,
    discovered_at: null,
    entity_match_confidence: null,
    extra_snippets: null,
    final_source_score: null,
    hostname: "example.com",
    id: `source-${index}`,
    is_included: true,
    is_stale: null,
    last_seen_at: null,
    last_server_attempt_at: null,
    last_server_failure_reason: null,
    metadata: {},
    organization_id: ORG_ID,
    origin: "search",
    page_age: null,
    page_analysis: null,
    policy_category: null,
    policy_reason: null,
    post_read_score: null,
    pre_read_breakdown: null,
    pre_read_score: null,
    processed_document_id: null,
    rank: index + 1,
    raw_search_result: null,
    read_priority_reason: null,
    recommended_use: null,
    redundancy_group: null,
    scrape_parsed_page_id: null,
    scrape_status: "pending",
    scrape_worthiness: null,
    server_attempts: 0,
    server_gave_up: false,
    snippet_relevance: null,
    source_type: "web",
    thumbnail_url: null,
    title: `Source ${index}`,
    topic_id: TOPIC_ID,
    triage_verdict: null,
    updated_at: "2026-09-25T00:00:00.000Z",
    updated_by: null,
    url: `https://example.com/${index}`,
    user_verdict: null,
    user_verdict_at: null,
    user_verdict_notes: null,
    version: 1,
  }));

const ranges: Record<string, Array<{ from: number; to: number }>> = {};

function rowsFor(table: string): unknown[] {
  return table === "rs_source" ? sourceRows : [];
}

function makeBuilder(table: string): QueryBuilder {
  const builder: QueryBuilder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    range: async (from, to) => {
      ranges[table] ??= [];
      ranges[table].push({ from, to });
      const rows = rowsFor(table);
      return { data: rows.slice(from, to + 1), error: null, count: rows.length };
    },
  };
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: (table: string) => makeBuilder(table) }),
  },
}));

jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: async <T>(
    query: (range: { from: number; to: number }) => Promise<QueryResult<T>>,
  ): Promise<T[]> => {
    const all: T[] = [];
    for (let from = 0; ; from += 1_000) {
      const result = await query({ from, to: from + 999 });
      all.push(...result.data);
      if (all.length >= result.count) return all;
    }
  },
}));

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {},
}));

import { getCurationData } from "../service";

beforeEach(() => {
  for (const table of Object.keys(ranges)) delete ranges[table];
});

it("reads all 1,001 sources for curation instead of accepting a capped page", async () => {
  const data = await getCurationData(TOPIC_ID);

  expect(data.rows).toHaveLength(1_001);
  expect(data.rows.at(-1)?.source.id).toBe("source-1000");
  expect(ranges.rs_source).toEqual([
    { from: 0, to: 999 },
    { from: 1000, to: 1999 },
  ]);
});
