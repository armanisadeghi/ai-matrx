/**
 * Mandates admin service — the owner bench, code-truth, variable-verdict and
 * console-load boundaries.
 *
 * SUTs: `parseMandateTestHistory`, `runMandateTests`,
 * `fetchMandateCodeTruthReport`, `fetchMandateVariableVerdicts`,
 * `fetchMandateConsoleData`. What they OWN and what is asserted: the request
 * each builds (path, params, body, deadlines), the Supabase query each emits
 * (schema, table, filters, scope), the session gate that must refuse BEFORE a
 * request exists, validation of what the server returns, and error mapping.
 *
 * Real: the session gate (`requireAuthenticatedSupabaseSession`), a Redux
 * store's dispatch, and every validator. Replaced: only the transports — the
 * Supabase browser client (a recording fake that answers each query) and the
 * `callApi` network thunk (a recorder that returns a scripted ApiCallResult).
 */

import type { ApiCallResult } from "@/lib/api/call-api";

interface RecordedQuery {
  schema: string;
  table: string;
  ops: Array<{ method: string; args: unknown[] }>;
}
interface QueryResult {
  data: unknown;
  error: { message: string; code: string } | null;
}

const mockQueries: RecordedQuery[] = [];
const mockApiConfigs: unknown[] = [];
const mockTransport: {
  respond: (query: RecordedQuery) => QueryResult;
  api: ApiCallResult;
  signedIn: boolean;
} = {
  respond: () => ({ data: [], error: null }),
  api: {},
  signedIn: true,
};

class MockQuery implements PromiseLike<QueryResult> {
  readonly recorded: RecordedQuery;
  constructor(schema: string, table: string) {
    this.recorded = { schema, table, ops: [] };
    mockQueries.push(this.recorded);
  }
  private record(method: string, args: unknown[]): this {
    this.recorded.ops.push({ method, args });
    return this;
  }
  select(...args: unknown[]): this {
    return this.record("select", args);
  }
  is(...args: unknown[]): this {
    return this.record("is", args);
  }
  in(...args: unknown[]): this {
    return this.record("in", args);
  }
  order(...args: unknown[]): this {
    return this.record("order", args);
  }
  then<A = QueryResult, B = never>(
    onfulfilled?: ((value: QueryResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(mockTransport.respond(this.recorded)).then(
      onfulfilled,
      onrejected,
    );
  }
}

const mockSupabase = {
  auth: {
    getClaims: async () =>
      mockTransport.signedIn
        ? { data: { claims: { sub: "user-1" } }, error: null }
        : { data: null, error: null },
    getSession: async () => ({
      data: {
        session: mockTransport.signedIn ? { access_token: "jwt-1" } : null,
      },
      error: null,
    }),
  },
  schema: (schema: string) => ({
    from: (table: string) => new MockQuery(schema, table),
  }),
};

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => mockSupabase,
  get supabase() {
    return mockSupabase;
  },
}));
jest.mock("@/lib/api/call-api", () => ({
  callApi: (config: unknown) => {
    mockApiConfigs.push(config);
    return async () => mockTransport.api;
  },
}));

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
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
  type MandateCodeTruth,
  type MandateCodeTruthReport,
  type MandateTestBatchRequest,
  type MandateTestBatchResponse,
  type MandateVariableResolution,
} from "../service";

function makeDispatch() {
  // Same dev-check posture as the production makeStore (lib/redux/store.ts).
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  }).dispatch;
}

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

