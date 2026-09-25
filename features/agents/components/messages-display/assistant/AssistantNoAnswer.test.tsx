/**
 * Walk 18, defect C — the other half.
 *
 * Verbatim, under a 170-word question the interviewer had just written to a
 * residential plumber:
 *
 *   ✓ This run finished without writing an answer.
 *   Nothing came back from the model, so there is nothing to read. Running it
 *   again usually settles it; if it keeps coming back empty, the agent's
 *   instructions or the model it uses are the thing to change.
 *
 * She writes no agent instructions and picks no model. The advice is real, and
 * belongs to the admins who can act on it; the Expert gets the fact, the
 * reassurance that nothing she wrote was lost, and the one control that does
 * what the sentence says.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  createSandboxTestStore,
  SandboxStoreProvider,
} from "@/test-utils/sandbox-store";
import { AssistantNoAnswer } from "./AssistantNoAnswer";

/** The engineer's to-do list, as the box wrote it. */
const AGENT_INSTRUCTION_ADVICE = "instructions or the model it uses";

describe("AssistantNoAnswer speaks to whoever is reading it", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
  });

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const renderAs = (
    adminLevel: "super_admin" | null,
    props: { onRetry?: () => void } = {},
    adminLaneOpen = false,
  ) => {
    const store = createSandboxTestStore({
      userId: "87a6e699-3622-4869-8843-d0867456c0dd",
      organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      adminLevel,
      adminLaneOpen,
    });
    act(() => {
      root.render(
        <SandboxStoreProvider store={store}>
          <AssistantNoAnswer {...props} />
        </SandboxStoreProvider>,
      );
    });
    return host.textContent ?? "";
  };

  it("never hands an Expert advice about agent instructions or models", () => {
    const text = renderAs(null);
    expect(text).not.toContain(AGENT_INSTRUCTION_ADVICE);
  });

  it("tells the Expert what happened, that nothing was lost, and what to do", () => {
    const text = renderAs(null, { onRetry: () => {} });
    expect(text).toContain("This run finished without writing an answer.");
    expect(text).toContain("Nothing came back this time");
    expect(text).toContain("Nothing you wrote was lost");
    expect(text).toContain("Running it again usually settles it");
    // The remedy has a control behind it — never a sentence with no door.
    expect(host.querySelector("button")?.textContent).toBe("Run it again");
  });

  it("keeps the engineering advice for the admins who can act on it — in the admin section", () => {
    const text = renderAs("super_admin", {}, true);
    expect(text).toContain(AGENT_INSTRUCTION_ADVICE);
  });

  it("shows an admin on a user page exactly what anyone else sees (the admin lane)", () => {
    const text = renderAs("super_admin");
    expect(text).not.toContain(AGENT_INSTRUCTION_ADVICE);
    expect(text).toContain("This run finished without writing an answer.");
  });
});
