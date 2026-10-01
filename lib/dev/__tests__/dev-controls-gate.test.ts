// Every control labelled "[DEV]" is a developer tool and renders in a
// development build only (lib/dev/devControls.ts). verify-6 #1 (2026-10-01):
// the deck page showed "[DEV] Open study session in window panel" in
// production to an admin, because three [DEV] controls were gated on an admin
// flag alone. This census reads every tracked .tsx/.ts source and fails on a
// file that renders a "[DEV]" string without reading SHOW_DEV_CONTROLS.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";


const ROOT = path.resolve(__dirname, "../../..");

function filesRenderingDevLabels(): string[] {
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["grep", "-l", "-F", '"[DEV]', "--", "*.tsx", "*.ts"],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes("__tests__") && !/\.test\.tsx?$/.test(f));
}

describe("[DEV] controls render in development builds only", () => {
  it("finds the [DEV] controls it guards (the census is not empty)", () => {
    expect(filesRenderingDevLabels().length).toBeGreaterThan(0);
  });

  it("every file that renders a [DEV] label reads SHOW_DEV_CONTROLS", () => {
    const ungated = filesRenderingDevLabels().filter(
      (f) => !readFileSync(path.join(ROOT, f), "utf8").includes("SHOW_DEV_CONTROLS"),
    );
    expect(ungated).toEqual([]);
  });
});
