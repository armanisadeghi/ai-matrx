/**
 * WALL W10 (Expert Book Challenge, 2026-09-10) — WAITING FOR A WORKSPACE IS
 * NOT A BROKEN BINDING.
 *
 * What was live, twice, on a cold navigation to `/masterwork/[id]/conduct`:
 *
 *   "The Masterwork system isn't available right now (mandate
 *    "masterwork.conductor" cannot resolve yet: workspace initialization timed
 *    out …). An administrator can bind an agent to the masterwork.conductor
 *    Mandate."
 *
 * The Mandate WAS bound. Resolution refuses until an organization is in force
 * (which agent runs a job depends on the workspace), and that refusal was
 * being printed inside the unbound-mandate remedy — sending an Expert off to
 * repair something that was never broken.
 *
 * The fix is in the hook, so every Mandate consumer inherits it: the org
 * refusal is its own fact (`organizationPending`), the hook retries ONCE on
 * its own before reporting it, and a consumer showing that state must never
 * print the administrator remedy.
 *
 * Only `resolveMandate` is stubbed — the error class is the real one, so a
 * rename of it fails this suite instead of silently disarming it.
 */
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MandateOrganizationUnresolvedError } from "../service";
import { useMandate } from "../useMandate";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const resolveMandate = jest.fn();

jest.mock("../service", () => {
  const actual = jest.requireActual("../service");
  return {
    ...actual,
    resolveMandate: (...args: unknown[]) => resolveMandate(...args),
    onMandateCacheInvalidated: () => () => undefined,
  };
});

const KEY = "masterwork.conductor";

let container: HTMLDivElement;
let root: Root;
let seen: ReturnType<typeof useMandate> | null = null;

function Probe() {
  const state = useMandate(KEY);
  // Recorded in an effect, never during render — the component stays pure.
  useEffect(() => {
    seen = state;
  }, [state]);
  return (
    <div>
      {state.organizationPending ? "Getting your workspace ready…" : null}
      {!state.loading && !state.organizationPending && !state.mandate
        ? "An administrator can bind an agent"
        : null}
    </div>
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  resolveMandate.mockReset();
  seen = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

it("retries once on its own when the workspace is not ready yet", async () => {
  resolveMandate
    .mockRejectedValueOnce(
      new MandateOrganizationUnresolvedError(KEY, "timed-out"),
    )
    .mockResolvedValueOnce({ agentId: "agent-1", contract: null });

  await act(async () => {
    root.render(<Probe />);
  });
  await settle();

  expect(resolveMandate).toHaveBeenCalledTimes(2);
  expect(seen?.mandate).toEqual({ agentId: "agent-1", contract: null });
  expect(seen?.organizationPending).toBe(false);
  expect(seen?.error).toBeNull();
  expect(container.textContent).not.toContain("administrator");
});

it("reports a workspace that never arrives as WAIT, never as an unbound Mandate", async () => {
  resolveMandate.mockRejectedValue(
    new MandateOrganizationUnresolvedError(KEY, "timed-out"),
  );
  const consoleError = jest.spyOn(console, "error").mockImplementation();

  await act(async () => {
    root.render(<Probe />);
  });
  await settle();

  // Tried, then tried again on its own, then said so.
  expect(resolveMandate).toHaveBeenCalledTimes(2);
  expect(seen?.organizationPending).toBe(true);
  expect(container.textContent).toContain("Getting your workspace ready");
  // THE DEFECT: this remedy is for an UNBOUND mandate only.
  expect(container.textContent).not.toContain("administrator");
  // A wait is not a fault, so it does not shout into the console either.
  expect(consoleError).not.toHaveBeenCalled();
});

it("still reports a genuinely unresolvable Mandate as a fault, with no retry", async () => {
  resolveMandate.mockRejectedValue(new Error("the goal_writer rung is empty"));
  const consoleError = jest.spyOn(console, "error").mockImplementation();

  await act(async () => {
    root.render(<Probe />);
  });
  await settle();

  expect(resolveMandate).toHaveBeenCalledTimes(1);
  expect(seen?.organizationPending).toBe(false);
  expect(seen?.error).toContain("goal_writer");
  expect(container.textContent).toContain("An administrator can bind an agent");
  expect(consoleError).toHaveBeenCalled();
});
