import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "ConversationPickerWindow.tsx"),
  "utf8",
);

describe("conversation picker window layout", () => {
  it("leaves the draggable header compact and unobstructed", () => {
    expect(SOURCE).toContain('title = "Choose conversation"');
    expect(SOURCE).toContain("hidePopOutButton");
    expect(SOURCE).not.toContain("titleNode=");
    expect(SOURCE).not.toContain("MessagesSquare");
  });

  it("opens as a compact searchable picker", () => {
    expect(SOURCE).toContain("width={460}");
    expect(SOURCE).toContain("height={480}");
    expect(SOURCE).toContain('historyLabel="Conversations"');
    expect(SOURCE).toContain("initialSearchOpen");
  });
});
