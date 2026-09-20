import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.join(__dirname, "ConversationBattlePage.tsx"),
  "utf8",
);

describe("conversation battle layout", () => {
  it("keeps the source label and value in one compact row", () => {
    expect(SOURCE).toContain(
      'className="shrink-0 flex h-10 items-center gap-2 border-b',
    );
    expect(SOURCE).toContain(">\n            Source\n          </span>");
    expect(SOURCE).not.toContain(">\n              Source conversation\n");
  });

  it("does not render instructional paragraphs around the empty battle", () => {
    expect(SOURCE).not.toContain("The source stays untouched.");
    expect(SOURCE).not.toContain("Every column is a durable fork");
    expect(SOURCE).not.toContain("<p className=");
  });

  it("uses a short picker title", () => {
    expect(SOURCE).toContain('title="Choose conversation"');
    expect(SOURCE).not.toContain("Choose the conversation to fork");
  });
});
