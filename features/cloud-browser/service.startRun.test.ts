/**
 * The fleet admits exactly ONE browser. So a duplicate start is not a benign
 * retry — the loser 503s and the panel renders that failure even though a
 * browser was successfully created. Observed in production 2026-08-23.
 */

import { postJson } from "@/lib/python-client";
import { loadSnapshot, loadSnapshotForRun } from "./service";

jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

const profileRow = {
  id: "prof-1",
  owner_type: "user",
  owner_user_id: "user-1",
  organization_id: "org-1",
  org_access_mode: "all_members",
  display_name: "My Cloud Browser",
  is_default: true,
  status: "active",
  home_region: "us-east-1",
  checkpoint_status: "none",
  current_checkpoint_revision: 0,
  current_checkpoint_at: null,
  current_checkpoint_bytes: null,
  chromium_version: null,
  last_started_at: null,
  last_stopped_at: null,
  expires_at: null,
};

const runRow = {
  id: "run-1",
  profile_id: profileRow.id,
  state: "agent_control",
  mode: "handoff_capable",
  execution_target: "browser_fleet",
  controller_kind: "agent",
  controller_user_id: null,
  controller_revision: 1,
  current_origin: null,
  current_url: null,
  started_at: "2026-08-23T00:00:00.000Z",
  stopped_at: null,
  error_code: null,
  error_detail_safe: null,
};

type QueryResult = { data: unknown; error: null };

function queryFor(table: string) {
  const result = (): QueryResult => {
    if (table === "profile") return { data: [profileRow], error: null };
    return { data: [], error: null };
  };
  const q: Record<string, unknown> & PromiseLike<QueryResult> = {
    then(resolve) {
      return Promise.resolve(result()).then(resolve);
    },
  };
  for (const method of ["select", "eq", "in", "is", "order", "limit", "gt"]) {
    q[method] = () => q;
  }
  q.maybeSingle = async () => ({ data: null, error: null });
  q.single = async () =>
    table === "run"
      ? { data: runRow, error: null }
      : { data: { metadata: {} }, error: null };
  return q;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: (table: string) => queryFor(table),
    }),
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "t" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/utils/permissions/access", () => ({
  getResourceAccess: jest.fn(async () => ({ level: "admin" })),
}));

describe("run admission", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not start a browser for a run that is not live", async () => {
    // The handoff seam must never conjure a browser off a stream event — that
    // is what would burn the fleet's single slot from the background.
    await expect(loadSnapshotForRun({ runId: "run-gone" })).resolves.toBeNull();
    expect(postJson).not.toHaveBeenCalled();
  });

  it("shares one start request across concurrent panel hydrations", async () => {
    let markStartReached!: () => void;
    const startReached = new Promise<void>((resolve) => {
      markStartReached = resolve;
    });
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    (postJson as jest.Mock).mockImplementation(async () => {
      markStartReached();
      await startGate;
      return { data: { run: { run_id: runRow.id } } };
    });

    const first = loadSnapshot(profileRow.id);
    const second = loadSnapshot(profileRow.id);
    await startReached;

    expect(postJson).toHaveBeenCalledTimes(1);
    releaseStart();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    expect(postJson).toHaveBeenCalledTimes(1);
    expect(postJson).toHaveBeenCalledWith(
      "/browser-manager/runs",
      expect.objectContaining({
        profile_id: profileRow.id,
        activation_key: expect.any(String),
      }),
    );
  });
});
