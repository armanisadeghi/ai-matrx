/**
 * LIVE AUDIO IS THE VOICE LAYER (Arman, 2026-10-07: one voice control per
 * surface). The composer's "Live audio" only announced "coming soon", while
 * Masterwork added the REAL voice layer (VoiceRelayBar, "Voice") beside it —
 * two voice buttons, one of them fake. Now Live audio IS the relay: idle it is
 * one icon that resolves nothing; pressed, the voice layer turns on.
 *
 * RED before: VoiceRelayBar had no `composer` variant and always resolved the
 * Communicator on mount; InputActionButtons' Live audio called announceComingSoon.
 */
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const useMandate = jest.fn(() => ({ loading: true, error: null, mandate: null }));
jest.mock("../../../mandates/useMandate", () => ({ useMandate: () => useMandate() }));
jest.mock("../useVoiceRelaySession", () => ({
  VOICE_COMMUNICATOR_MANDATE_KEY: "voice.communicator",
  useVoiceRelaySession: () => ({ status: "idle", toggle: jest.fn(), micMuted: false, toggleMute: jest.fn(), brainBusy: false, error: null }),
}));
jest.mock("@ai-matrx/chat/host/ui-slots", () => ({ ErrorAlchemyMenu: () => null }));

import { VoiceRelayBar } from "../VoiceRelayBar";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useMandate.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const props = { primaryAgentId: "a1", conversationId: "c1", surfaceKey: "s1", sourceFeature: "chat" as const };

it("idle, the composer's Live audio is one icon that resolves nothing; pressing it turns voice on", () => {
  const onEnabledChange = jest.fn();
  act(() => root.render(<VoiceRelayBar {...props} variant="composer" enabled={false} onEnabledChange={onEnabledChange} />));
  const button = host.querySelector('button[aria-label="Live audio"]') as HTMLButtonElement;
  expect(button).not.toBeNull();
  expect(button.textContent?.trim()).toBe("");
  expect(useMandate).not.toHaveBeenCalled();
  act(() => button.click());
  expect(onEnabledChange).toHaveBeenCalledWith(true);
});

it("on, it connects the voice layer", () => {
  act(() => root.render(<VoiceRelayBar {...props} variant="composer" enabled />));
  expect(useMandate).toHaveBeenCalled();
  expect(host.textContent).toContain("Connecting the voice layer");
});

it("the composer no longer promises Live audio as 'coming soon', and Masterwork adds no second voice button", () => {
  const repo = join(__dirname, "../../../../../..");
  const buttons = readFileSync(join(repo, "packages/chat/src/agents/components/inputs/smart-input/InputActionButtons.tsx"), "utf8");
  expect(buttons).not.toContain("chat.live-audio");
  expect(buttons).toContain('variant="composer"');
  for (const f of ["features/masterwork/conduct/ConductorPanel.tsx", "features/masterwork/components/detail/ScoutInterviewPanel.tsx"]) {
    expect(readFileSync(join(repo, f), "utf8")).not.toContain("<VoiceRelayBar");
  }
});
