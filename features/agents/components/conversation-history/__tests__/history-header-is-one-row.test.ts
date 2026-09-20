// The compact conversation-history header shares ONE row while the names fit.
//
// The lane toggles ARE the filter statement, so they belong beside the refresh
// and source-tree controls, not on a row of their own under a "FILTERED CHATS"
// label that repeats what the sidebar already is. On a ~260px chat rail the
// second row cost ~28px of list height, and that rail is already squeezed by
// the admin menu below it.
//
// Measured live on the /chat rail (195px): sharing the row squeezed the five
// names to 109px and clipped every one of them, so the row now WRAPS — the
// toggles carry a min width that holds all five labels and drop to their own
// line below it. Verified in the browser at 195/240/280/360/420px: nothing
// clips at any width, and 280px and up share one row.
//
// Source-level guard, matching this repo's idiom (no @testing-library/react):
// the header is JSX structure, so the proof is that the toggles and the
// controls live inside the SAME container element, that it can wrap, that the
// toggles keep their min width, and that the standalone toggles row is gone.
//
// Proven RED against the pre-change file (the version with
// `<div className="shrink-0 px-2 pb-1"><ConversationLaneToggles /></div>`
// under the label row): both assertions below failed.

import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "ConversationHistorySidebar.tsx"),
  "utf8",
);

/** The compact header block, from its container to the end of that element. */
function compactHeaderBlock(): string {
  const start = SOURCE.indexOf("@container/histhead");
  expect(start).toBeGreaterThan(-1);
  const end = SOURCE.indexOf("{!hideSearchAffordance &&", start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

describe("compact conversation-history header", () => {
  it("keeps the lane toggles in the same row as the refresh and source-tree controls", () => {
    const block = compactHeaderBlock();
    // It may wrap, but a narrow rail must never clip the five names.
    expect(block).toContain("flex-wrap");
    expect(block).toContain("<ConversationLaneToggles");
    expect(block).toContain("<ConversationSourceFilterTree");
    expect(block).toMatch(/RefreshCwTapButton/);
  });

  it("does not put the toggles on a second row under the label", () => {
    const block = compactHeaderBlock();
    // Any toggles element inside this block must be the inline one that shares
    // the row (it carries the flex sizing), never a wrapper div of its own.
    const togglesRow = /<div className="shrink-0 px-2 pb-1">\s*<ConversationLaneToggles \/>/;
    expect(togglesRow.test(block)).toBe(false);
    expect(block).toContain('<ConversationLaneToggles className="min-w-[168px] flex-1" />');
  });

  it("lets the label yield to the toggles on a narrow rail", () => {
    const block = compactHeaderBlock();
    // The label is answerable to THIS rail's width, not the viewport, so a
    // wide host (the agent-run window's "Agent history") still shows it.
    expect(block).toMatch(/hidden[^"]*@min-\[\d+px\]\/histhead:block/);
    expect(block).toContain("{historyLabel}");
  });
});
