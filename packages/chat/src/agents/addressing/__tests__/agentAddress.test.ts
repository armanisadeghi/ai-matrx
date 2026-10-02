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
  userShellPathForSystemAgentPath,
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

/**
 * Arman, 2026-09-23: a normal user choosing "Open agent" on a system agent in
 * chat was sent to the admin tree and bounced to the Welcome page. The viewer
 * is the third input; a non-admin's builtin lives in the ordinary shell.
 */
describe("the viewer decides a builtin's shell", () => {
  it("a non-admin gets the user shell for a builtin, sub-route and version kept", () => {
    const nonAdmin = { isAdmin: false };
    expect(
      agentPathFor({ agentId: AGENT, agentType: "builtin" }, "", nonAdmin),
    ).toBe(`${AGENT_BASE_PATH}/${AGENT}`);
    expect(
      agentPathFor({ agentId: AGENT, agentType: "builtin" }, "/run", nonAdmin),
    ).toBe(`${AGENT_BASE_PATH}/${AGENT}/run`);
    expect(
      agentDoorFor(
        { agentId: AGENT, agentType: "builtin", isVersion: true, versionNumber: 4 },
        "",
        nonAdmin,
      ),
    ).toMatchObject({ href: `${AGENT_BASE_PATH}/${AGENT}/v/4` });
  });

  it("an admin still gets the System Agents tree", () => {
    expect(
      agentPathFor({ agentId: AGENT, agentType: "builtin" }, "", { isAdmin: true }),
    ).toBe(`${SYSTEM_AGENT_BASE_PATH}/${AGENT}`);
  });

  it("a user agent is the user shell for everyone", () => {
    expect(
      agentPathFor({ agentId: AGENT, agentType: "user" }, "", { isAdmin: true }),
    ).toBe(`${AGENT_BASE_PATH}/${AGENT}`);
  });
});

describe("a non-admin who reaches a System Agents address is forwarded", () => {
  it("maps the record and its sub-route onto the user shell", () => {
    expect(
      userShellPathForSystemAgentPath(`${SYSTEM_AGENT_BASE_PATH}/${AGENT}`),
    ).toBe(`${AGENT_BASE_PATH}/${AGENT}`);
    expect(
      userShellPathForSystemAgentPath(`${SYSTEM_AGENT_BASE_PATH}/${AGENT}/build`),
    ).toBe(`${AGENT_BASE_PATH}/${AGENT}/build`);
    expect(
      userShellPathForSystemAgentPath(`${SYSTEM_AGENT_BASE_PATH}/${AGENT}/v/3`),
    ).toBe(`${AGENT_BASE_PATH}/${AGENT}/v/3`);
  });

  it("drops an admin-only sub-route rather than landing on a 404", () => {
    expect(
      userShellPathForSystemAgentPath(`${SYSTEM_AGENT_BASE_PATH}/${AGENT}/samples`),
    ).toBe(`${AGENT_BASE_PATH}/${AGENT}`);
  });

  it("leaves the list, /new and the rest of administration alone", () => {
    expect(userShellPathForSystemAgentPath(SYSTEM_AGENT_BASE_PATH)).toBeNull();
    expect(userShellPathForSystemAgentPath(`${SYSTEM_AGENT_BASE_PATH}/new`)).toBeNull();
    expect(userShellPathForSystemAgentPath("/administration/users")).toBeNull();
  });
});
