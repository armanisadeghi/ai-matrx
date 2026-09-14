/** @jest-environment node */

/**
 * SUT: GET /api/compute-targets. It owns the sandbox projection that feeds
 * every picker. If `template` is omitted from its Supabase select, PostgREST
 * cannot return the canonical top-level value and the canvas label drifts.
 */

const SANDBOX_ID = "9aa2f6a6-7a27-43fb-ad0e-56e4e6222c78";

let sandboxRows: Array<Record<string, unknown>> = [];
let sandboxSelect = "";

function selectedSandboxRows(columns: string) {
  const fields = columns.split(",").map((field) => field.trim());
  return sandboxRows.map((row) =>
    Object.fromEntries(
      fields
        .filter((field) => field in row)
        .map((field) => [field, row[field]]),
    ),
  );
}

function sandboxQuery() {
  return {
    select: (columns: string) => {
      sandboxSelect = columns;
      return {
        eq: () => ({
          is: () => ({
            order: async () => ({ data: selectedSandboxRows(columns), error: null }),
          }),
        }),
      };
    },
  };
}

function appInstancesQuery() {
  return {
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
  };
}

function accountQuery() {
  return {
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    }),
  };
}

function tierQuery() {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { features: { max_sandboxes: 1 } }, error: null }),
      }),
    }),
  };
}

const supabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
  },
  from: (table: string) => {
    if (table === "sandbox_instances") return sandboxQuery();
    if (table === "app_instances") return appInstancesQuery();
    if (table === "user_account") return accountQuery();
    if (table === "account_tiers") return tierQuery();
    throw new Error(`Unexpected table: ${table}`);
  },
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => supabase,
}));
jest.mock("@/features/files/filesDb", () => ({
  filesDb: (client: typeof supabase) => client,
}));

const { GET } = require("./route") as typeof import("./route");

async function getTargets() {
  const response = await GET();
  return { response, body: await response.json() };
}

beforeEach(() => {
  sandboxSelect = "";
  sandboxRows = [];
});

test.each([
  [
    "uses the canonical top-level template over stale config",
    { template: "ec2", config: { template: "bare" } },
    "ec2 · ec2 · 9aa2f6",
  ],
  [
    "keeps config.template as the legacy fallback",
    { template: null, config: { template: "bare" } },
    "bare · ec2 · 9aa2f6",
  ],
])("GET /api/compute-targets %s", async (_case, templateFields, expectedName) => {
  sandboxRows = [
    {
      id: SANDBOX_ID,
      name: null,
      sandbox_id: "sbx-9aa2f6",
      status: "running",
      tier: "ec2",
      expires_at: null,
      updated_at: "2026-09-14T00:00:00.000Z",
      ...templateFields,
    },
  ];

  const { response, body } = await getTargets();

  expect(response.status).toBe(200);
  // This projection-modeling fake drops unselected fields, exactly as
  // PostgREST does. The pre-fix select therefore produced `bare · ec2 …`.
  expect(body.targets).toEqual([
    expect.objectContaining({
      id: SANDBOX_ID,
      name: expectedName,
      template: templateFields.template ?? templateFields.config.template,
    }),
  ]);
  expect(sandboxSelect).toContain("template");
});

export {};
