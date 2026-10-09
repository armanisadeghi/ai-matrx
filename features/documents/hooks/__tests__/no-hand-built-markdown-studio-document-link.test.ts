/** @jest-environment node */
// A hand-built `/markdown-studio?source=document&id=` link assumes the document is markdown; a Space
// would open wrongly. Outside the allow-list, link to the door `/documents/<id>` or use `documentHref`.
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const ALLOWED = [
  "features/scopes/registry/entityRegistry.ts", // documentHref itself
  "components/markdown-studio/AnnotateView.tsx", // Studio-internal, doc already open as markdown
  "components/markdown-studio/lab/content-sources.ts", // Studio-internal, loaded as markdown
];
const NEEDLE = "markdown-studio?source=document";

function offenders(): string[] {
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-l", NEEDLE, "--", "*.ts", "*.tsx", "*.js", "*.mjs"], { cwd: ROOT, encoding: "utf8" });
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\./.test(f) && !ALLOWED.includes(f));
}

describe("no hand-built markdown-studio document link", () => {
  it("only the allow-list builds it", () => {
    expect(offenders()).toEqual([]);
  });
});
