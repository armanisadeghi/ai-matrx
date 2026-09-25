// Agent Change Impact — the post-edit badge (I6).
//
// What a PERSON sees after saving an agent: nothing when the change reaches
// no job they can see; an icon + count and a Review toast of facts when it
// does; an honest notice carrying the server's sentence when the read
// failed. Every fixture is the CONTRACT's shape.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const fetchImpactMock = jest.fn();
const readPostEditAutoOpenMock = jest.fn(async () => ({ state: "known", value: false }));
const readAutoAdvanceGreenMock = jest.fn(async () => ({ state: "known", value: false }));
const postAdvanceMock = jest.fn();
const postRevertMock = jest.fn();
const openWindowMock = jest.fn();
const toastInfoMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock("../impact", () => {
  const actual = jest.requireActual("../impact");
  return {
    ...actual,
    fetchImpact: (...args: unknown[]) => fetchImpactMock(...args),
    readPostEditAutoOpen: () => readPostEditAutoOpenMock(),
    readAutoAdvanceGreen: () => readAutoAdvanceGreenMock(),
    postAdvance: (...args: unknown[]) => postAdvanceMock(...args),
    postRevert: (...args: unknown[]) => postRevertMock(...args),
  };
});
let viewer: { isSuperAdmin: boolean; userId: string | null } = { isSuperAdmin: true, userId: "admin-1" };
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ userAuth: { id: viewer.userId, adminLevel: viewer.isSuperAdmin ? "super_admin" : null, adminLaneOpen: true } }),
}));
jest.mock("@/features/overlays/openers/agentFindUsagesWindow", () => ({
  useOpenAgentFindUsagesWindow: () => openWindowMock,
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import {
  autoAdvanceAfterSave,
  readAgentReach,
  revertAutoAdvance,
  useAgentChangeReach,
  type AgentReach,
} from "../useAgentChangeReach";
import {
  ADMIN_WRITE_CONTEXT,
  batchTierOf,
  countBatchTiers,
  describeReach,
  isBatchActionable,
  type AdvanceReport,
  type ImpactVerdict,
  type StandingImpact,
} from "../impact";
import { testableMandateKeys, versionPairsOf } from "../ImpactAgentCompanion";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function verdict(overrides: Partial<ImpactVerdict> = {}): ImpactVerdict {
  const base: ImpactVerdict = {
    holder_kind: "mandate_default",
    row_id: "row-1",
    mandate_key: "probe.i6_alpha",
    principal: { kind: "org", organization_id: "org-1", subject_user_id: null },
    agent_id: "agent-1",
    agent_name: "Quick Test Agent",
    lineage_path: [{ agent_id: "agent-1", agent_name: "Quick Test Agent", relation: "self" }],
    pinned_version_id: "v1",
    pinned_version_number: 1,
    latest_version_id: "v15",
    latest_version_number: 15,
    grade: "green",
    blocker: null,
    findings: [],
    settings_drift: { keys: [], capability: [], capability_checked: true },
    changed_columns: ["model_id"],
    apply_token: {
      holder_kind: "mandate_default",
      row_id: "row-1",
      expected_pinned_version_id: "v1",
      target_version_id: "v15",
    },
    auto_advance_eligible: true,
  };
  return { ...base, ...overrides };
}

function standing(verdicts: ImpactVerdict[], extra: Partial<StandingImpact> = {}): StandingImpact {
  return {
    verdicts,
    withheldTotal: 0,
    withheldGroups: [],
    withheldSentences: [],
    agentsExamined: 1,
    unknownAgentIds: [],
    unknownSentences: [],
    dryRun: false,
    computedAt: "2026-09-14T00:00:00Z",
    ...extra,
  };
}

let latest: ReturnType<typeof useAgentChangeReach> | null = null;
function Probe() {
  latest = useAgentChangeReach("agent-1");
  return <div data-testid="host">{latest.badge}</div>;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  viewer = { isSuperAdmin: true, userId: "admin-1" };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<Probe />));
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  latest = null;
});

const dispatch = jest.fn() as unknown as Parameters<typeof readAgentReach>[0];

