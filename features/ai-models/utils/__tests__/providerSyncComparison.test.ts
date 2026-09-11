/**
 * The Provider Sync table must render the DATABASE's classification.
 *
 * These tests exist because the screen used to compute its own: a hardcoded
 * exclusion list in `constants/excluded-provider-models.ts` plus a local
 * name-equality check. The sync agent reads `ai.provider_sync_candidates`, so
 * the two could — and did — disagree about what "excluded" meant.
 *
 * Each case below feeds a view row whose status a local heuristic would get
 * WRONG, and asserts the view wins.
 */

import {
  buildProviderSyncComparisons,
  countProviderSyncByStatus,
  type ProviderSyncRegistry,
} from "../providerSyncComparison";
import type {
  AiModel,
  AiModelAliasRow,
  AiOffering,
  ProviderSyncCandidate,
} from "../../types";

const PROVIDER_ID = "11111111-1111-1111-1111-111111111111";

const summary = {
  id: PROVIDER_ID,
  name: "OpenAI",
  provider_key: "openai",
  fetched_at: "2026-09-11T00:00:00Z",
};

function candidate(
  over: Partial<ProviderSyncCandidate> & { model_id: string; status: string },
): ProviderSyncCandidate {
  return {
    provider_name: "OpenAI",
    provider_id: PROVIDER_ID,
    display_name: over.model_id,
    released_at: "2026-08-01T00:00:00Z",
    fetched_at: "2026-09-11T00:00:00Z",
    in_db: false,
    excluded: false,
    before_cutoff: false,
    min_release_date: "2026-06-15",
    provider_entry: { id: over.model_id },
    ...over,
  } as ProviderSyncCandidate;
}

function model(over: Partial<AiModel> & { id: string; name: string }): AiModel {
  return {
    provider_id: PROVIDER_ID,
    common_name: over.name,
    capabilities: null,
    maker: "OpenAI",
    is_primary: false,
    is_deprecated: false,
    ...over,
  } as unknown as AiModel;
}

function offering(
  over: Partial<AiOffering> & { id: string; model_id: string },
): AiOffering {
  return {
    provider_model_id: null,
    priority: 0,
    pricing: [],
    usage_basis: null,
    capabilities_override: {},
    override: { params: {}, constraints: [] },
    metadata: {},
    ...over,
  } as unknown as AiOffering;
}

const emptyRegistry: ProviderSyncRegistry = {
  localModels: [],
  offerings: [],
  aliases: [],
};

describe("buildProviderSyncComparisons — the view owns the classification", () => {
  it("renders 'excluded' for a row the old local heuristic would have called 'Not in DB'", () => {
    // `gpt-4o-transcribe-diarize` is NOT in our registry and is NOT in any
    // code-side list any more. Only the DB policy knows it is excluded.
    const rows = buildProviderSyncComparisons(
      summary,
      [candidate({ model_id: "gpt-4o-transcribe-diarize", status: "excluded", excluded: true })],
      emptyRegistry,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("excluded");
  });

  it("renders 'before cutoff' as its own status, never as missing", () => {
    const rows = buildProviderSyncComparisons(
      summary,
      [
        candidate({
          model_id: "davinci-002",
          status: "before_cutoff",
          before_cutoff: true,
          released_at: "2023-08-21T00:00:00Z",
        }),
      ],
      emptyRegistry,
    );
    expect(rows[0].status).toBe("before_cutoff");
  });

  it("renders 'matched' for a model the view resolved through an offering, not by name", () => {
    // The registry row is named `gpt-5-pro`; the provider calls it
    // `gpt-5-pro-2026-07-01`. Name equality alone would have said "Not in DB".
    const local = model({ id: "m1", name: "gpt-5-pro" });
    const rows = buildProviderSyncComparisons(
      summary,
      [candidate({ model_id: "gpt-5-pro-2026-07-01", status: "matched", in_db: true })],
      {
        localModels: [local],
        offerings: [
          offering({
            id: "o1",
            model_id: "m1",
            provider_model_id: "gpt-5-pro-2026-07-01",
            pricing: [
              {
                max_tokens: null,
                input_price: 1.25,
                output_price: 10,
                cached_input_price: 0.125,
              },
            ],
          }),
        ],
        aliases: [],
      },
    );
    expect(rows[0].status).toBe("matched");
    expect(rows[0].localEntry?.id).toBe("m1");
    expect(rows[0].pricing.state).toBe("priced");
    expect(rows[0].pricing.ours?.input).toBe(1.25);
  });

  it("resolves a model through an alias, like the view's in_db does", () => {
    const local = model({ id: "m2", name: "o5" });
    const alias = { model_id: "m2", alias: "o5-2026-04-01" } as AiModelAliasRow;
    const rows = buildProviderSyncComparisons(
      summary,
      [candidate({ model_id: "o5-2026-04-01", status: "matched", in_db: true })],
      { localModels: [local], offerings: [], aliases: [alias] },
    );
    expect(rows[0].localEntry?.id).toBe("m2");
    // No offering exists for it — the row says so instead of showing nothing.
    expect(rows[0].pricing.state).toBe("no_offering");
  });

  it("falls back to 'Not in DB', never to 'matched', if the view grows a status we do not know", () => {
    const rows = buildProviderSyncComparisons(
      summary,
      [candidate({ model_id: "something-new", status: "a_status_from_the_future" })],
      emptyRegistry,
    );
    expect(rows[0].status).toBe("missing_local");
  });

  it("adds extra_local rows for registry models the snapshot did not contain", () => {
    const rows = buildProviderSyncComparisons(
      summary,
      [candidate({ model_id: "gpt-5", status: "matched", in_db: true })],
      {
        localModels: [
          model({ id: "m1", name: "gpt-5" }),
          model({ id: "m9", name: "gpt-3.5-turbo-retired" }),
        ],
        offerings: [],
        aliases: [],
      },
    );
    const counts = countProviderSyncByStatus(rows);
    expect(counts.matched).toBe(1);
    expect(counts.extra_local).toBe(1);
  });

  it("ignores candidates belonging to other providers", () => {
    const rows = buildProviderSyncComparisons(
      summary,
      [
        candidate({ model_id: "gpt-5", status: "matched", in_db: true }),
        candidate({
          model_id: "claude-opus-5",
          status: "matched",
          provider_id: "22222222-2222-2222-2222-222222222222",
          in_db: true,
        }),
      ],
      emptyRegistry,
    );
    expect(rows.map((r) => r.id)).toEqual(["gpt-5"]);
  });
});
