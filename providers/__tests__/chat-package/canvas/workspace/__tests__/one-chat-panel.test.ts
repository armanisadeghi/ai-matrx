/**
 * ONE CHAT PANEL (owner, 2026-10-05: "one copy of everything"; the chat on ALL
 * pages). The shell's chat (ShellChatDock) is the only page-level chat panel:
 * the Board and Education hand it their context instead of drawing their own.
 * The chat column itself (CanvasChatColumn + its conversation hook) is mounted
 * by exactly two hosts — the shell chat and a board chat TILE (a chat placed
 * on the board as content) — plus the composer's own demo specimens. A new
 * host is a second chat panel: this fails.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CHAT_SRC_REL, gitGrepFiles } from "../../../chat-source";

const REPO = process.cwd();
const ALLOWED_HOSTS = new Set([
  `${CHAT_SRC_REL}/canvas/workspace/ShellChatDock.tsx`,
  "features/board/items/work-items.tsx",
  // The board's agent-form tile (board lane, 9f582f28af/3c6a290bc1): a tile that runs one agent and
  // shows its result inside the board item - content on the board, not a page-level chat panel.
  "features/board/items/AgentFormItemBody.tsx",
  // The composer's own demo pages: a composer specimen, not a page chat panel.
  "app/(dev)/demos/composer/ComposerPlayground.tsx",
  "app/(dev)/demos/composer/all/ComposerGallery.tsx",
  "app/(dev)/demos/composer/variables/ComposerVariables.tsx",
]);

function importersOf(moduleName: string): string[] {
  return gitGrepFiles(["-E", `from ["'][^"']*/${moduleName}["']`], ["*.ts", "*.tsx"]).filter(
    (file) => !file.includes("__tests__") && !/\.test\.tsx?$/.test(file),
  );
}

describe("one chat panel", () => {
  it.each(["CanvasChatColumn", "useCanvasWorkspaceConversation"])(
    "only the shell chat and board chat tiles mount %s",
    (moduleName) => {
      // Within the module itself and its siblings that only use its TYPES.
      const hosts = importersOf(moduleName).filter((file) => {
        if (ALLOWED_HOSTS.has(file)) return false;
        const source = readFileSync(path.join(REPO, file), "utf8");
        const line = source
          .split("\n")
          .find((l) => new RegExp(`/${moduleName}["']`).test(l));
        return !/^\s*import type\b/.test(line ?? "");
      });
      expect(hosts).toEqual([]);
    },
  );

  it("the canvas workspace draws no chat of its own", () => {
    const source = readFileSync(
      path.join(REPO, `${CHAT_SRC_REL}/canvas/workspace/ChatCanvasWorkspace.tsx`),
      "utf8",
    );
    expect(source).not.toMatch(/<CanvasChatColumn\b/);
    expect(source).not.toMatch(/useCanvasWorkspaceConversation\(/);
    expect(source).not.toMatch(/registerInPlaceChatHost\(/);
    expect(source).not.toMatch(/registerRemarkSink\(/);
    expect(source).not.toMatch(/MatrxFloatingFrame/);
    expect(source).toMatch(/useShellChatContext\(/);
  });
});
