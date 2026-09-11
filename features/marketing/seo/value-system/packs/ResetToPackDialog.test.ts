import type { StarterPackStatusItem } from "../types";
import { itemDelta } from "./ResetToPackDialog";

describe("ResetToPackDialog item deltas", () => {
  it("renders current and proposed meaning worth with matcher counts", () => {
    const item: StarterPackStatusItem = {
      kind: "meaning",
      ref: "meaning-1",
      label: "Business",
      site_row_id: "worth-1",
      state: "changed",
      sort: 1,
      pack: {
        worth_effect: "add",
        worth_amount: 80,
        matchers: [{ pattern: "enterprise" }, { pattern: "business" }],
      },
      site: {
        worth_effect: "add",
        worth_amount: 40,
        matchers: 1,
        patterns: ["enterprise"],
      },
    };

    expect(itemDelta(item)).toEqual({
      pack: "+80 points · 2 phrases",
      site: "+40 points · 1 phrase",
    });
  });

  it("keeps archived meaning explicit", () => {
    const item: StarterPackStatusItem = {
      kind: "meaning",
      ref: "meaning-2",
      label: "Consumer plastics",
      site_row_id: "worth-2",
      state: "archived",
      sort: 2,
      pack: {
        worth_effect: "scale",
        worth_amount: 0.2,
        matchers: [],
      },
      site: null,
    };

    expect(itemDelta(item)).toEqual({
      pack: "×0.2 — worth one fifth · 0 phrases",
      site: "archived",
    });
  });
});
