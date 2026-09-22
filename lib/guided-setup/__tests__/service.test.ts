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

/**
 * 🚨 CREATION GOES THROUGH THE DOOR, NOT THROUGH AN INSERT (DOORS-ONLY-3,
 * ea575de438 — "three doors, three tables shut").
 *
 * `platform` is no longer a client-writable schema: the first-visit row is made
 * by `public.checklist_run_start`, which does the read-then-insert INSIDE the
 * database (so two tabs cannot race) and stamps `created_by` from `auth.uid()`
 * instead of trusting anything this file sends. This suite used to stand in an
 * `.insert(...).select().single()` chain, which is the path that was CLOSED —
 * so it now stands in the door and asserts the door's own arguments.
 */
function mockDoors(
  reads: object[],
  start: { data: typeof row | null; error: unknown },
) {
  const from = jest.fn();
  for (const query of reads) from.mockReturnValueOnce(query);
  const schema = jest.fn().mockReturnValue({ from });
  const rpc = jest.fn().mockResolvedValue(start);
  createClient.mockReturnValue({ schema, rpc });
  return { schema, from, rpc };
}

describe("guided checklist persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates and re-reads the signed-in user's own checklist run", async () => {
    const initialRead = readQuery({ data: null, error: null });
    const reread = readQuery({ data: row, error: null });
    const { schema, from, rpc } = mockDoors([initialRead, reread], {
      data: row,
      error: null,
    });

    const created = await loadOrCreateRun("marketing.site_setup", scope);
    const loaded = await loadRun("marketing.site_setup", scope);

    expect(created.id).toBe(row.id);
    expect(loaded).toEqual(created);
    expect(schema).toHaveBeenCalledWith("platform");
    expect(from).toHaveBeenCalledWith("guided_checklist_run");
    // The row is made by the door, with the scope it was asked about — and
    // nothing else: no `created_by`, no state, nothing a browser could forge.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("checklist_run_start", {
      p_organization_id: scope.organizationId,
      p_checklist_key: "marketing.site_setup",
      p_target_key: scope.targetKey,
    });
    // And the schema the client may only READ is only ever read from: the two
    // `from()` calls above are the initial look and the re-read.
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("reports a first-run insert failure as creation, not loading", async () => {
    const initialRead = readQuery({ data: null, error: null });
    const insertError = { code: "42501", message: "RLS denied the insert" };
    const racedRead = readQuery({ data: null, error: null });
    mockDoors([initialRead, racedRead], { data: null, error: insertError });

    await expect(
      loadOrCreateRun("marketing.site_setup", scope),
    ).rejects.toMatchObject({
      name: "ChecklistRunCreateError",
      cause: insertError,
    } satisfies Partial<ChecklistRunCreateError>);
  });
});
