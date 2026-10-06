/**
 * AF-D doors #4, #5 and #6 — the browser halves.
 *
 * #4 "Make an agent from this chat": a stream that ends on a `building` event naming a
 *    build is a started Agent Factory build (the window follows it); today's stream (the
 *    agent + side-by-side result) is unchanged.
 * #5 mandate "+ Agent" / #6 /agents/new/generate: the page reads its knob
 *    (`agent_factory.door_<door>`); `legacy` is today's generator untouched, `pipeline`
 *    starts a server build naming the door and shows BuildProgress (never a browser insert).
 *    The knob is mocked here — never a live knob row.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

// ── shared mocks ───────────────────────────────────────────────────────────

const knobValues: Record<string, unknown> = {};
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  useSessionKnob: (ref: { feature: string; key: string }) => knobValues[`${ref.feature}.${ref.key}`],
  resolveSessionKnob: async (ref: { feature: string; key: string }) => knobValues[`${ref.feature}.${ref.key}`],
}));

const posted: { path: string; body: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
jest.mock("@/lib/python-client", () => ({
  postJson: async (path: string, body: Record<string, unknown>, opts: Record<string, unknown> = {}) => {
    posted.push({ path, body, opts });
    return { data: { build_id: "build-9" }, meta: {} };
  },
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}), supabase: {} }));

jest.mock("@/features/agents/factory/components/BuildProgress", () => ({
  BuildProgress: ({ buildId }: { buildId: string }) => <div data-testid="build-progress">{`progress:${buildId}`}</div>,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  for (const k of Object.keys(knobValues)) delete knobValues[k];
  posted.length = 0;
  window.localStorage.clear();
});

// ── the knob read ──────────────────────────────────────────────────────────

describe("a door's knob", () => {
  it("is pipeline only when it says pipeline; anything else keeps today's builder", async () => {
    const { resolveFactoryDoor } = await import("../door");
    expect(await resolveFactoryDoor("generate")).toBe("legacy"); // not answered yet
    knobValues["agent_factory.door_generate"] = "legacy";
    expect(await resolveFactoryDoor("generate")).toBe("legacy");
    knobValues["agent_factory.door_generate"] = "pipeline";
    expect(await resolveFactoryDoor("generate")).toBe("pipeline");
    expect(await resolveFactoryDoor("mandate_holder_draft")).toBe("legacy"); // per door
  });

  it("a dev-only local override forces a door without any knob row", async () => {
    const { resolveFactoryDoor, DEV_DOOR_OVERRIDE_PREFIX } = await import("../door");
    window.localStorage.setItem(`${DEV_DOOR_OVERRIDE_PREFIX}generate`, "pipeline");
    expect(await resolveFactoryDoor("generate")).toBe("pipeline");
  });
});

// ── the one start call ─────────────────────────────────────────────────────

describe("startAgentBuild", () => {
  it("names the door, the builtin rung and the owner's organization", async () => {
    const { startAgentBuild } = await import("../service");
    const id = await startAgentBuild({
      spec: { name: "x" },
      mandateKey: "news.coarse_relevance",
      door: "mandate_holder_draft",
      builtin: true,
      organizationId: "org-1",
    });
    expect(id).toBe("build-9");
    expect(posted[0].path).toBe("/agent-factory/builds");
    expect(posted[0].body).toMatchObject({ door: "mandate_holder_draft", builtin: true, mandate_key: "news.coarse_relevance" });
    expect(posted[0].opts).toEqual({ organizationId: "org-1" });
  });

  it("without a door it is today's call", async () => {
    const { startAgentBuild } = await import("../service");
    await startAgentBuild({ spec: { name: "x" } });
    expect(posted[0].body).not.toHaveProperty("door");
    expect(posted[0].body).not.toHaveProperty("builtin");
    expect(posted[0].opts).toEqual({});
  });
});

// ── door #4: the from-chat stream ──────────────────────────────────────────

type Listener = (event: { event: string; data?: unknown }) => void;
let streamed: { event: string; data?: unknown }[] = [];
jest.mock("@/lib/api/call-api", () => ({
  callApi: (args: { onStreamEvent: Listener }) => args,
}));
jest.mock("@/lib/api/adminDoor", () => ({ adminDoorOpen: () => false }));
jest.mock("@/features/masterwork/service", () => ({ createDraftRulebook: jest.fn() }));

async function runFromChat() {
  const { makeAgentFromChat } = await import("@/features/agents/from-chat/service");
  const steps: string[] = [];
  const dispatch = (async (args: { onStreamEvent: Listener }) => {
    for (const e of streamed) args.onStreamEvent(e);
    return {};
  }) as unknown as Parameters<typeof makeAgentFromChat>[0];
  const answer = await makeAgentFromChat(dispatch, "conv-1", (step) => steps.push(step));
  return { answer, steps };
}

const progress = (step: string, extra: Record<string, unknown> = {}) => ({
  event: "data",
  data: { type: "agent_studio_from_chat_progress", step, says: step, ...extra },
});

describe("door #4 — make an agent from this chat", () => {
  it("legacy: today's stream ends on the agent and its side-by-side result", async () => {
    streamed = [
      progress("reading"),
      progress("briefing"),
      progress("building"),
      progress("proving"),
      { event: "data", data: { type: "agent_studio_from_chat_result", agent_id: "a-1", agent_name: "Writer" } },
    ];
    const { answer, steps } = await runFromChat();
    expect(steps).toEqual(["reading", "briefing", "building", "proving"]);
    expect(answer).toEqual({ ok: true, result: expect.objectContaining({ agent_id: "a-1" }) });
  });

  it("pipeline: a building event naming a build is the answer — the window follows that build", async () => {
    streamed = [progress("reading"), progress("briefing"), progress("building", { build_id: "build-4" })];
    const { answer } = await runFromChat();
    expect(answer).toEqual({ ok: true, buildId: "build-4", proofCases: null, says: "building" });
  });

  it("R55: the build's real proof-case count and the server's line ride the answer", async () => {
    const says = "Building “W”, proving it on 2 cases. 1 example left out (example 1: it does not name the inputs).";
    streamed = [progress("building", { build_id: "build-5", proof_cases: 2, says })];
    const { answer } = await runFromChat();
    expect(answer).toEqual({ ok: true, buildId: "build-5", proofCases: 2, says });
  });

  it("a refusal stays a refusal even after a build was named", async () => {
    streamed = [progress("building"), { event: "error", data: { message: "no" } }];
    const { answer } = await runFromChat();
    expect(answer.ok).toBe(false);
  });
});
