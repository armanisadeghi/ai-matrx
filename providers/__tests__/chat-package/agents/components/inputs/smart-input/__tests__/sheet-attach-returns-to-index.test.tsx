/**
 * PB-08 (2026-10-01): picking a note in the phone sheet's Attach tab closed
 * the whole "Chat options" sheet. It must return to the tab list instead;
 * leaving actions (knowledge bar, Connections, Cloud browser) still close it.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TabbedBottomSheet } from "@ai-matrx/design-system";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chatSourceDir, CHAT_SRC_REL } from "../../../../../chat-source";
const CHAT_DIR = chatSourceDir("agents/components/inputs/smart-input/__tests__");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("phone sheet: Attach returns to Chat options", () => {
  it("the picker ends picks with onPicked and keeps onClose for leaving", () => {
    const picker = readFileSync(
      join(process.cwd(), "features/resource-manager/resource-picker/ResourcePickerMenu.tsx"),
      "utf8",
    );
    expect(picker).toContain("const finishPick = onPicked ?? onClose;");
    // Picks: row-click resources, Google files, single-mode uploads, chat references.
    expect(picker).toMatch(/const selectResource = async[\s\S]{0,300}finishPick\(\);/);
    expect(picker).toMatch(/toast\.success\(`\$\{file\.name\} attached\.`\);\s*finishPick\(\);/);
    expect(picker).toMatch(/selectionMode === "single"\) finishPick\(\);/);
    expect(picker).toMatch(/appendConversationReference\([\s\S]{0,200}\);\s*finishPick\(\);/);
    // Leaving: knowledge bar opens after the sheet closes.
    expect(picker).toMatch(/onClose\(\);\s*openAttachSearch\(/);
  });

  it("the sheet hands showIndex to the Attach picker as onPicked, never onClose", () => {
    const menu = readFileSync(join(CHAT_DIR, "../RunControlsMenu.tsx"), "utf8");
    expect(menu).toMatch(/content: \(\{ showIndex \}[^)]*\) =>[\s\S]{0,400}onPicked=\{showIndex\}/);
    expect(menu).not.toMatch(/onClose=\{showIndex\}/);
    const panel = readFileSync(join(CHAT_DIR, "../RunControlsTabPanel.tsx"), "utf8");
    expect(panel).toMatch(/<ResourcePickerMenu[\s\S]{0,400}onPicked=\{onPicked\}/);
  });

  it("showIndex from a tab's render function returns to the index, sheet open", async () => {
    const onOpenChange = jest.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const byText = (t: string) =>
      Array.from(document.body.querySelectorAll<HTMLElement>("*")).find(
        (el) => el.children.length === 0 && el.textContent === t,
      );
    await act(async () => {
      root.render(
        <TabbedBottomSheet
          open
          onOpenChange={onOpenChange}
          title="Chat options"
          tabs={[
            {
              id: "attach",
              label: "Attach",
              content: ({ showIndex }) => (
                <button type="button" onClick={showIndex}>
                  pick note
                </button>
              ),
            },
            { id: "tools", label: "Tools", content: <div>tools body</div> },
          ]}
        />,
      );
    });
    await act(async () => byText("Attach")!.click());
    expect(byText("pick note")).toBeTruthy();
    await act(async () => byText("pick note")!.click());
    expect(byText("Tools")).toBeTruthy();
    expect(byText("pick note")).toBeUndefined();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await act(async () => root.unmount());
  });
});
