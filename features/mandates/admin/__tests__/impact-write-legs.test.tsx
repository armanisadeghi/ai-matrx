// Agent Change Impact — writes are routed by OWNERSHIP (I12 follow-up).
//
// The actor's own personal pins go through /mandates/impact/advance/mine;
// everything else through the admin lane when the actor is a super admin.
// A super admin who chooses one own pin and one org rung makes TWO
// requests, sees ONE batch, and a revert puts both back through their own
// doors. Another person's pin is never sent anywhere.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const postAdvanceMock = jest.fn();
const postRevertMock = jest.fn();
const confirmMock = jest.fn(async () => true);

jest.mock("../impact", () => {
  const actual = jest.requireActual("../impact");
  return {
    ...actual,
    postAdvance: (...args: unknown[]) => postAdvanceMock(...args),
    postRevert: (...args: unknown[]) => postRevertMock(...args),
    readRevertWindow: async () => ({ state: "known", hours: 72 }),
  };
});
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: () => confirmMock(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      userAuth: { id: "admin-1", adminLevel: "super_admin", adminLaneOpen: true },
    }),
}));

import { useImpactAdvance } from "../impact-advance";
import {
  mergeAdvanceReports,
  splitWriteLegs,
  type AdvanceReport,
  type ImpactVerdict,
} from "../impact";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function verdict(overrides: Partial<ImpactVerdict>): ImpactVerdict {
  const rowId = overrides.row_id ?? "row-1";
  const holderKind = overrides.holder_kind ?? "mandate_default";
  return {
    holder_kind: holderKind,
    row_id: rowId,
    mandate_key: "probe.i6_x",
    principal: { kind: "org", organization_id: "org-1", subject_user_id: null },
    agent_id: "agent-1",
    agent_name: "Quick Test Agent",
    pinned_version_id: "v1",
    pinned_version_number: 1,
    latest_version_id: "v2",
    latest_version_number: 2,
    grade: "green",
    blocker: null,
    findings: [],
    settings_drift: { keys: [], capability: [], capability_checked: true },
    apply_token: {
      holder_kind: holderKind,
      row_id: rowId,
      expected_pinned_version_id: "v1",
      target_version_id: "v2",
    },
    auto_advance_eligible: true,
    ...overrides,
  };
}

const OWN = verdict({
  holder_kind: "binding",
  row_id: "own-binding",
  mandate_key: "probe.i6_own",
  principal: { kind: "user", organization_id: "org-1", subject_user_id: "admin-1" },
});
const THEIRS = verdict({
  holder_kind: "binding",
  row_id: "their-binding",
  mandate_key: "probe.i6_theirs",
  principal: { kind: "user", organization_id: "org-1", subject_user_id: "user-2" },
});
const ORG = verdict({ row_id: "org-default", mandate_key: "probe.i6_org" });

function report(batchId: string, verdicts: ImpactVerdict[], action: "advance" | "revert" = "advance"): AdvanceReport {
  return {
    batch_id: batchId,
    action,
    results: verdicts.map((v) => ({
      token: v.apply_token,
      mandate_key: v.mandate_key,
      status: action === "advance" ? "advanced" : "reverted",
      prior_pinned_version_id: "v1",
      new_pinned_version_id: "v2",
      ledger_row_id: `${batchId}-${v.row_id}`,
    })),
    counts: { total: verdicts.length, advanced: action === "advance" ? verdicts.length : 0, reverted: action === "revert" ? verdicts.length : 0, refused: 0, excluded: 0 },
    computed_at: "2026-09-14T00:00:00Z",
  };
}

describe("splitWriteLegs", () => {
  it("sends a super admin's own pin through /mine, the org rung through the admin lane, and another person's pin nowhere", () => {
    const legs = splitWriteLegs([OWN, THEIRS, ORG], { posture: "admin", actorUserId: "admin-1" });
    expect(legs).toEqual([
      { posture: "mine", verdicts: [OWN] },
      { posture: "admin", verdicts: [ORG] },
    ]);
  });

  it("sends everything a non-admin chose through /mine, minus other people's pins", () => {
    const legs = splitWriteLegs([OWN, THEIRS, ORG], { posture: "mine", actorUserId: "admin-1" });
    expect(legs).toEqual([{ posture: "mine", verdicts: [OWN, ORG] }]);
  });
});

