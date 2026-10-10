import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { NO_RAW_ROW_WINDOW, socialRowOpen } from "../row-open";
import { accountHref } from "../account-href";
import { brandAccountHref } from "../property-account-href";

const SOCIAL = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === "__tests__" || e.name === "node_modules"
      ? []
      : e.isDirectory()
        ? tsxFiles(join(dir, e.name))
        : e.name.endsWith(".tsx")
          ? [join(dir, e.name)]
          : [],
  );
}

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
    for (const path of tsxFiles(SOCIAL)) {
      const file = path.slice(SOCIAL.length + 1);
      const src = readFileSync(path, "utf8");
      const tables = src.match(/<MatrxDataTable[<\s]/g)?.length ?? 0;
      const opens = src.match(/\{\.\.\.socialRowOpen</g)?.length ?? 0;
      if (tables !== opens) offenders.push(`${file}: ${tables} tables, ${opens} row-open rules`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("an account always opens its route", () => {
  it("links a stored profile to /socials/<platform>/<profileId> and an unstored one to nothing", () => {
    expect(accountHref("data-destruction", { platform: "youtube", profileId: "p1" })).toBe("/marketing/data-destruction/socials/youtube/p1");
    expect(accountHref("data-destruction", { platform: "x", profileId: null })).toBeNull();
  });

  it("the Outliers feed and the swipe file pass the creator's route to the post card", () => {
    for (const f of ["OutliersTab.tsx", "SwipeFileTab.tsx"]) {
      expect(readFileSync(join(SOCIAL, "components", f), "utf8")).toMatch(/accountHref=\{accountHref\(brandSeg/);
    }
  });
});

const MARKETING = join(__dirname, "..", "..");

/** The opening tag of every `<MatrxDataTable ...>` in a file (generics and `=>` inside props skipped). */
function tableOpeningTags(src: string): string[] {
  const tags: string[] = [];
  for (const m of src.matchAll(/<MatrxDataTable\b/g)) {
    let j = (m.index ?? 0) + m[0].length;
    if (src[j] === "<") {
      let d = 0;
      for (; j < src.length; j++) {
        if (src[j] === "<") d++;
        else if (src[j] === ">" && --d === 0) {
          j++;
          break;
        }
      }
    }
    let depth = 0;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && src[j - 1] !== "=") break;
    }
    tags.push(src.slice(m.index ?? 0, j));
  }
  return tags;
}

describe("no marketing table opens the generic record window", () => {
  it("every MatrxDataTable under features/marketing says what a row opens (detail, window, a spread rule) - the default is the raw-fields inspector", () => {
    const offenders: string[] = [];
    for (const path of tsxFiles(MARKETING)) {
      const file = path.slice(MARKETING.length + 1);
      for (const tag of tableOpeningTags(readFileSync(path, "utf8"))) {
        if (!/\bdetail=|\bwindow=|socialRowOpen|NO_RAW_ROW_WINDOW|\{\.\.\./.test(tag)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("an untracked account still opens its route", () => {
  it("falls back to the property page, so every account row and name links", () => {
    expect(brandAccountHref("data-destruction", { platform: "x", profileId: null, propertyId: "prop1" })).toBe(
      "/marketing/data-destruction/socials/x/prop1",
    );
    expect(brandAccountHref("data-destruction", { platform: "x", profileId: "p1", propertyId: "prop1" })).toBe(
      "/marketing/data-destruction/socials/x/p1",
    );
  });

  it("the Accounts table links through brandAccountHref, never the profile-only accountHref", () => {
    const src = readFileSync(join(SOCIAL, "components", "AccountsTab.tsx"), "utf8");
    expect(src).toMatch(/brandAccountHref\(brandSeg, r\)/);
    expect(src).not.toMatch(/const href = accountHref\(/);
  });
});
