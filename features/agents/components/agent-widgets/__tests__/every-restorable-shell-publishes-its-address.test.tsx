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
import { DISPLAY_MODE_TO_OVERLAY_ID } from "@/features/agents/redux/execution-system/display-mode-overlay";
import { resolveAgentPanelDisplayMode } from "@/features/window-panels/url-sync/initUrlHydration";

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
const useUrlSync = jest.fn();
jest.mock("@/features/window-panels/url-sync/useUrlSync", () => ({
  useUrlSync: (...a: unknown[]) => useUrlSync(...a),
}));

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
    useAgentShellAddress("c-1", "sidebar");
    expect(useUrlSync).toHaveBeenCalledWith("agent", "c-1", { m: "sidebar" });
  });
});
