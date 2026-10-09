/**
 * GUARD: unsent chips have ONE saver — the chat package's own — and the app hands it its store.
 * <ChatProvider> registers that saver on every host (private store or the app's), so the app keeps
 * no copy of it; the app's registration only joins the send's flush for the interactive blocks'
 * queued answers. Unregistered, every chip is browser-only and vanishes on reload — with no error,
 * so an unwired call announces itself.
 */
import fs from "node:fs";
import path from "node:path";
import { restoreComposerRemarks } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("the unsent-chip saver", () => {
  it("the app keeps no second copy of it", () => {
    expect(fs.existsSync(path.join(process.cwd(), "features/block-state/remarkDurability.ts"))).toBe(false);
    expect(read("providers/ChatSurfaceRegistrations.tsx")).not.toMatch(/registerRemarkDurability|createRemarkDurability/);
  });

  it("the app hands ChatProvider its store, and the Providers tree mounts the registrations", () => {
    expect(read("providers/ChatHostAdapter.tsx")).toMatch(/<ChatProvider host=\{host\} store=\{store\}>/);
    expect(read("app/Providers.tsx")).toMatch(/<ChatSurfaceRegistrations\s*\/>/);
  });

  it("an unwired restore announces itself instead of silently doing nothing", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      restoreComposerRemarks("conversation-without-a-port");
      expect(error.mock.calls.flat().join(" ")).toContain("no durability port registered");
    } finally {
      error.mockRestore();
    }
  });
});