describe("readAgentReach — the read, through the public door, descendants walked", () => {
  it("asks /mandates/impact/mine for this agent with its duplicates", async () => {
    fetchImpactMock.mockResolvedValueOnce(standing([]));
    await readAgentReach(dispatch, "agent-1", ADMIN_WRITE_CONTEXT);
    expect(fetchImpactMock).toHaveBeenCalledWith(dispatch, ["agent-1"], {
      includeDescendants: true,
      posture: "mine",
    });
  });

  it("is `none` at zero verdicts and carries what the server withheld", async () => {
    fetchImpactMock.mockResolvedValueOnce(
      standing([], { withheldTotal: 3, withheldSentences: ["3 personal pins are theirs to advance."] }),
    );
    const reach = await readAgentReach(dispatch, "agent-1", ADMIN_WRITE_CONTEXT);
    expect(reach).toEqual<AgentReach>({
      state: "none",
      withheldTotal: 3,
      withheldSentences: ["3 personal pins are theirs to advance."],
    });
  });

  it("is `failed` with the server's own sentence, never a throw", async () => {
    fetchImpactMock.mockRejectedValueOnce(new Error("impact_request_rejected: unknown agent"));
    const reach = await readAgentReach(dispatch, "agent-1", ADMIN_WRITE_CONTEXT);
    expect(reach).toEqual<AgentReach>({
      state: "failed",
      why: "impact_request_rejected: unknown agent",
    });
  });
});

