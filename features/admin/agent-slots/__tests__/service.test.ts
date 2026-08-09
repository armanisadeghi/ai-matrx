import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import {
  isSlotTestResult,
  parseSlotTestHistory,
  runSlotTests,
  type SlotTestBatchResponse,
  type SlotTestResponse,
} from "../service";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
}));

const callApiMock = jest.mocked(callApi);

function result(
  id: string,
  createdAt: string,
  error: string | null = null,
): SlotTestResponse {
  return {
    id,
    created_at: createdAt,
    slot_key: "seo.classify",
    exemplar_id: "exemplar-1",
    candidate_id: "candidate-1",
    candidate_label: "Latest",
    candidate: { label: "Latest", selection: "latest" },
    principal: {},
    agent_id: "agent-1",
    definition_agent_id: "agent-1",
    is_version: false,
    provenance: "latest",
    output: error ? "" : "ok",
    artifact: null,
    structural: { checked: true, ok: error ? false : true, errors: [] },
    usage: {},
    duration_ms: 25,
    error,
  };
}

describe("agent slot owner bench service", () => {
  beforeEach(() => {
    callApiMock.mockClear();
  });

  it("reads persisted history newest-first and drops malformed entries loudly", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const parsed = parseSlotTestHistory({
      keep_me: true,
      test_bench_results: [
        result("older", "2026-08-09T10:00:00Z"),
        { id: "malformed" },
        result("newer", "2026-08-09T11:00:00Z", "provider failed"),
      ],
    });

    expect(parsed.map((entry) => entry.id)).toEqual(["newer", "older"]);
    expect(parsed[0]?.error).toBe("provider failed");
    expect(consoleError).toHaveBeenCalledWith(
      "[agent-slots] ignored 1 malformed persisted bench result(s)",
    );
    consoleError.mockRestore();
  });

  it("treats a failed agent run as a valid persisted result", () => {
    expect(
      isSlotTestResult(
        result("failed", "2026-08-09T11:00:00Z", "model unavailable"),
      ),
    ).toBe(true);
  });

  it("uses callApi for one all-exemplar batch and preserves explicit empty overrides", async () => {
    const response: SlotTestBatchResponse = {
      slot_key: "seo.classify",
      exemplar_count: 1,
      columns: [
        { candidate_id: "baseline", label: "Baseline", selection: "current" },
        {
          candidate_id: "without-overrides",
          label: "Without overrides",
          selection: "current",
        },
      ],
      exemplars: [
        {
          exemplar_id: "exemplar-1",
          exemplar_label: "Captured input",
          results: [result("result-1", "2026-08-09T11:00:00Z")],
        },
      ],
    };
    const dispatch = jest.fn().mockResolvedValue({ data: response });

    await expect(
      runSlotTests(dispatch as unknown as AppDispatch, "seo.classify", {
        baseline: { label: "Baseline", selection: "current" },
        candidates: [
          {
            candidate_id: "without-overrides",
            label: "Without overrides",
            selection: "current",
            config_overrides: {},
          },
        ],
        principal: {
          user_id: "user-1",
          organization_id: "org-1",
        },
      }),
    ).resolves.toEqual(response);

    expect(callApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/agent-slots/{slot_key}/tests",
        method: "POST",
        pathParams: { slot_key: "seo.classify" },
        body: expect.objectContaining({
          candidates: [
            expect.objectContaining({
              config_overrides: {},
            }),
          ],
          principal: {
            user_id: "user-1",
            organization_id: "org-1",
          },
        }),
      }),
    );
  });
});
