/**
 * "Chart this" — any table an AI answer shows becomes a chart through the ONE
 * chart primitive (chart-spec + ChartCanvas). These tests pin the contract the
 * button relies on: when a table is chartable, which chart is auto-picked, and
 * that the spec it builds is the same ChartSpec the ```chart block draws.
 */

import {
  chartableTypes,
  parseCellNumber,
  parseDelimitedTable,
  tableToChartSpec,
} from "@/components/mardown-display/blocks/chart/table-chart";

describe("parseCellNumber", () => {
  it("reads the number formats answers actually print", () => {
    expect(parseCellNumber("1,234.50")).toBe(1234.5);
    expect(parseCellNumber("$1,200")).toBe(1200);
    expect(parseCellNumber("45%")).toBe(45);
    expect(parseCellNumber("(12)")).toBe(-12);
    expect(parseCellNumber("-3.5")).toBe(-3.5);
    expect(parseCellNumber("2.4k")).toBe(2400);
    expect(parseCellNumber("1.5M")).toBe(1_500_000);
    expect(parseCellNumber("**42**")).toBe(42);
  });

  it("refuses text and blanks instead of inventing a zero", () => {
    expect(parseCellNumber("")).toBeNull();
    expect(parseCellNumber("—")).toBeNull();
    expect(parseCellNumber("N/A")).toBeNull();
    expect(parseCellNumber("Paris")).toBeNull();
  });
});

describe("tableToChartSpec", () => {
  it("is absent (null) for a table with no numbers — the button never shows dead", () => {
    expect(
      tableToChartSpec({
        headers: ["Name", "City"],
        rows: [
          ["Ada", "London"],
          ["Grace", "New York"],
        ],
      }),
    ).toBeNull();
  });

  it("auto-picks a line chart when the category column is time", () => {
    const spec = tableToChartSpec({
      headers: ["Year", "Revenue", "Profit"],
      rows: [
        ["2021", "$1,200", "$200"],
        ["2022", "$1,800", "$350"],
        ["2023", "$2,400", "$500"],
      ],
    });
    expect(spec?.type).toBe("line");
    expect(spec?.xKey).toBe("Year");
    expect(spec?.series.map((s) => s.key)).toEqual(["Revenue", "Profit"]);
    expect(spec?.data[2]).toMatchObject({ Year: "2023", Revenue: 2400, Profit: 500 });
  });

  it("auto-picks a pie for a small single-series share breakdown", () => {
    const spec = tableToChartSpec({
      headers: ["Channel", "Share"],
      rows: [
        ["Search", "45%"],
        ["Social", "30%"],
        ["Email", "25%"],
      ],
    });
    expect(spec?.type).toBe("pie");
    expect(spec?.pie).toEqual({ labelKey: "Channel", valueKey: "Share" });
  });

  it("auto-picks a bar for categories compared across numbers", () => {
    const spec = tableToChartSpec({
      headers: ["Model", "Latency (ms)", "Cost"],
      rows: [
        ["Alpha", "120", "3"],
        ["Beta", "95", "5"],
        ["Gamma", "210", "1"],
      ],
    });
    expect(spec?.type).toBe("bar");
    expect(spec?.series.map((s) => s.key)).toEqual(["Latency (ms)", "Cost"]);
  });

  it("auto-picks a scatter when every column is numeric", () => {
    const spec = tableToChartSpec({
      headers: ["Height", "Weight"],
      rows: [
        ["170", "65"],
        ["180", "80"],
        ["165", "58"],
      ],
    });
    expect(spec?.type).toBe("scatter");
    expect(spec?.xKey).toBe("Height");
    expect(spec?.series.map((s) => s.key)).toEqual(["Weight"]);
  });

  it("honors a switched type and never offers a type the data cannot draw", () => {
    const table = {
      headers: ["Model", "Latency", "Cost"],
      rows: [
        ["Alpha", "120", "3"],
        ["Beta", "95", "5"],
      ],
    };
    expect(chartableTypes(table)).toEqual(["bar", "line", "area", "pie", "scatter"]);
    expect(tableToChartSpec(table, "area")?.type).toBe("area");
    const pie = tableToChartSpec(table, "pie");
    expect(pie?.type).toBe("pie");
    expect(pie?.pie).toEqual({ labelKey: "Model", valueKey: "Latency" });

    const oneSeries = { headers: ["Model", "Latency"], rows: [["A", "1"], ["B", "2"]] };
    expect(chartableTypes(oneSeries)).not.toContain("scatter");
    expect(tableToChartSpec(oneSeries, "scatter")?.type).toBe("bar");
  });
});

describe("parseDelimitedTable", () => {
  it("parses CSV with quoted commas and TSV", () => {
    expect(parseDelimitedTable('city,pop\n"Austin, TX",961855\nDallas,1304379\n')).toEqual({
      headers: ["city", "pop"],
      rows: [
        ["Austin, TX", "961855"],
        ["Dallas", "1304379"],
      ],
    });
    expect(parseDelimitedTable("a\tb\n1\t2")).toEqual({ headers: ["a", "b"], rows: [["1", "2"]] });
  });

  it("returns null for text that is not a table", () => {
    expect(parseDelimitedTable("just one line")).toBeNull();
    expect(parseDelimitedTable("")).toBeNull();
  });
});