describe("the badge and the toast", () => {
  it("shows NOTHING when the change reaches no job", async () => {
    fetchImpactMock.mockResolvedValueOnce(standing([]));
    await act(async () => {
      await latest!.announce("Quick Test Agent");
    });
    expect(container!.querySelector("[data-testid=agent-change-reach-badge]")).toBeNull();
    expect(container!.textContent).toBe("");
    expect(toastInfoMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("shows the badge and a Review toast when it reaches at least one job, and opens the scoped panel", async () => {
    const verdicts = [
      verdict(),
      verdict({
        row_id: "row-2",
        mandate_key: "probe.i6_beta",
        grade: "red",
        agent_id: "agent-2",
        agent_name: "Quick Test Agent (copy)",
        lineage_path: [
          { agent_id: "agent-1", agent_name: "Quick Test Agent", relation: "self" },
          { agent_id: "agent-2", agent_name: "Quick Test Agent (copy)", relation: "duplicated_from" },
        ],
        apply_token: {
          holder_kind: "mandate_default",
          row_id: "row-2",
          expected_pinned_version_id: "v1",
          target_version_id: "v15",
        },
      }),
    ];
    fetchImpactMock.mockResolvedValueOnce(standing(verdicts));
    await act(async () => {
      await latest!.announce("Quick Test Agent");
    });
    const badge = container!.querySelector<HTMLButtonElement>(
      "[data-testid=agent-change-reach-badge]",
    );
    expect(badge).not.toBeNull();
    expect(badge!.textContent?.replace(/\s/g, "")).toBe("2");
    expect(badge!.getAttribute("aria-label")).toBe(
      "2 mandates · 1 advance · 0 check · 1 red",
    );

    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    const [sentence, options] = toastInfoMock.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(sentence).toBe("2 mandates");
    expect(options.action.label).toBe("Review");

    // The knob is off by default, so nothing opened on its own.
    expect(openWindowMock).not.toHaveBeenCalled();

    // The badge opens the ONE surface — the Find Usages window for this agent.
    act(() => badge!.click());
    expect(openWindowMock).toHaveBeenCalledTimes(1);
    expect(openWindowMock.mock.calls[0][0]).toMatchObject({ agentId: "agent-1" });
    // The toast's Review door opens the same window.
    act(() => options.action.onClick());
    expect(openWindowMock).toHaveBeenCalledTimes(2);
    expect(openWindowMock.mock.calls[1][0]).toMatchObject({ agentId: "agent-1" });
  });

  it("opens the panel by itself only when the organization knob says so", async () => {
    readPostEditAutoOpenMock.mockResolvedValueOnce({ state: "known", value: true });
    fetchImpactMock.mockResolvedValueOnce(standing([verdict()]));
    await act(async () => {
      await latest!.announce("Quick Test Agent");
    });
    expect(openWindowMock).toHaveBeenCalledTimes(1);
  });

  it("says the reach is UNKNOWN, with the server's sentence, when the read fails — never silent", async () => {
    fetchImpactMock.mockRejectedValueOnce(new Error("impact_requires_caller: sign in and try again"));
    await act(async () => {
      await latest!.announce("Quick Test Agent");
    });
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toBe("Reach unknown");
    expect(
      (toastErrorMock.mock.calls[0][1] as { description: string }).description,
    ).toBe("impact_requires_caller: sign in and try again");
    expect(container!.querySelector("button[aria-label='Dismiss the reach notice']")).not.toBeNull();
    // Dismissible.
    const dismiss = container!.querySelector<HTMLButtonElement>(
      "button[aria-label='Dismiss the reach notice']",
    );
    act(() => dismiss!.click());
    expect(container!.textContent).toBe("");
  });
});

describe("the sentence and the companion's inputs", () => {
  it("describeReach leads with what the person can act on, then the reach, and keeps the not-movable count visible", () => {
    const counts = countBatchTiers([
      verdict(),
      verdict({ row_id: "r2", mandate_key: "probe.i6_b", grade: "orange" }),
      verdict({ row_id: "r3", mandate_key: "probe.i6_c", blocker: "tracks_latest" }),
    ]);
    expect(describeReach(counts)).toBe(
      "3 mandates · 1 advance · 1 check · 0 red · 1 blocked",
    );
  });

  it("a personal pin is movable only by its owner through the owner lane, never by an admin on their behalf (I12)", () => {
    const own = verdict({
      holder_kind: "binding",
      row_id: "b1",
      principal: { kind: "user", organization_id: "org-1", subject_user_id: "user-1" },
      apply_token: {
        holder_kind: "binding",
        row_id: "b1",
        expected_pinned_version_id: "v1",
        target_version_id: "v15",
      },
    });
    const theirs = verdict({
      holder_kind: "binding",
      row_id: "b2",
      principal: { kind: "user", organization_id: "org-1", subject_user_id: "user-2" },
      apply_token: {
        holder_kind: "binding",
        row_id: "b2",
        expected_pinned_version_id: "v1",
        target_version_id: "v15",
      },
    });
    const mine = { posture: "mine" as const, actorUserId: "user-1" };
    expect(batchTierOf(own, { context: mine })).toBe("safe");
    expect(isBatchActionable(own, mine)).toBe(true);
    expect(batchTierOf(theirs, { context: mine })).toBe("blocked");
    expect(isBatchActionable(theirs, mine)).toBe(false);
    // A super admin's OWN pin is movable too (it travels through /mine); with
    // no actor named, no pin is anyone's.
    expect(batchTierOf(own, { context: { posture: "admin", actorUserId: "user-1" } })).toBe("safe");
    expect(batchTierOf(own)).toBe("blocked");
    // The badge counts the same way: the owner's pin is actionable for them.
    expect(describeReach(countBatchTiers([own, theirs], { context: mine }))).toBe(
      "1 mandate · 1 advance · 0 check · 0 red · 1 blocked",
    );
  });

  it("versionPairsOf lists the focus agent's own pinned→newest pairs once each, lowest first, and skips descendants", () => {
    const pairs = versionPairsOf(
      [
        verdict({ pinned_version_number: 12, latest_version_number: 15 }),
        verdict({ row_id: "r2", mandate_key: "probe.i6_b", pinned_version_number: 1, latest_version_number: 15 }),
        verdict({ row_id: "r3", mandate_key: "probe.i6_c", pinned_version_number: 12, latest_version_number: 15 }),
        verdict({ row_id: "r4", mandate_key: "probe.i6_d", agent_id: "agent-2", pinned_version_number: 3, latest_version_number: 4 }),
        verdict({ row_id: "r5", mandate_key: "probe.i6_e", pinned_version_number: null, latest_version_number: 15, blocker: "tracks_latest" }),
      ],
      "agent-1",
    );
    expect(pairs).toEqual([
      { pinned: 1, latest: 15, mandateKeys: ["probe.i6_b"] },
      { pinned: 12, latest: 15, mandateKeys: ["probe.i6_alpha", "probe.i6_c"] },
    ]);
  });

  it("testableMandateKeys keeps every reached job once, in read order", () => {
    expect(
      testableMandateKeys([
        verdict(),
        verdict({ row_id: "r2", holder_kind: "binding" }),
        verdict({ row_id: "r3", mandate_key: "probe.i6_b" }),
      ]),
    ).toEqual(["probe.i6_alpha", "probe.i6_b"]);
  });
});

describe("autoAdvanceAfterSave — the automatic move takes the SAME lanes as the panel (R47, verifier D-B)", () => {
  const own = verdict({
    row_id: "own-pin",
    holder_kind: "binding",
    mandate_key: "probe.own",
    principal: { kind: "user", organization_id: "org-1", subject_user_id: "admin-1" },
    apply_token: { holder_kind: "binding", row_id: "own-pin", expected_pinned_version_id: "v1", target_version_id: "v15" },
  });
  const theirs = verdict({
    row_id: "their-pin",
    holder_kind: "binding",
    mandate_key: "probe.theirs",
    principal: { kind: "user", organization_id: "org-1", subject_user_id: "someone-else" },
    apply_token: { holder_kind: "binding", row_id: "their-pin", expected_pinned_version_id: "v1", target_version_id: "v15" },
  });
  const org = verdict({ row_id: "org-rung", mandate_key: "probe.org" });
  const report = (batchId: string, rowId: string): AdvanceReport => ({
    batch_id: batchId,
    batch_label: "auto",
    action: "advance",
    computed_at: "2026-09-14T00:00:00Z",
    counts: { total: 1, advanced: 1, reverted: 0, refused: 0, excluded: 0 },
    results: [
      {
        token: { holder_kind: "binding", row_id: rowId, expected_pinned_version_id: "v1", target_version_id: "v15" },
        mandate_key: rowId,
        status: "advanced",
        reason: null,
        prior_pinned_version_id: "v1",
        new_pinned_version_id: "v15",
        ledger_row_id: `ledger-${rowId}`,
      },
    ],
  });

  beforeEach(() => {
    postAdvanceMock.mockReset();
    postRevertMock.mockReset();
    readAutoAdvanceGreenMock.mockResolvedValue({ state: "known", value: true });
  });

  it("a super admin's own pin goes through /mine, the org rung through the admin lane, and another person's pin is never sent", async () => {
    postAdvanceMock
      .mockResolvedValueOnce(report("batch-mine", "own-pin"))
      .mockResolvedValueOnce(report("batch-admin", "org-rung"));
    const outcome = await autoAdvanceAfterSave(
      jest.fn() as never,
      standing([own, theirs, org]),
      { posture: "admin", actorUserId: "admin-1" },
      "auto after edit",
    );
    expect(outcome.state).toBe("advanced");
    if (outcome.state !== "advanced") return;
    expect(postAdvanceMock).toHaveBeenCalledTimes(2);
    const postures = postAdvanceMock.mock.calls.map((call) => call[3]);
    expect(postures).toEqual(["mine", "admin"]);
    const sentRows = postAdvanceMock.mock.calls.flatMap((call) =>
      (call[1] as ImpactVerdict[]).map((v) => v.row_id),
    );
    expect(sentRows).toEqual(["own-pin", "org-rung"]);
    expect(sentRows).not.toContain("their-pin");
    expect(outcome.legs.map((leg) => [leg.posture, leg.batchId])).toEqual([
      ["mine", "batch-mine"],
      ["admin", "batch-admin"],
    ]);
    expect(outcome.report.counts?.advanced).toBe(2);
  });

  it("Put back reverts every leg through the door it went through", async () => {
    postRevertMock.mockResolvedValue({
      batch_id: "r",
      batch_label: "put back",
      action: "revert",
      computed_at: "2026-09-14T00:00:00Z",
      counts: { total: 1, advanced: 0, reverted: 1, refused: 0, excluded: 0 },
      results: [],
    });
    const { reports, failures } = await revertAutoAdvance(
      jest.fn() as never,
      [
        { posture: "mine", batchId: "batch-mine", report: report("batch-mine", "own-pin") },
        { posture: "admin", batchId: "batch-admin", report: report("batch-admin", "org-rung") },
      ],
      "put back",
    );
    expect(failures).toEqual([]);
    expect(reports).toHaveLength(2);
    expect(postRevertMock.mock.calls.map((call) => [call[1], call[4]])).toEqual([
      ["batch-mine", "mine"],
      ["batch-admin", "admin"],
    ]);
  });
});
