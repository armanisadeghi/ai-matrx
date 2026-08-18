import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import {
  isMandateTestResult,
  fetchMandateCodeTruthReport,
  fetchMandateVariableVerdicts,
  parseMandateTestHistory,
  runMandateTests,
  type MandateTestBatchResponse,
  type MandateTestResponse,
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
): MandateTestResponse {
  return {
    id,
    created_at: createdAt,
    mandate_key: "seo.classify",
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

describe("mandate owner bench service", () => {
  beforeEach(() => {
    callApiMock.mockClear();
  });

  it("reads persisted history newest-first and drops malformed entries loudly", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const parsed = parseMandateTestHistory({
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
      "[mandates] ignored 1 malformed persisted bench result(s)",
    );
    consoleError.mockRestore();
  });

  it("treats a failed agent run as a valid persisted result", () => {
    expect(
      isMandateTestResult(
        result("failed", "2026-08-09T11:00:00Z", "model unavailable"),
      ),
    ).toBe(true);
  });

  it("uses callApi for one all-exemplar batch and preserves explicit empty overrides", async () => {
    const response: MandateTestBatchResponse = {
      mandate_key: "seo.classify",
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
      runMandateTests(dispatch as unknown as AppDispatch, "seo.classify", {
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
        path: "/mandates/{mandate_key}/tests",
        method: "POST",
        pathParams: { mandate_key: "seo.classify" },
        connectTimeoutMs: 10 * 60_000,
        totalTimeoutMs: null,
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

  it("loads the live code-truth report through the typed client", async () => {
    // `mandates` is aidream's wire field name. It used to be `slots`, and this
    // fixture deliberately kept the old name until the server half of the
    // Mandate rename landed — it has (verified against the live OpenAPI on
    // 2026-08-17: `MandateCodeTruthReport.mandates`), so the fixture moved with
    // it. Renaming this ahead of the server would have made the guard accept a
    // shape nothing sends; leaving it behind makes the guard reject the real one.
    const response = {
      mandates: [],
      import_failures: [],
      counts: { total: 0 },
    };
    const dispatch = jest.fn().mockResolvedValue({ data: response });

    await expect(
      fetchMandateCodeTruthReport(dispatch as unknown as AppDispatch),
    ).resolves.toEqual(response);
    expect(callApiMock).toHaveBeenCalledWith({
      path: "/mandates/code-truth",
      method: "GET",
      connectTimeoutMs: 60_000,
    });
  });

  it("evaluates the mapped code fields against the agent that really runs", async () => {
    const response = {
      variables: {},
      user_input: null,
      verdicts: [
        {
          variable: "user_request",
          code_name: "user_request",
          verdict: "dropped" as const,
          message: "code value is dropped",
          caution: true,
          blocking: false,
          lossy: false,
        },
      ],
      blocking: false,
    };
    const dispatch = jest.fn().mockResolvedValue({ data: response });

    await expect(
      fetchMandateVariableVerdicts(dispatch as unknown as AppDispatch, {
        mandate_key: "podcast.deep_research",
        resolution: "code_declaration_found",
        drift: "code_only",
        bound_agent_drift: "code_only",
        code_variables: ["user_request"],
        db_required_variables: [],
        code_only_variables: ["user_request"],
        db_only_variables: [],
        inputs: [
          {
            name: "user_request",
            mapped_name: "user_request",
            type: "str",
            required: true,
          },
        ],
      }),
    ).resolves.toEqual(response);
    expect(callApiMock).toHaveBeenCalledWith({
      path: "/mandates/{mandate_key}/variable-verdicts",
      method: "POST",
      pathParams: { mandate_key: "podcast.deep_research" },
      body: { code_values: { user_request: "example value" } },
    });
  });
});
