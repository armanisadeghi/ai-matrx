import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { NO_RAW_ROW_WINDOW, socialRowOpen } from "../row-open";

const COMPONENTS = join(__dirname, "..", "components");

describe("a Socials row click never opens the raw-fields inspector", () => {
  it("turns the generic side panel and row window off and routes the click to the surface", () => {
    const opened: string[] = [];
    const props = socialRowOpen<string>((r) => opened.push(r));
    expect(props.detail.enabled).toBe(false);
    expect(props.window.enabled).toBe(false);
    props.onRowOpen("a1");
    expect(opened).toEqual(["a1"]);
    expect(NO_RAW_ROW_WINDOW.detail.enabled).toBe(false);
  });

  it("is spread on every MatrxDataTable in the section (guard: fails when a table is added without it)", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(COMPONENTS).filter((f) => f.endsWith(".tsx"))) {
      const src = readFileSync(join(COMPONENTS, file), "utf8");
      const tables = src.match(/<MatrxDataTable[<\s]/g)?.length ?? 0;
      const opens = src.match(/\{\.\.\.socialRowOpen</g)?.length ?? 0;
      if (tables !== opens) offenders.push(`${file}: ${tables} tables, ${opens} row-open rules`);
    }
    expect(offenders).toEqual([]);
  });
});
