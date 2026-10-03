/**
 * @jest-environment node
 */
/**
 * LANE 9 SCOPES-ON-THE-STORE, CHAIR RULING 3 (2026-10-02): `fetch_hint` "lazy" → "on_demand" is correct.
 *
 * The record store keeps three words (include / on_request / exclude) and folded the old table's
 * "lazy" into on_request and "batch_related" into include on the copy. The web's old read path
 * (`scopesService.listContextItems`, knob `custom.scope_readers_read_the_store` OFF — the path every screen runs
 * today) handed the old word through, so the item hub printed "Lazy" where the store path says
 * "On demand", and the settings form offered two words no write could keep.
 *
 * THE BREAK THIS CATCHES: drop `withStoreFetchHints` from the old read (or map "lazy" anywhere but
 * "on_demand") and the first case goes red; the four cases expect three different words, so a
 * constant cannot pass them.
 *
 * SUT: the old read path's decode. The Supabase client is REAL (supabase-js); only the network is a
 * recorder. Reply rows are complete generated `context.context_items` rows (`satisfies`).
 */
import type { ContextItemRow } from "@/features/scopes/types";
import { FETCH_HINT_CONFIG } from "@/features/agent-context/constants";

const mockReplies: unknown[] = [];

jest.mock("@/utils/auth/getUserId", () => ({
  getUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
  requireUserId: () => "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081",
}));

jest.mock("@/utils/supabase/client", () => {
  const { createClient } = jest.requireActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  return {
    supabase: createClient("http://localhost:54321", "sb_publishable_test", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (): Promise<Response> =>
          new Response(JSON.stringify(mockReplies.shift() ?? []), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      },
    }),
  };
});

import { scopesService } from "@/features/scopes/service/scopesService";
import { __setScopesReadFromStoreForTests } from "@/features/scopes/service/scopesReadKnob";

const TYPE_ID = "0f5a6b7c-1d2e-4f30-8a41-b52c63d74e85";
const STAMP = "2026-09-01T10:00:00.000Z";

// Castellano & Reyes, LLP's "Matters" items — two of them were "lazy" on the old table (clone, 2026-10-02).
function item(id: string, key: string, label: string, hint: ContextItemRow["fetch_hint"]): ContextItemRow {
  return {
    allowed_reference_types: null, allowed_scope_type_ids: null, category: null, created_at: STAMP,
    created_by: "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081", custom_component: null, custom_fields: {},
    deleted_at: null, depends_on: [], description: "", display_name: label, feed_config: {}, feed_error: null,
    feed_status: null, feed_type: "manual", fetch_hint: hint, id, is_active: true, key, last_fed_at: null,
    last_verified_at: null, max_items: 1, metadata: {}, next_review_at: null, reference_source: null,
    refresh_task_id: null, review_interval_days: null, scope_type_id: TYPE_ID, sensitivity: "internal",
    slug: key.replace(/_/g, "-"), sort_order: 1, source_type: "manual", status: "active", status_note: null,
    status_updated_at: STAMP, status_updated_by: null, tags: [], template_item_key: null, updated_at: STAMP,
    updated_by: null, value_type: "string", version: 1,
  } satisfies ContextItemRow;
}

beforeEach(() => {
  mockReplies.length = 0;
  __setScopesReadFromStoreForTests(false);
});
afterAll(() => __setScopesReadFromStoreForTests(null));

it.each([
  ["lazy", "on_demand"],
  ["batch_related", "always"],
  ["on_demand", "on_demand"],
  ["never", "never"],
] as const)("the old read names %s the way the store keeps it (%s)", async (old, kept) => {
  mockReplies.push([item("9e8d7c6b-5a49-4382-b716-05f4e3d2c1b0", "opposing_counsel", "Opposing counsel", old)]);
  const res = await scopesService.listContextItems(TYPE_ID);
  expect(res.ok && res.data.items.map((i) => i.fetch_hint)).toEqual([kept]);
});

it("offers only the three words the store keeps", () => {
  expect(Object.keys(FETCH_HINT_CONFIG).sort()).toEqual(["always", "never", "on_demand"]);
});
