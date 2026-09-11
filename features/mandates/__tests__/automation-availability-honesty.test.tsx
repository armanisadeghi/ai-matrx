/**
 * 🚨 A DISABLED CONTROL NEVER WEARS A FALSE REASON — V-PARITY/UX F4.
 *
 * Read off the deployed admin panel (`/administration/mandates/{key}`,
 * v0.4.1728), verbatim:
 *
 *   "Refine with AI — Not available yet — this runs the job
 *    "mandate.goal_writer", and no live job has that name. Create it and this
 *    button works, with no deploy."
 *
 * `mandate.goal_writer` was LIVE, enabled and homed in the Matrx System
 * organization at that moment. The sentence told an admin to create a job that
 * already exists — a false reason that is ACTIONABLE, which is worse than no
 * reason at all.
 *
 * ROOT CAUSE, and why it is a class rather than a copy bug: `useMandate`'s
 * optional lane answers `mandate: null` for a 404 AND for every refusal, every
 * unadmitted organization and every network failure. `AutomationButton` read
 * `mandate !== null` as "the job exists", so ONE boolean carried THREE facts
 * and the screen printed the only one it knew. It is the second time this key's
 * probe has lied.
 *
 * These are the guards for the three facts, asserted on the rendered component
 * — the words a person reads, never an internal shape.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AutomationButton,
  missingAutomationMandateLine,
  unavailableAutomationMandateLine,
} from "../authoring/AutomationButton";
import * as useMandateModule from "../useMandate";
import * as inputSurfaceModule from "../input-surface";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const GOAL_WRITER = "mandate.goal_writer";

/** The door's own 409 sentence for a job that exists and cannot answer. */
const DOOR_SAID =
  "no rung answers this job — nothing names a Holder that can run it. Bind a " +
  "Holder at one of those rungs and this resolves with no deploy.";

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

function render(
  container: HTMLDivElement,
  root: Root,
  state: useMandateModule.MandateState,
) {
  jest.spyOn(useMandateModule, "useMandate").mockReturnValue(state);
  jest
    .spyOn(inputSurfaceModule, "useMandateInputSurface")
    .mockReturnValue({ status: "loading" });
  act(() => {
    root.render(
      <AutomationButton
        mandateKey={GOAL_WRITER}
        label="Refine with AI"
        runningLabel="Refining…"
        running={false}
        onRun={() => undefined}
      />,
    );
  });
  return container.textContent ?? "";
}

describe("Refine with AI — three facts, three sentences (F4)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ({ container, root } = mount());
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  it("does NOT claim the job is missing when the door refused a job that exists", () => {
    // The exact production state: the resolution failed, and the door said why.
    const text = render(container, root, {
      mandate: null,
      loading: false,
      error: DOOR_SAID,
      absent: false,
      organizationPending: false,
    });

    // 🚨 THE LIE, ASSERTED ABSENT.
    expect(text).not.toContain("no live job has that name");
    expect(text).not.toContain(missingAutomationMandateLine(GOAL_WRITER));
    // The door's own words reach the screen instead.
    expect(text).toContain(DOOR_SAID);
    expect(text).toContain(unavailableAutomationMandateLine(GOAL_WRITER, DOOR_SAID));
  });

  it("still says 'no live job has that name' when the door really said 404", () => {
    const text = render(container, root, {
      mandate: null,
      loading: false,
      error: null,
      absent: true,
      organizationPending: false,
    });
    // The true sentence must survive the fix — a guard that made BOTH states
    // generic would trade one lie for another.
    expect(text).toContain(missingAutomationMandateLine(GOAL_WRITER));
    expect(text).toContain("no live job has that name");
  });

  it("never leaves a blocked control silent", () => {
    const refused = render(container, root, {
      mandate: null,
      loading: false,
      error: "",
      absent: false,
      organizationPending: false,
    });
    // A server that refuses with NO message is itself a defect, and the screen
    // says so rather than going quiet or blaming the reader.
    expect(refused).toContain("sent no reason");
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
  });
});
