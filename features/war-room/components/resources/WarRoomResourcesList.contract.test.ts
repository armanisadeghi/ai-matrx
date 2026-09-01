import { readFileSync } from "node:fs";
import { join } from "node:path";

const resourcesSource = readFileSync(
  join(__dirname, "WarRoomResourcesList.tsx"),
  "utf8",
);
const conversationPickerSource = readFileSync(
  join(
    process.cwd(),
    "features/agents/components/conversation-history/ConversationPickerWindow.tsx",
  ),
  "utf8",
);

describe("war-room resource attach boundaries", () => {
  it("passes only reference-pickable listable tokens to universal search", () => {
    expect(resourcesSource).toContain(
      "const attachableTokens = tokenFilter ?? listableTokens();",
    );
    expect(resourcesSource).not.toContain(
      "const attachableTokens = tokenFilter ?? curatedTokens();",
    );
  });

  it("keeps the conversation picker WindowPanel behind a dynamic boundary", () => {
    expect(conversationPickerSource).not.toMatch(
      /import\s+\{\s*WindowPanel\s*\}\s+from\s+["']@\/features\/window-panels\/WindowPanel["']/,
    );
    expect(conversationPickerSource).toContain(
      'import("@/features/window-panels/WindowPanel")',
    );
    expect(conversationPickerSource).toContain("ssr: false");
  });
});
