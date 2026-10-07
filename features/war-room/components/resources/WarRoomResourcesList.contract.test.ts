import { readFileSync } from "node:fs";
import { join } from "node:path";
import { featureRegExp } from "@/scripts/lib/source-roots.cjs";

const resourcesSource = readFileSync(
  join(__dirname, "WarRoomResourcesList.tsx"),
  "utf8",
);
const conversationPickerSource = readFileSync(
  join(
    process.cwd(),
    "../aidream/apps/shared/chat/src/agents/components/conversation-history/ConversationPickerWindow.tsx",
  ),
  "utf8",
);
// The dynamic() front door lives in the package's Next binding (P10).
const windowPanelLazySource = readFileSync(
  join(process.cwd(), "../aidream/apps/shared/chat/src/next/lazy/WindowPanel.tsx"),
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
      featureRegExp(/import\s+\{\s*WindowPanel\s*\}\s+from\s+["']@\/features\/window-panels\/WindowPanel["']/),
    );
    expect(conversationPickerSource).toContain(
      'import { WindowPanel } from "../../../next/lazy/WindowPanel"',
    );
    expect(windowPanelLazySource).toContain(
      'import("@host/features/window-panels/WindowPanel")',
    );
    expect(windowPanelLazySource).toContain("ssr: false");
  });
});