describe("mergeAdvanceReports", () => {
  it("is one view: the first batch id, every row, the counts summed", () => {
    const merged = mergeAdvanceReports([report("b-mine", [OWN]), report("b-admin", [ORG])]);
    expect(merged.batch_id).toBe("b-mine");
    expect(merged.results?.map((r) => r.token.row_id)).toEqual(["own-binding", "org-default"]);
    expect(merged.counts).toEqual({ total: 2, advanced: 2, reverted: 0, refused: 0, excluded: 0 });
  });
});

describe("useImpactAdvance routes by ownership", () => {
  let api: ReturnType<typeof useImpactAdvance> | null = null;
  function Probe() {
    const verdictByRung = new Map<string, ImpactVerdict>();
    for (const v of [OWN, THEIRS, ORG]) verdictByRung.set(`${v.holder_kind}:${v.row_id}`, v);
    api = useImpactAdvance({ verdictByRung });
    return null;
  }
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<Probe />));
  });
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    api = null;
  });

  it("a super admin with one own pin + one org rung: two requests, both advanced, one batch; revert puts both back through their own doors", async () => {
    postAdvanceMock
      .mockResolvedValueOnce(report("b-mine", [OWN]))
      .mockResolvedValueOnce(report("b-admin", [ORG]));

    let merged: AdvanceReport | null = null;
    await act(async () => {
      merged = await api!.advance([OWN, THEIRS, ORG], "I12 split");
    });
    expect(postAdvanceMock).toHaveBeenCalledTimes(2);
    expect(postAdvanceMock.mock.calls[0][1]).toEqual([OWN]);
    expect(postAdvanceMock.mock.calls[0][3]).toBe("mine");
    expect(postAdvanceMock.mock.calls[1][1]).toEqual([ORG]);
    expect(postAdvanceMock.mock.calls[1][3]).toBe("admin");
    // THEIRS was never sent.
    for (const call of postAdvanceMock.mock.calls) {
      expect((call[1] as ImpactVerdict[]).some((v) => v.row_id === "their-binding")).toBe(false);
    }
    expect(merged!.counts?.advanced).toBe(2);
    expect(api!.batches).toHaveLength(1);
    expect(api!.resultByRung.get("binding:own-binding")?.status).toBe("advanced");
    expect(api!.resultByRung.get("mandate_default:org-default")?.status).toBe("advanced");

    postRevertMock
      .mockResolvedValueOnce(report("r-mine", [OWN], "revert"))
      .mockResolvedValueOnce(report("r-admin", [ORG], "revert"));
    await act(async () => {
      await api!.revert(api!.batches[0], null);
    });
    expect(postRevertMock).toHaveBeenCalledTimes(2);
    expect(postRevertMock.mock.calls.map((c) => [c[1], c[4]])).toEqual([
      ["b-mine", "mine"],
      ["b-admin", "admin"],
    ]);
    expect(api!.batches[0].reverts_batch_id).toBe("b-mine");
    expect(api!.batches[0].counts?.reverted).toBe(2);
  });

  it("a one-row revert reaches only the door that carried the rung", async () => {
    postAdvanceMock
      .mockResolvedValueOnce(report("b-mine", [OWN]))
      .mockResolvedValueOnce(report("b-admin", [ORG]));
    await act(async () => {
      await api!.advance([OWN, ORG], "I12 split");
    });
    postRevertMock.mockResolvedValueOnce(report("r-admin", [ORG], "revert"));
    await act(async () => {
      await api!.revert(api!.batches[0], "org-default");
    });
    expect(postRevertMock).toHaveBeenCalledTimes(1);
    expect(postRevertMock.mock.calls[0][1]).toBe("b-admin");
    expect(postRevertMock.mock.calls[0][2]).toBe("org-default");
    expect(postRevertMock.mock.calls[0][4]).toBe("admin");
  });
});
