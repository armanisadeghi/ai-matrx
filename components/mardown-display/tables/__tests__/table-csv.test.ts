import { parseDelimited } from "@ai-matrx/alchemy/operate/read";

import { rowsToCsv } from "@ai-matrx/rich-content/display/blocks/json/json-tabular-utils";
import { tableToCsv } from "@/components/mardown-display/tables/table-csv";
import { toCSV } from "@/features/page-extraction/data-review/export";

const NASTY = 'He said "hi",\nthen left';
const WITH_CR = 'a\r\nb';

describe("one CSV writer: Alchemy's", () => {
  it("tableToCsv round-trips a cell with a quote, comma and LF", () => {
    const text = tableToCsv(["name", "note"], [["Ada", NASTY]]);
    const parsed = parseDelimited(text, { delimiter: "," }) as { data: string[][] };
    expect(parsed.data).toEqual([["name", "note"], ["Ada", NASTY]]);
  });
  it("writes a CR/CRLF cell inside quotes", () => {
    expect(tableToCsv(["n"], [[WITH_CR]])).toBe(`n\n"${WITH_CR}"`);
  });
  it("tableToCsv defuses formulas but leaves negative numbers alone", () => {
    const text = tableToCsv(["a", "b", "c", "d"], [["=SUM(1)", "-5", "-0.5", "-"]]);
    expect(text).toBe("a,b,c,d\n'=SUM(1),-5,-0.5,'-");
  });
  it("tableToCsv keeps lookalike numbers as text", () => {
    expect(tableToCsv(["a"], [["007"], ["0.10"]])).toBe("a\n007\n0.10");
  });
  it("rowsToCsv keeps real numbers and quotes nasty text", () => {
    const text = rowsToCsv([{ n: -5, t: NASTY, o: { x: 1 } }], ["n", "t", "o"]);
    const parsed = parseDelimited(text, { delimiter: "," }) as { data: string[][] };
    expect(parsed.data[1]).toEqual(["-5", NASTY, '{"x":1}']);
  });
  it("page-extraction toCSV round-trips the nasty cell", () => {
    const text = toCSV([{ key: "k", label: "K" }] as never, [{ k: NASTY }] as never);
    expect((parseDelimited(text, { delimiter: "," }) as { data: string[][] }).data).toEqual([["K"], [NASTY]]);
  });
});
