import { buildViewAgentInput } from "./tableCopy";
import type { MatrxDataTableCopyConfig } from "./types";

interface Row {
  id: string;
}

describe("MatrxDataTable copy payloads", () => {
  it("keeps live list context when the current view is empty", () => {
    const config: MatrxDataTableCopyConfig<Row> = {
      label: "Assist",
      location: "/assists",
      rowKind: "assist",
      listKind: "assists",
      humanRow: (row) => row.id,
      listContext: () => ({ everything_count: 12, status_view: "open" }),
    };

    expect(buildViewAgentInput(config, [], [])).toMatchObject({
      data: [],
      context: { everything_count: 12, status_view: "open" },
      attributes: { visible_count: 0, total_count: 0 },
    });
  });
});
