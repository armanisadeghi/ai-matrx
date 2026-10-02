import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "ConversationSourceFilterTree.tsx"),
  "utf8",
);
const TOGGLES = fs.readFileSync(
  path.join(__dirname, "..", "ConversationLaneToggles.tsx"),
  "utf8",
);

describe("conversation filter popover", () => {
  it("owns the lane choices above the source filters", () => {
    const lanes = SOURCE.indexOf("<ConversationLaneToggles />");
    const sources = SOURCE.indexOf("Quick filters");
    expect(lanes).toBeGreaterThan(-1);
    expect(sources).toBeGreaterThan(lanes);
  });

  it("renders the five lanes as one compact rectangular grid", () => {
    expect(TOGGLES).toContain("grid-cols-5");
    expect(TOGGLES).toContain("rounded-none");
    expect(TOGGLES).toContain("last:border-r-0");
  });

  it("signals non-default lane choices and resets them with the other filters", () => {
    expect(SOURCE).toContain("appliedFilterCount");
    expect(SOURCE).toContain("setLanes(DEFAULT_CONVERSATION_LANES)");
  });
});
