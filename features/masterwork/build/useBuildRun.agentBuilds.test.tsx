/**
 * AF-D door #11 — a Masterwork Build whose agents are Agent Factory builds: each
 * `masterwork_agent_build` event becomes one tracked agent (its build shown live on the
 * Build page); today's events leave the list empty.
 */
import { act } from "react";
import { renderHook } from "@/test-utils/renderHook";

const mockUseMasterworkRun = jest.fn();

jest.mock("../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: (...args: unknown[]) => mockUseMasterworkRun(...args),
}));

import { useBuildRun } from "./useBuildRun";

type OnEvent = (name: string, data: Record<string, unknown>) => void;

async function mount() {
  let onDomainEvent: OnEvent = () => undefined;
  mockUseMasterworkRun.mockImplementation((opts: { onDomainEvent: OnEvent }) => {
    onDomainEvent = opts.onDomainEvent;
    return { status: "running", running: true, error: null, result: null, rejoinedTarget: null, launch: jest.fn(), reset: jest.fn() };
  });
  const hook = await renderHook(() => useBuildRun("e492a07f-a1d4-4a4b-98e7-bc929a0f40fd", "Plain Desk"));
  return { hook, send: (name: string, data: Record<string, unknown>) => act(() => onDomainEvent(name, data)) };
}

describe("useBuildRun — door #11 agent builds", () => {
  beforeEach(() => mockUseMasterworkRun.mockReset());

  it("tracks each agent's factory build from start to ending", async () => {
    const { hook, send } = await mount();
    await send("masterwork_agent_build", { role: "editor", agent_name: "Plain Desk — Editor", build_id: "b-1", outcome: null });
    await send("masterwork_agent_build", { role: "chief", agent_name: "Ana Ruiz (Chief)", build_id: "b-2", outcome: null });
    await send("masterwork_agent_build", { role: "chief", agent_name: "Ana Ruiz (Chief)", build_id: "b-2", outcome: "send_backs_exhausted" });
    await send("masterwork_agent_build", { role: "editor", agent_name: "Plain Desk — Editor", build_id: "b-1", outcome: "passed", agent_id: "a-1" });
    expect(hook.current.agentBuilds).toEqual([
      { role: "editor", name: "Plain Desk — Editor", buildId: "b-1", outcome: "passed", agentId: "a-1" },
      { role: "chief", name: "Ana Ruiz (Chief)", buildId: "b-2", outcome: "send_backs_exhausted", agentId: null },
    ]);
    // Only the kept agent counts as a finished part.
    const parts = hook.current.progress?.items.find((i) => i.id === "parts");
    expect(parts?.detail).toBe("Plain Desk — Editor");
    await hook.unmount();
  });

  it("stays empty on today's path", async () => {
    const { hook, send } = await mount();
    await send("masterwork_build_progress", { step: "agent_created", agent_name: "Plain Desk — Editor", agent_id: "x" });
    expect(hook.current.agentBuilds).toEqual([]);
    await hook.unmount();
  });
});
