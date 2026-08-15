const createClient = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ createClient }));

import { ChecklistRunCreateError, loadOrCreateRun, loadRun } from "../service";

const scope = {
  organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  targetKey: "7853b973-be56-47cd-bdf3-a55fad9dd0e4",
};

const row = {
  id: "5ac98175-ac3c-4406-8943-d7a2ed954ce9",
  checklist_key: "marketing.site_setup",
  target_key: scope.targetKey,
  organization_id: scope.organizationId,
  state: { steps: {} },
  completed_at: null,
  dismissed_at: null,
  created_at: "2026-08-15T18:00:00.000Z",
  updated_at: "2026-08-15T18:00:00.000Z",
  version: 1,
};

function readQuery(result: { data: typeof row | null; error: unknown }) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return query;
}

function insertQuery(result: { data: typeof row | null; error: unknown }) {
  const query = {
    insert: jest.fn(),
    select: jest.fn(),
    single: jest.fn().mockResolvedValue(result),
  };
  query.insert.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function mockQueries(...queries: object[]) {
  const from = jest.fn();
  for (const query of queries) from.mockReturnValueOnce(query);
  const schema = jest.fn().mockReturnValue({ from });
  createClient.mockReturnValue({ schema });
  return { schema, from };
}

describe("guided checklist persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates and re-reads the signed-in user's own checklist run", async () => {
    const initialRead = readQuery({ data: null, error: null });
    const insert = insertQuery({ data: row, error: null });
    const reread = readQuery({ data: row, error: null });
    const { schema, from } = mockQueries(initialRead, insert, reread);

    const created = await loadOrCreateRun("marketing.site_setup", scope);
    const loaded = await loadRun("marketing.site_setup", scope);

    expect(created.id).toBe(row.id);
    expect(loaded).toEqual(created);
    expect(schema).toHaveBeenCalledWith("platform");
    expect(from).toHaveBeenCalledWith("guided_checklist_run");
    expect(insert.insert).toHaveBeenCalledWith({
      checklist_key: "marketing.site_setup",
      target_key: scope.targetKey,
      organization_id: scope.organizationId,
      state: { steps: {} },
    });
  });

  it("reports a first-run insert failure as creation, not loading", async () => {
    const initialRead = readQuery({ data: null, error: null });
    const insertError = { code: "42501", message: "RLS denied the insert" };
    const insert = insertQuery({ data: null, error: insertError });
    const racedRead = readQuery({ data: null, error: null });
    mockQueries(initialRead, insert, racedRead);

    await expect(
      loadOrCreateRun("marketing.site_setup", scope),
    ).rejects.toMatchObject({
      name: "ChecklistRunCreateError",
      cause: insertError,
    } satisfies Partial<ChecklistRunCreateError>);
  });
});
