import { readFileSync } from "node:fs";
import { join } from "node:path";

import { openAfterCurrentLayerCloses } from "@/components/dialogs/confirm/after-current-layer-closes";

describe("ConversationContextRail modal layer handoff", () => {
  it("closes the overflow menu before opening its selected detail surface", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/agents/components/inputs/smart-input/ConversationContextRail.tsx",
      ),
      "utf8",
    );
    const overflowHandler = source.slice(
      source.indexOf("{overflow.map"),
      source.indexOf("</DropdownMenuContent>", source.indexOf("{overflow.map")),
    );

    expect(overflowHandler).toContain(
      "void openAfterCurrentLayerCloses(item.onOpen)",
    );
    expect(overflowHandler).not.toContain("e.preventDefault()\n");
    expect(overflowHandler).not.toContain("item.onOpen();");
  });

  it("does not run the next-layer intent until the close boundary resolves", async () => {
    const frames: FrameRequestCallback[] = [];
    let locked = true;
    const events: string[] = [];
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };

    try {
      document.body.style.pointerEvents = "none";
      const handoff = openAfterCurrentLayerCloses(() => events.push("opened"));

      frames.shift()?.(0);
      expect(events).toEqual([]);

      locked = false;
      document.body.style.removeProperty("pointer-events");
      frames.shift()?.(1);
      expect(events).toEqual([]);
      frames.shift()?.(2);
      await handoff;

      expect(locked).toBe(false);
      expect(events).toEqual(["opened"]);
    } finally {
      document.body.style.removeProperty("pointer-events");
      globalThis.requestAnimationFrame = originalRaf;
    }
  });
});
