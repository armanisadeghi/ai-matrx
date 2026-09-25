/**
 * ONE SERVER CALL PAINTS A PAGE (2026-09-25).
 *
 * The admin list's page read used to be followed by two sequential reads
 * (definitions + bindings, then agents + versions) before a row could paint.
 * `public.mnd_admin_list` now returns the page's own rows (`console`), and the
 * service builds from that answer alone. The code-scan cells are asked for the
 * page's keys only, after the rows exist.
 */
const listState = {
  version: 0,
  reports: { codeTruth: null, coverage: null, impact: null, workflowImpact: null },
  failures: {} as Record<string, string>,
  settled: { codeTruth: false, coverage: false, impact: false, workflowImpact: false },
  offersByProvision: new Map<string, string[]>(),
  sourceFacts: new Map([
    ["podcast.script", { mandateKey: "podcast.script", declaredIn: ["aidream"], calledFrom: ["matrx-frontend"], languages: ["Python"], callSites: 3, flagged: 0 }],
  ]),
  sourceChecked: new Set(["podcast.script"]),
};

const ensureMandateSourceFacts = jest.fn();
jest.mock("../store", () => ({
  ensureMandateAdminReports: jest.fn(async () => listState.reports),
  ensureMandateSourceFacts: (keys: string[]) => ensureMandateSourceFacts(keys),
  getMandateAdminDbEpoch: () => 0,
  getMandateAdminListState: () => listState,
  mergeProvisionOffers: jest.fn(),
  recordMandateAdminFailure: jest.fn(),
}));
const callMandateAdminList = jest.fn();
jest.mock("../rpc", () => ({
  callMandateAdminList: (args: unknown) => callMandateAdminList(args),
}));
const fetchMandateConsoleData = jest.fn();
jest.mock("@/features/mandates/admin/service", () => ({
  ...jest.requireActual("@/features/mandates/admin/service"),
  fetchMandateConsoleData: (...args: unknown[]) => fetchMandateConsoleData(...args),
}));
jest.mock("@/features/mandates/provisions", () => ({ fetchProvisions: jest.fn(async () => new Map()) }));
const buildAdminRows = jest.fn();
jest.mock("../rows", () => ({
  ...jest.requireActual("../rows"),
  buildAdminRows: (sources: unknown) => buildAdminRows(sources),
}));

import type { AppDispatch } from "@/lib/redux/store";
import { consoleDataFromPage, createMandateAdminService } from "../service";
import type { MandateAdminPageConsole } from "../rpc";

const AGENT = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const WORKFLOW = "33333333-3333-4333-8333-333333333333";

const CONSOLE: MandateAdminPageConsole = {
  mandates: [
    { id: "m2", mandate_key: "seo.audit", default_holder_type: "workflow", default_holder_id: WORKFLOW },
    { id: "m1", mandate_key: "podcast.script", default_holder_type: "agent", default_holder_version_id: VERSION },
  ] as unknown as MandateAdminPageConsole["mandates"],
  bindings: [
    { id: "b1", mandate_id: "m1", principal_type: "org" },
  ] as unknown as MandateAdminPageConsole["bindings"],
  agents: [
    {
      id: AGENT,
      name: "Script writer",
      version: 4,
      is_archived: false,
      agent_type: "builtin",
      auto_context_disabled: null,
      variable_definitions: [{ name: "topic" }],
      context_policies: [{ key: "brand" }],
      output_schema: null,
    },
  ],
  versions: [{ id: VERSION, agent_id: AGENT, version_number: 3, name: "v3" }],
  workflows: [{ id: WORKFLOW, name: "Audit flow", is_archived: null }],
  workflow_versions: [],
};

describe("consoleDataFromPage", () => {
  it("builds the console shape the one row builder reads", () => {
    const data = consoleDataFromPage(CONSOLE);
    expect(data.mandates.map((m) => m.mandate_key)).toEqual(["podcast.script", "seo.audit"]);
    expect(data.agentsById[AGENT]).toMatchObject({
      name: "Script writer",
      agentType: "builtin",
      variableNames: ["topic"],
      contextPolicyKeys: ["brand"],
    });
    // Present-with-null = "declares no structured output", never absent.
    expect(AGENT in data.outputSchemas).toBe(true);
    expect(data.versionsById[VERSION]).toEqual({ id: VERSION, agentId: AGENT, versionNumber: 3, name: "v3" });
    expect(data.workflowsById?.[WORKFLOW]).toEqual({ id: WORKFLOW, name: "Audit flow", isArchived: false });
    expect(data.bindingsByMandateId.m1).toHaveLength(1);
  });
});

describe("the admin list page read", () => {
  it("paints from ONE call and asks the scan for the page's keys only", async () => {
    callMandateAdminList.mockResolvedValueOnce({
      total: 2,
      rows: [
        { id: "m1", mandate_key: "podcast.script", customized_by: ["Default"], serves: ["Feature code"], serves_detail: [], backs_count: 0, home_label: "System", feature_label: "Podcast", contract_check: "Mismatch" },
        { id: "m2", mandate_key: "seo.audit", customized_by: ["Default"], serves: ["Nothing found"], serves_detail: [], backs_count: 1, home_label: "System", feature_label: "SEO", contract_check: "Not checked" },
      ],
      console: CONSOLE,
    });
    buildAdminRows.mockImplementation(({ console: data }: { console: ReturnType<typeof consoleDataFromPage> }) =>
      data.mandates.map((m) => ({ mandateKey: m.mandate_key, provisionKey: null, contractCheck: "Not checked" })),
    );
    const service = createMandateAdminService((() => undefined) as unknown as AppDispatch);
    const page = await service.fetchPage(
      { scope: { kind: "system" }, search: "", filters: {}, page: 1 } as never,
      { sort: "name", direction: "asc", pageSize: 50 } as never,
    );

    expect(callMandateAdminList).toHaveBeenCalledTimes(1);
    expect(callMandateAdminList.mock.calls[0][0]).toMatchObject({ p_mode: "page" });
    expect(fetchMandateConsoleData).not.toHaveBeenCalled();
    expect(page.total).toBe(2);
    expect(page.rows.map((r) => r.mandateKey)).toEqual(["podcast.script", "seo.audit"]);
    // The database's contract word wins.
    expect(page.rows[0].contractCheck).toBe("Mismatch");
    // A key the scan answered carries its facts; one still being read says so.
    expect(page.rows[0].sources?.declaredIn).toEqual(["aidream"]);
    expect(page.rows[0].sourcesPending).toBe(false);
    expect(page.rows[1].sources).toBeNull();
    expect(page.rows[1].sourcesPending).toBe(true);
    expect(ensureMandateSourceFacts).toHaveBeenCalledWith(["podcast.script", "seo.audit"]);
  });
});
