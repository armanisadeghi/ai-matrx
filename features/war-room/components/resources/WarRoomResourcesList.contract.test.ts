import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { featureRegExp } from "@/scripts/lib/source-roots.cjs";

const resourcesSource = readFileSync(
  join(__dirname, "WarRoomResourcesList.tsx"),
  "utf8",
);
// The picker lives in the sibling chat-package source. When that checkout is absent (a bare
// matrx-frontend clone) the picker assertion cannot be measured; it says so and does not pass.
const PICKER_PATH = join(
  process.cwd(),
  "../aidream/apps/shared/chat/src/agents/components/conversation-history/ConversationPickerWindow.tsx",
);
const pickerPresent = existsSync(PICKER_PATH);
if (!pickerPresent) {
  console.warn(`SKIPPED (sibling absent): ${PICKER_PATH} is missing — the picker's lazy-WindowPanel boundary is unmeasured here.`);
}
const conversationPickerSource = pickerPresent ? readFileSync(PICKER_PATH, "utf8") : "";
// The lazy boundary is the HOST's registration of the window manager (providers/chatUiRegistrationBase.ts).
const hostRegistrationSource = readFileSync(join(process.cwd(), "providers/chatUiRegistrationBase.ts"), "utf8");

describe("war-room resource attach boundaries", () => {
  it("passes only reference-pickable listable tokens to universal search", () => {
    expect(resourcesSource).toContain(
      "const attachableTokens = tokenFilter ?? listableTokens();",
    );
    expect(resourcesSource).not.toContain(
      "const attachableTokens = tokenFilter ?? curatedTokens();",
    );
  });

  (pickerPresent ? it : it.skip)("keeps the conversation picker WindowPanel behind a dynamic boundary", () => {
    // The picker draws whatever window the host registered; it never imports the heavy shell itself.
    expect(conversationPickerSource).not.toMatch(
      featureRegExp(/import\s+\{\s*WindowPanel\s*\}\s+from\s+["']@\/features\/window-panels\/WindowPanel["']/),
    );
    expect(conversationPickerSource).toContain('import { WindowPanel } from "../../../host/ui-slots"');
    // ...and the host registers it behind a client-only dynamic import.
    expect(hostRegistrationSource).toMatch(
      /const WindowPanel = dynamic\(\s*\(\) =>\s*import\("@\/features\/window-panels\/WindowPanel"\)[\s\S]*?\{ ssr: false \}/,
    );
  });
});