const CODE_TRUTH = {
  mandate_key: "podcast.deep_research",
  resolution: "code_declaration_found",
  drift: "code_only",
  bound_agent_drift: "code_only",
  code_variables: [
    "user_request",
    "include_sources",
    "max_items",
    "tags",
    "options",
    "tone",
  ],
  db_required_variables: [],
  code_only_variables: ["user_request"],
  db_only_variables: [],
  bound_agent_missing_variables: [],
  bound_agent_only_variables: [],
  spill_variables: [],
  bound_agent_spilled_variables: [],
  provision_key: null,
  offered_values: [],
  offer_consumption: [],
  source: {
    class_name: "DeepResearchAgent",
    module: "features.podcast.mandates",
    source_file: "features/podcast/mandates.py",
    line: 42,
  },
  inputs: [
    { name: "user_request", mapped_name: "topic", type: "str", required: true },
    {
      name: "include_sources",
      mapped_name: "cite_sources",
      type: "bool",
      required: false,
    },
    { name: "max_items", mapped_name: "limit", type: "int", required: false },
    { name: "tags", mapped_name: "labels", type: "list[str]", required: false },
    {
      name: "options",
      mapped_name: "settings",
      type: "dict[str, Any]",
      required: false,
    },
    {
      name: "tone",
      mapped_name: "voice",
      type: "str",
      required: false,
      default_value: "brief",
    },
  ],
  variable_map: {
    user_request: "topic",
    include_sources: "cite_sources",
    max_items: "limit",
    tags: "labels",
    options: "settings",
    tone: "voice",
  },
  output: null,
  passes_user_input: false,
  call_sites: [
    { source_file: "features/podcast/service.py", line: 118 },
  ],
  bound_agent: null,
  import_error: null,
} satisfies MandateCodeTruth;

const CODE_TRUTH_REPORT = {
  mandates: [CODE_TRUTH],
  import_failures: [],
  counts: { total: 1, code_only: 1 },
} satisfies MandateCodeTruthReport;

const BATCH_REQUEST = {
  baseline: { label: "Baseline", selection: "current" },
  candidates: [
    {
      candidate_id: "without-overrides",
      label: "Without overrides",
      selection: "current",
      config_overrides: {},
    },
  ],
  principal: { user_id: "user-1", organization_id: "org-1" },
} satisfies MandateTestBatchRequest;

const BATCH_RESPONSE = {
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
} satisfies MandateTestBatchResponse;

