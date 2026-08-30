/**
 * THE DARK-SHIP RATCHET for the app → mandate cutover.
 *
 * Two things this file exists to stop:
 *   1. The switch flipping by accident. `APP_MANDATE_CUTOVER` is a one-line
 *      release that changes which agent 96 live apps run; it moves when Arman
 *      nods, and a failing test is how a stray edit announces itself.
 *   2. The OFF branch drifting. While the switch is OFF the router must be a
 *      pure pass-through of the row's own columns — no invented defaults, no
 *      mandate fields leaking into the answer, nothing async. If that stops
 *      being true, "ships dark" stops being true with it.
 *
 * The ON branch is proven by flipping the constant locally and re-running the
 * agent-apps suites — it is literal-narrowed, so no runtime test can reach it
 * while it is false, and pretending otherwise would be a test that cannot fail.
 */

import { APP_MANDATE_CUTOVER, pinnedHolder } from "./appHolder";

describe("APP_MANDATE_CUTOVER", () => {
  it("is OFF — the flip is a deliberate release, never a side effect", () => {
    expect(APP_MANDATE_CUTOVER).toBe(false);
  });
});

describe("pinnedHolder — the OFF answer", () => {
  it("returns the row's own agent verbatim, synchronously", () => {
    expect(
      pinnedHolder({
        agent_id: "agent-1",
        agent_version_id: "ver-1",
        use_latest: false,
      }),
    ).toEqual({
      agentId: "agent-1",
      agentVersionId: "ver-1",
      useLatest: false,
      configOverrides: null,
      mandateId: null,
      mandateKey: null,
      provenance: null,
      loading: false,
      error: null,
    });
  });

  it("never leaks the mandate columns into the pinned answer", () => {
    const holder = pinnedHolder({
      agent_id: "agent-1",
      use_latest: true,
      mandate_id: "mandate-1",
      mandate_key: "app.thing",
      mandate_agent_id: "some-other-agent",
    });
    expect(holder.agentId).toBe("agent-1");
    expect(holder.mandateId).toBeNull();
    expect(holder.mandateKey).toBeNull();
    expect(holder.provenance).toBeNull();
  });

  it("treats a missing version as floating, not as a pinned null", () => {
    const holder = pinnedHolder({ agent_id: "agent-1", use_latest: true });
    expect(holder.agentVersionId).toBeNull();
    expect(holder.useLatest).toBe(true);
  });
});
