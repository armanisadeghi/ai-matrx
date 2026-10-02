// The sidebar header stays compact: broad lane choices live inside the source
// filter popover rather than consuming or overflowing the narrow rail.

import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "ConversationHistorySidebar.tsx"),
  "utf8",
);

function compactHeaderBlock(): string {
  const start = SOURCE.indexOf("Lane and source choices live together");
  expect(start).toBeGreaterThan(-1);
  const end = SOURCE.indexOf("{!hideSearchAffordance &&", start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

describe("compact conversation-history header", () => {
  it("keeps lane toggles out of the visible sidebar header", () => {
    const block = compactHeaderBlock();
    expect(block).not.toContain("<ConversationLaneToggles");
    expect(block).toContain("<ConversationSourceFilterTree");
    expect(block).toMatch(/RefreshCwTapButton/);
  });

  it("uses one fixed-height row that cannot wrap", () => {
    const block = compactHeaderBlock();
    expect(block).toContain('className="flex h-8 shrink-0 items-center');
    expect(block).not.toContain("flex-wrap");
    expect(block).toContain("{historyLabel}");
  });
});
