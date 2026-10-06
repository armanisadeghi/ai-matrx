// A page that mounts the custom-fields line (which carries "Linked records") AND the older "Linked"
// panel must tell the panel so, or every custom row linking to the record is listed twice.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../../..");

function filesWith(tag: string): string[] {
  const out = execSync(
    `grep -rlE "<${tag}\\b" --include=*.tsx features app components || true`,
    { cwd: ROOT, encoding: "utf8" },
  );
  return out.split("\n").filter((f) => f && !f.includes("__tests__"));
}

export function pagesListingTwice(read: (file: string) => string, files: string[]): string[] {
  return files.filter((f) => {
    const src = read(f);
    if (!/<EntityCustomFields\b/.test(src)) return false;
    const panels = src.match(/<LinkedRecordsSection\b[^>]*>/g) ?? [];
    return panels.some((p) => !/\bbackLinksShownElsewhere\b/.test(p));
  });
}

describe("a page with both sections lists a custom row once", () => {
  it("every page that mounts both passes backLinksShownElsewhere", () => {
    const panelHosts = filesWith("LinkedRecordsSection");
    const offenders = pagesListingTwice((f) => readFileSync(path.join(ROOT, f), "utf8"), panelHosts);
    expect(offenders).toEqual([]);
  });

  it("is red for a page that mounts both without it", () => {
    const planted = `<EntityCustomFields entityToken="note" /> <LinkedRecordsSection token="note" id={x} title="" />`;
    expect(pagesListingTwice(() => planted, ["planted.tsx"])).toEqual(["planted.tsx"]);
  });
});
