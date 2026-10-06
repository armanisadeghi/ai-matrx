/** Interface text: the "+ Agent" panel's no-organization line fits the 60-character slot. */
import { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/features/agents/agent-creators/interactive-builder/AgentGenerator", () => ({ AgentGenerator: () => null }));
jest.mock("@/features/overlays/openers/agentAdvancedEditorWindow", () => ({ useOpenAgentContentWindow: () => jest.fn() }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("./../ScopeHolderBar", () => ({}));

import { HolderDraftPanel } from "../HolderDraftPanel";

it("says what to do in under 60 characters", () => {
  const host = document.createElement("div");
  act(() => {
    createRoot(host).render(
      <HolderDraftPanel data={{} as never} offeredValues={[]} holder={{} as never} owner={null} onCreated={() => undefined} />,
    );
  });
  const text = host.querySelector('[data-testid="holder-draft-no-owner"]')!.textContent!.trim();
  expect(text.length).toBeLessThanOrEqual(60);
  expect(text).toMatch(/organization/i);
});
