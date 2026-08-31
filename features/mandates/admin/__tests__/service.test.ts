import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import {
  isMandateTestResult,
  mandateTestResultValidationErrors,
  type MandateTestResponse,
} from "@/features/mandates/test-run";
import {
  fetchMandateConsoleData,
  fetchMandateCodeTruthReport,
  fetchMandateVariableVerdicts,
  parseMandateTestHistory,
  runMandateTests,
  type MandateTestBatchResponse,
} from "../service";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { createClient } from "@/utils/supabase/client";

jest.mock("@/lib/api/call-api", () => ({
  callApi: jest.fn((config: unknown) => config),
}));

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/utils/supabase/webDb", () => ({
  requireAuthenticatedSupabaseSession: jest.fn().mockResolvedValue({
    access_token: "test-token",
  }),
}));

const callApiMock = jest.mocked(callApi);
const requireSessionMock = jest.mocked(requireAuthenticatedSupabaseSession);
const createClientMock = jest.mocked(createClient);

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
    requireSessionMock.mockClear();
    requireSessionMock.mockResolvedValue({
      access_token: "test-token",
    } as Awaited<ReturnType<typeof requireAuthenticatedSupabaseSession>>);
  });

  it("reads persisted history newest-first and drops malformed entries loudly", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const parsed = parseMandateTestHistory(
      {
        keep_me: true,
        test_bench_results: [
          result("older", "2026-08-09T10:00:00Z"),
          { id: "malformed" },
          result("newer", "2026-08-09T11:00:00Z", "provider failed"),
        ],
      },
      { mandateKey: "seo.classify", exemplarId: "exemplar-1" },
    );

    expect(parsed.map((entry) => entry.id)).toEqual(["newer", "older"]);
    expect(parsed[0]?.error).toBe("provider failed");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        "rejected 1 persisted bench result(s) for mandate seo.classify, exemplar exemplar-1; first invalid entry #2 id=malformed: created_at must be a string",
      ),
      expect.objectContaining({
        operation: "parse_mandate_test_history",
        mandateKey: "seo.classify",
        exemplarId: "exemplar-1",
        invalidEntries: [
          expect.objectContaining({
            index: 1,
            resultId: "malformed",
            receivedKeys: ["id"],
            errors: expect.arrayContaining([
              "created_at must be a string",
              "mandate_key must be a string",
            ]),
          }),
        ],
      }),
    );
    consoleError.mockRestore();
  });

  it("identifies a retired slot_key without accepting it as a current result", () => {
    const legacy = {
      ...result("legacy", "2026-08-09T11:00:00Z"),
      slot_key: "seo.classify",
    };
    delete (legacy as { mandate_key?: string }).mandate_key;

    expect(isMandateTestResult(legacy)).toBe(false);
    expect(mandateTestResultValidationErrors(legacy)).toEqual([
      "mandate_key must be a string",
    ]);
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
    expect(requireSessionMock).toHaveBeenCalledTimes(1);
  });

  it("never constructs the code-truth request without a browser session", async () => {
    requireSessionMock.mockRejectedValueOnce(
      new Error("Opening the mandate console requires an authenticated session."),
    );
    const dispatch = jest.fn();

    await expect(
      fetchMandateCodeTruthReport(dispatch as unknown as AppDispatch),
    ).rejects.toThrow("requires an authenticated session");
    expect(dispatch).not.toHaveBeenCalled();
    expect(callApiMock).not.toHaveBeenCalled();
  });

  it("never constructs mandate table reads without a browser session", async () => {
    const schema = jest.fn();
    createClientMock.mockReturnValueOnce({
      schema,
    } as unknown as ReturnType<typeof createClient>);
    requireSessionMock.mockRejectedValueOnce(
      new Error("Opening the mandate console requires an authenticated session."),
    );

    await expect(fetchMandateConsoleData()).rejects.toThrow(
      "requires an authenticated session",
    );
    expect(schema).not.toHaveBeenCalled();
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
