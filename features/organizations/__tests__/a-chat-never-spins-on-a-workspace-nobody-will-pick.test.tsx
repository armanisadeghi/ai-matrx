/**
 * 🚨 A CHAT NEVER SPINS ON A WORKSPACE NOBODY WILL PICK (2026-09-26).
 *
 * MEASURED: a War Room thread's Chat view, opened with no workspace chosen,
 * showed a spinner forever. The thread's assistant resolves its agent through
 * a Mandate, a Mandate resolves through the ACTIVE workspace, and the
 * no-default-organization rule means nobody picks one for the person — so the
 * spinner was waiting on something that would never happen.
 *
 * WHAT THIS PINS:
 *   1. `WorkspaceGate` shows the host's own waiting UI while the wait is real
 *      (`ready`, `resolving`) and ONLY then;
 *   2. once boot settled with no workspace, the same area says the host's one
 *      sentence and offers the canonical workspace picker behind one button
 *      (opened on demand, never drawn inline) — never the spinner;
 *   3. the census: every mandate-driven chat host that waited on the
 *      workspace with a spinner now waits through the gate.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let STATE: "ready" | "resolving" | "required" | "unavailable" | "signed_out" = "required";
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({
    organizationId: STATE === "ready" ? "org-1" : null,
    canLoad: STATE === "ready",
    organizationRequired: STATE === "required",
    resolving: STATE === "resolving",
    organizationState: STATE,
    unavailableReason: null,
    retry: () => undefined,
  }),
  ORGANIZATION_UNAVAILABLE_TITLE: "We could not check your organization",
  ORGANIZATION_UNAVAILABLE_DESCRIPTION: "Try again.",
}));
jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => <div data-testid="workspace-picker">picker</div>,
}));

import { WorkspaceGate } from "@/features/organizations/components/WorkspaceGate";

function render(ui: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(ui);
  });
  return host;
}

const SPINNER = <div data-testid="host-spinner">spinning</div>;
const SENTENCE = "This thread needs a workspace to open.";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("WorkspaceGate", () => {
  it.each(["ready", "resolving"] as const)("keeps the host's waiting UI while the wait is real (%s)", (state) => {
    STATE = state;
    const host = render(<WorkspaceGate blocked sentence={SENTENCE}>{SPINNER}</WorkspaceGate>);
    expect(host.querySelector('[data-testid="host-spinner"]')).not.toBeNull();
    expect(host.textContent).not.toContain(SENTENCE);
  });

  it("with no workspace chosen, says the host's sentence and offers the picker — never the spinner", () => {
    STATE = "required";
    const host = render(<WorkspaceGate blocked sentence={SENTENCE}>{SPINNER}</WorkspaceGate>);
    expect(host.querySelector('[data-testid="host-spinner"]')).toBeNull();
    expect(host.textContent).toContain(SENTENCE);
    // 🚨 ONE LINE AND A BUTTON (page-pass shared defects, 2026-09-27): the
    // list is not drawn inline — on an account with a hundred memberships it
    // was a ~600px block that pushed the page below the fold.
    expect(host.querySelector('[data-testid="workspace-picker"]')).toBeNull();
    const button = host.querySelector<HTMLButtonElement>('[data-testid="organization-picker-button"]');
    expect(button?.textContent).toContain("Choose organization");
    // One sentence: the default "Nothing was loaded because…" paragraph is not appended.
    expect(host.textContent).not.toContain("Nothing was loaded");
  });

  it("the button opens the canonical picker on demand", () => {
    STATE = "required";
    const host = render(<WorkspaceGate blocked sentence={SENTENCE}>{SPINNER}</WorkspaceGate>);
    const button = host.querySelector<HTMLButtonElement>('[data-testid="organization-picker-button"]');
    act(() => {
      button!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      button!.click();
    });
    expect(document.querySelector('[data-testid="workspace-picker"]')).not.toBeNull();
  });

  it("loading is not a missing workspace: an ordinary wait keeps its spinner even while none is chosen", () => {
    // Verifier round 1, F-B1: a War Room thread flashed "needs a workspace"
    // during an ordinary load and then opened without one.
    STATE = "required";
    const host = render(<WorkspaceGate blocked={false} sentence={SENTENCE}>{SPINNER}</WorkspaceGate>);
    expect(host.querySelector('[data-testid="host-spinner"]')).not.toBeNull();
    expect(host.textContent).not.toContain(SENTENCE);
  });

  it("a failed organization read is never answered with the spinner either", () => {
    STATE = "unavailable";
    const host = render(<WorkspaceGate blocked sentence={SENTENCE}>{SPINNER}</WorkspaceGate>);
    expect(host.querySelector('[data-testid="host-spinner"]')).toBeNull();
  });
});

describe("the census — mandate-driven chat hosts wait through the gate", () => {
  const ROOT = join(__dirname, "..", "..", "..");
  const HOSTS = [
    "features/transcript-studio/components/scribe/ExperimentalAgentScreen.tsx",
    "features/transcript-studio/components/scribe/AssistantScreen.tsx",
    "features/war-room/components/room/RoomAgentPanel.tsx",
    "features/masterwork/conduct/ConductorPanel.tsx",
    "features/masterwork/drive/DriveInterviewPage.tsx",
    "features/education/tutor/components/EducationTutorClient.tsx",
    "features/quick-actions/components/QuickChatSheet.tsx",
    "features/agents/components/chat/ChatNewClient.tsx",
    "features/agents/components/chat/ChatConversationRoom.tsx",
  ];
  it.each(HOSTS)("%s renders its workspace wait through WorkspaceGate", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    expect(src).toMatch(/<WorkspaceGate\b/);
  });
  it("every host passes a real block signal — never a bare gate that fires on any wait", () => {
    for (const rel of [...HOSTS, "features/war-room/components/room/RoomAgentPanel.tsx"]) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src).toMatch(/<WorkspaceGate\s+blocked/);
    }
    // The two screens whose wait has many causes read the hook's own verdict.
    for (const rel of [
      "features/transcript-studio/components/scribe/ExperimentalAgentScreen.tsx",
      "features/transcript-studio/components/scribe/AssistantScreen.tsx",
    ]) {
      expect(readFileSync(join(ROOT, rel), "utf8")).toContain("blocked={assistant.blockedOnWorkspace}");
    }
    expect(readFileSync(join(ROOT, "features/war-room/components/room/RoomAgentPanel.tsx"), "utf8")).toContain(
      "blocked={blockedOnWorkspace}",
    );
  });

  it("the War Room thread chat names itself", () => {
    const src = readFileSync(join(ROOT, "features/war-room/components/thread/ThreadAgentPanel.tsx"), "utf8");
    expect(src).toContain('workspaceSentence="This thread needs a workspace to open."');
  });
});