describe("mandate owner bench service", () => {
  beforeEach(() => {
    mockQueries.length = 0;
    mockApiConfigs.length = 0;
    mockTransport.respond = () => ({ data: [], error: null });
    mockTransport.api = {};
    mockTransport.signedIn = true;
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
    const { mandate_key: _retired, ...withoutMandateKey } = result(
      "legacy",
      "2026-08-09T11:00:00Z",
    );
    const legacy = { ...withoutMandateKey, slot_key: "seo.classify" };

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

  it("posts one all-exemplar batch with explicit empty overrides and a batch-sized connect deadline", async () => {
    mockTransport.api = { data: BATCH_RESPONSE };

    await expect(
      runMandateTests(makeDispatch(), "seo.classify", BATCH_REQUEST),
    ).resolves.toEqual(BATCH_RESPONSE);

    expect(mockApiConfigs).toEqual([
      {
        path: "/mandates/{mandate_key}/tests",
        method: "POST",
        pathParams: { mandate_key: "seo.classify" },
        body: {
          baseline: { label: "Baseline", selection: "current" },
          candidates: [
            {
              candidate_id: "without-overrides",
              label: "Without overrides",
              selection: "current",
              config_overrides: {},
            },
          ],
          principal: { user_id: "user-1", organization_id: "org-1" },
        },
        connectTimeoutMs: 600_000,
        totalTimeoutMs: null,
      },
    ]);
  });

  it("refuses a batch response whose results are malformed", async () => {
    mockTransport.api = {
      data: {
        ...BATCH_RESPONSE,
        exemplars: [
          {
            exemplar_id: "exemplar-1",
            exemplar_label: "Captured input",
            results: [{ id: "half-a-result" }],
          },
        ],
      },
    };

    await expect(
      runMandateTests(makeDispatch(), "seo.classify", BATCH_REQUEST),
    ).rejects.toThrow("Agent mandate bench returned an invalid batch response.");
  });

  it("surfaces the server's error message when the batch call fails", async () => {
    mockTransport.api = {
      error: {
        type: "http_error",
        message: "Mandate seo.classify has no exemplars",
        status: 422,
      },
    };

    await expect(
      runMandateTests(makeDispatch(), "seo.classify", BATCH_REQUEST),
    ).rejects.toThrow("Mandate seo.classify has no exemplars");
  });

  it("loads a validated code-truth report after confirming the browser session", async () => {
    mockTransport.api = { data: CODE_TRUTH_REPORT };

    await expect(
      fetchMandateCodeTruthReport(makeDispatch()),
    ).resolves.toEqual(CODE_TRUTH_REPORT);
    expect(mockApiConfigs).toEqual([
      { path: "/mandates/code-truth", method: "GET", connectTimeoutMs: 60_000 },
    ]);
  });

  it("refuses a code-truth report carrying an unknown drift verdict", async () => {
    mockTransport.api = {
      data: {
        ...CODE_TRUTH_REPORT,
        mandates: [{ ...CODE_TRUTH, drift: "renamed" }],
      },
    };

    await expect(fetchMandateCodeTruthReport(makeDispatch())).rejects.toThrow(
      "Agent mandate code-truth returned an invalid report.",
    );
  });

  it("never constructs the code-truth request without a browser session", async () => {
    mockTransport.signedIn = false;

    await expect(fetchMandateCodeTruthReport(makeDispatch())).rejects.toThrow(
      "sign-in session could not be verified",
    );
    expect(mockApiConfigs).toEqual([]);
  });

  it("never constructs mandate table reads without a browser session", async () => {
    mockTransport.signedIn = false;

    await expect(fetchMandateConsoleData()).rejects.toThrow(
      "sign-in session could not be verified",
    );
    expect(mockQueries).toEqual([]);
  });

  it("reads only the named, live mandates when the console load is scoped", async () => {
    await expect(
      fetchMandateConsoleData({
        mandateKeys: [
          "seo.classify",
          "podcast.deep_research",
          "seo.classify",
        ],
      }),
    ).resolves.toEqual({
      mandates: [],
      agentsById: {},
      versionsById: {},
      bindingsByMandateId: {},
      outputSchemas: {},
    });

    expect(mockQueries).toEqual([
      {
        schema: "mandate",
        table: "definition",
        ops: [
          { method: "select", args: ["*"] },
          { method: "is", args: ["deleted_at", null] },
          {
            method: "in",
            args: ["mandate_key", ["seo.classify", "podcast.deep_research"]],
          },
          { method: "order", args: ["mandate_key"] },
        ],
      },
    ]);
  });

  it("propagates a refused definition read instead of an empty console", async () => {
    const refusal = {
      message: "permission denied for table definition",
      code: "42501",
    };
    mockTransport.respond = () => ({ data: null, error: refusal });

    await expect(
      fetchMandateConsoleData({ mandateKeys: ["seo.classify"] }),
    ).rejects.toEqual(refusal);
  });

  it("sends a representative value of each code field's real type under its mapped name", async () => {
    const verdicts = {
      variables: {},
      user_input: null,
      verdicts: [
        {
          variable: "topic",
          code_name: "user_request",
          verdict: "dropped",
          message: "code value is dropped",
          caution: true,
          blocking: false,
          lossy: false,
        },
      ],
      blocking: false,
    } satisfies MandateVariableResolution;
    mockTransport.api = { data: verdicts };

    await expect(
      fetchMandateVariableVerdicts(makeDispatch(), CODE_TRUTH),
    ).resolves.toEqual(verdicts);
    expect(mockApiConfigs).toEqual([
      {
        path: "/mandates/{mandate_key}/variable-verdicts",
        method: "POST",
        pathParams: { mandate_key: "podcast.deep_research" },
        body: {
          code_values: {
            topic: "example value",
            cite_sources: true,
            limit: 1,
            labels: [],
            settings: {},
            voice: "brief",
          },
        },
      },
    ]);
  });

  it("refuses an empty variable-verdict response", async () => {
    mockTransport.api = {};

    await expect(
      fetchMandateVariableVerdicts(makeDispatch(), CODE_TRUTH),
    ).rejects.toThrow(
      "Agent mandate podcast.deep_research returned no variable verdicts.",
    );
  });
});
