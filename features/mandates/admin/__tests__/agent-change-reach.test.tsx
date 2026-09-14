// Agent Change Impact — the post-edit badge (I6).
//
// What a PERSON sees after saving an agent: nothing when the change reaches
// no job they can see; a "reaches N" badge and a toast with a Review door when
// it does; an honest notice carrying the server's sentence when the read
// failed. Every fixture is the CONTRACT's shape.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const fetchImpactMock = jest.fn();
const readPostEditAutoOpenMock = jest.fn(async () => ({ state: "known", value: false }));
const openWindowMock = jest.fn();
const toastInfoMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock("../impact", () => {
  const actual = jest.requireActual("../impact");
  return {
    ...actual,
    fetchImpact: (...args: unknown[]) => fetchImpactMock(...args),
    readPostEditAutoOpen: () => readPostEditAutoOpenMock(),
  };
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/features/overlays/openers/impactBatchWindow", () => ({
  useOpenImpactBatchWindow: () => openWindowMock,
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import {
  readAgentReach,
  useAgentChangeReach,
  type AgentReach,
} from "../useAgentChangeReach";
import { describeReach, countBatchTiers, type ImpactVerdict, type StandingImpact } from "../impact";
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
    await readAgentReach(dispatch, "agent-1");
    expect(fetchImpactMock).toHaveBeenCalledWith(dispatch, ["agent-1"], {
      includeDescendants: true,
      posture: "mine",
    });
  });

  it("is `none` at zero verdicts and carries what the server withheld", async () => {
    fetchImpactMock.mockResolvedValueOnce(
      standing([], { withheldTotal: 3, withheldSentences: ["3 personal pins are theirs to advance."] }),
    );
    const reach = await readAgentReach(dispatch, "agent-1");
    expect(reach).toEqual<AgentReach>({
      state: "none",
      withheldTotal: 3,
      withheldSentences: ["3 personal pins are theirs to advance."],
    });
  });

  it("is `failed` with the server's own sentence, never a throw", async () => {
    fetchImpactMock.mockRejectedValueOnce(new Error("impact_request_rejected: unknown agent"));
    const reach = await readAgentReach(dispatch, "agent-1");
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
          { agent_id: "agent-2", agent_name: "Quick Test Agent (copy)", relation: "duplicate" },
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
    expect(badge!.textContent).toContain("reaches 2");
    expect(badge!.getAttribute("aria-label")).toBe(
      "This change reaches 2 mandates: 1 safe / 0 to check / 1 red",
    );

    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    const [sentence, options] = toastInfoMock.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(sentence).toBe("This change reaches 2 mandates: 1 safe / 0 to check / 1 red");
    expect(options.action.label).toBe("Review");

    // The knob is off by default, so nothing opened on its own.
    expect(openWindowMock).not.toHaveBeenCalled();

    act(() => badge!.click());
    expect(openWindowMock).toHaveBeenCalledTimes(1);
    expect(openWindowMock.mock.calls[0][0]).toMatchObject({
      agentIds: ["agent-1"],
      mode: "post_batch",
      posture: "mine",
      focusAgentId: "agent-1",
      surfaceName: "agent-post-edit",
    });
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
    expect(String(toastErrorMock.mock.calls[0][0])).toContain(
      "impact_requires_caller: sign in and try again",
    );
    expect(container!.textContent).toContain("reach unknown");
    // Dismissible.
    const dismiss = container!.querySelector<HTMLButtonElement>(
      "button[aria-label='Dismiss the reach notice']",
    );
    act(() => dismiss!.click());
    expect(container!.textContent).toBe("");
  });
});

describe("the sentence and the companion's inputs", () => {
  it("describeReach names every pile, including the ones a batch cannot move", () => {
    const counts = countBatchTiers([
      verdict(),
      verdict({ row_id: "r2", mandate_key: "probe.i6_b", grade: "orange" }),
      verdict({ row_id: "r3", mandate_key: "probe.i6_c", blocker: "tracks_latest" }),
    ]);
    expect(describeReach(counts)).toBe(
      "This change reaches 3 mandates: 1 safe / 1 to check / 0 red / 1 not movable here",
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
