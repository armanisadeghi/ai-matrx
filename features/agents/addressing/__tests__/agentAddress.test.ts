/**
 * THE ONE ADDRESS RULE, pinned.
 *
 * Arman, production, 2026-09-08: "When linking to system agents, you cannot
 * link to the same address as regular agents… Multiple parts of the page link
 * to agents but they don't all properly link to the right page depending on it
 * being a system agent or a user one."
 *
 * These are the two facts every agent link depends on and no call site may
 * decide for itself: the KIND picks the shell, and a VERSION id is not an
 * agent id.
 */
import {
  AGENT_BASE_PATH,
  SYSTEM_AGENT_BASE_PATH,
  agentDoorFor,
  agentHrefFromRow,
  agentPathFor,
  assertAgentIdNotVersion,
  isSystemAgentType,
  newAgentHref,
} from "../agentAddress";

const AGENT = "8f0bbfc2-85d9-4913-8cea-b09a50c62be6";

describe("agent kind decides the shell", () => {
  it("a builtin row yields the administration href", () => {
    expect(agentPathFor({ agentId: AGENT, agentType: "builtin" })).toBe(
      `${SYSTEM_AGENT_BASE_PATH}/${AGENT}`,
    );
    expect(agentHrefFromRow({ id: AGENT, agent_type: "builtin" })).toBe(
      `/administration/agents/system-agents/agents/${AGENT}`,
    );
  });

  it("a user row yields the core href", () => {
    expect(agentPathFor({ agentId: AGENT, agentType: "user" })).toBe(
      `${AGENT_BASE_PATH}/${AGENT}`,
    );
    expect(agentHrefFromRow({ id: AGENT, agent_type: null })).toBe(
      `/agents/${AGENT}`,
    );
  });

  it("only the literal 'builtin' moves an agent into the admin shell", () => {
    expect(isSystemAgentType("builtin")).toBe(true);
    for (const t of ["user", "system", "BUILTIN", null, ""])
      expect(isSystemAgentType(t)).toBe(false);
  });

  it("sub-routes follow the same shell", () => {
    expect(agentPathFor({ agentId: AGENT, agentType: "builtin" }, "/run")).toBe(
      `${SYSTEM_AGENT_BASE_PATH}/${AGENT}/run`,
    );
    expect(agentPathFor({ agentId: AGENT, agentType: "user" }, "/build")).toBe(
      `/agents/${AGENT}/build`,
    );
  });

  it("New agent lands in the corpus the page is showing", () => {
    expect(newAgentHref(true)).toBe(`${SYSTEM_AGENT_BASE_PATH}/new`);
    expect(newAgentHref(false)).toBe("/agents/new");
  });
});

describe("a version id resolves to the agent, then that version", () => {
  const VERSION_ID = "00123e15-9d4b-4835-8607-185282738062";
  const resolved = {
    agentId: AGENT,
    agentType: "builtin",
    isVersion: true,
    versionNumber: 6,
  };

  it("lands on agent + version, never on the version id as an agent", () => {
    const door = agentDoorFor(resolved);
    expect(door.state).toBe("ready");
    expect(door).toMatchObject({
      href: `${SYSTEM_AGENT_BASE_PATH}/${AGENT}/v/6`,
    });
    expect(door.state === "ready" && door.href).not.toContain(VERSION_ID);
  });

  it("an explicit sub still wins over the version landing", () => {
    expect(agentPathFor(resolved, "/build")).toBe(
      `${SYSTEM_AGENT_BASE_PATH}/${AGENT}/build`,
    );
  });

  it("THE VERSION GUARD fails when a version id reaches an agent-id slot", () => {
    expect(() =>
      assertAgentIdNotVersion(resolved, VERSION_ID, "a binding's holder_id"),
    ).toThrow(/agent VERSION id, not an agent id/);
  });

  it("the guard is silent for a real agent id", () => {
    expect(() =>
      assertAgentIdNotVersion(
        { agentId: AGENT, isVersion: false },
        AGENT,
        "a binding's holder_id",
      ),
    ).not.toThrow();
  });
});
