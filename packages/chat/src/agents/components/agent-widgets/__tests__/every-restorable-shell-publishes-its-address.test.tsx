/**
 * GUARD — a conversation shell the address bar can restore must also WRITE its
 * address (verifier round 2: "the drawer disappears after reloads").
 *
 * The `agent` hydrator restores sidebar / panel / modal-compact / modal-full,
 * but only the WindowPanel shells published `?panels=agent:…`, so the side
 * drawer lived in Redux alone and every full reload dropped it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DISPLAY_MODE_TO_OVERLAY_ID } from "../../../redux/execution-system/display-mode-overlay";
import { resolveAgentPanelDisplayMode } from "../../../../window-panels/windows/agents/agentPanelSurfaceAddress";
import { registerChatUi } from "../../../../host/ui-slots";

jest.mock("../../../../store/hooks", () => ({ useAppSelector: () => null }));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../../store/hooks"));
const useUrlSync = jest.fn();
registerChatUi({ useUrlSync: (...a: unknown[]) => useUrlSync(...a) });

const WIDGETS = join(__dirname, "..");
/** The token mode each shell must publish (floating-chat speaks `fc`). */
const URL_MODE: Record<string, string> = { "floating-chat": "fc" };

describe("every restorable agent shell publishes its address", () => {
  const restorable = Object.keys(DISPLAY_MODE_TO_OVERLAY_ID).filter(
    (mode) => mode !== "floating-chat" ? resolveAgentPanelDisplayMode(mode) === mode : true,
  );

  it("covers the drawer", () => {
    expect(restorable).toEqual(expect.arrayContaining(["sidebar", "panel", "modal-compact", "modal-full"]));
  });

  it.each(restorable)("%s shell writes agent:<conversation>:m-<mode>", (mode) => {
    const overlayId = DISPLAY_MODE_TO_OVERLAY_ID[mode as keyof typeof DISPLAY_MODE_TO_OVERLAY_ID]!;
    const file = join(WIDGETS, `${overlayId[0].toUpperCase()}${overlayId.slice(1)}.tsx`);
    const src = readFileSync(file, "utf8");
    const token = URL_MODE[mode] ?? mode;
    const publishes =
      src.includes(`useAgentShellAddress(conversationId, "${mode}")`) ||
      (src.includes(`urlSyncKey="agent"`) && src.includes(`agentPanelUrlArgs("${token}"`));
    expect({ overlayId, publishes }).toEqual({ overlayId, publishes: true });
  });

  it("the hook registers the agent token keyed by the conversation", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAgentShellAddress } = require("../useAgentShellAddress");
    // useAgentShellAddress is a host-slot hook (ui-slots.tsx latches it in a useRef since
    // 0862a9fc03), so it must run inside a component, not bare.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createElement } = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { renderToString } = require("react-dom/server");
    const Probe = () => {
      useAgentShellAddress("c-1", "sidebar");
      return null;
    };
    renderToString(createElement(Probe));
    expect(useUrlSync).toHaveBeenCalledWith("agent", "c-1", { m: "sidebar" });
  });
});
