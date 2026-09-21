/**
 * COLD WALK 16, BLOCKING DEFECT A — "the Rulebook sends the Expert out of the
 * product to look at their own finished work."
 *
 * A first-time Expert built a Rulebook from an interview and five files, built
 * a Masterwork, ran it once, and pressed the Rulebook's own **View all**. On
 * the page that button opens there were exactly two clickable things inside
 * the card and both left:
 *
 *   * her Masterwork's own name —
 *     `<a href="https://workflows.aimatrx.com/workflows/c85f9c0d-…" target="_blank">`
 *   * her finished run — `<a href="/workflows/runs/83eccac4-…">`, which lands
 *     on the engine console: "DONE · $0.61 · 16 of 16 steps · 1:43", THE PLAN,
 *     LIVE ACTIVITY, and Pause · Resume · Stop · Cancel now.
 *
 * The correct screen already existed. `/masterwork/encore/<id>?run=<runId>`
 * renders the whole deliverable on a COLD load through `OpenRunPanel` and the
 * registered `masterwork_result` kind. One page got that fix and its sibling
 * did not, because the address was a string each surface spelled for itself.
 *
 * ## What this guard actually does
 *
 * Two halves, and the second is the one that closes the CLASS:
 *
 *  1. It RENDERS the row a Masterwork surface gives an Expert and reads the
 *     href out of the markup.
 *  2. It reads the SOURCE of every Masterwork surface and fails if any of them
 *     spells an engine-console or authoring-host address at all. A future
 *     surface cannot regress quietly by typing the address again: it either
 *     uses `masterworkDoors` or this test names the file and the line.
 *
 * Proven failing before it passed (2026-09-21): with `MasterworksPage`'s name
 * link restored to `${WORKFLOWS_APP_URL}/workflows/{id}` and the run row's
 * default back to `runHref`, both halves fail.
 */
import React from "react";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { renderToString } from "react-dom/server";

import { MasterworkRunRow } from "../components/masterworks/MasterworksPage";
import { masterworkHref, masterworkRunHref } from "../masterworkDoors";
import type { MasterworkRun } from "../service";

const MASTERWORK = "c85f9c0d-8b51-4bbe-a9b6-0fde5f7c6379";
const RUN = "83eccac4-6fdd-4198-a438-562f37a06245";

/** The walk's own finished run: 16 of 16 steps, 1m 43s, $0.61. */
const WALK16_RUN: MasterworkRun = {
  id: RUN,
  status: "completed",
  created_at: "2026-09-21T02:31:00.000Z",
  started_at: "2026-09-21T02:31:02.000Z",
  completed_at: "2026-09-21T02:32:45.000Z",
  steps_executed: 16,
  cost_usd: 0.61,
  deliverable_preview:
    "Rust is a coating; a number is a diagnosis. Age alone is never a reason to replace.",
  error_message: null,
};

describe("a Masterwork run opens on the Masterwork's own page", () => {
  it("renders the run row as the in-app ?run= address", () => {
    const html = renderToString(
      <MasterworkRunRow
        run={WALK16_RUN}
        href={masterworkRunHref(MASTERWORK, RUN)}
      />,
    );
    expect(html).toContain(
      `href="/masterwork/encore/${MASTERWORK}?run=${RUN}"`,
    );
    // The engine console, by either spelling, is what the walk landed on.
    expect(html).not.toContain(`/workflows/runs/${RUN}`);
    expect(html).not.toContain("workflows.aimatrx.com");
    // A same-origin door navigates in place — never an escape into another app.
    expect(html).not.toContain('target="_blank"');
  });

  it("keeps ONE spelling of both addresses", () => {
    expect(masterworkHref(MASTERWORK)).toBe(`/masterwork/encore/${MASTERWORK}`);
    expect(masterworkRunHref(MASTERWORK, RUN)).toBe(
      `/masterwork/encore/${MASTERWORK}?run=${RUN}`,
    );
  });

  it("gives the run row NO default door at all", () => {
    // The defect was a default, not a typo: Encore passed its own address and
    // was right, and the Rulebook's page took the default and was wrong. A
    // required prop is what stops the next surface inheriting the console.
    const source = readFileSync(
      join(process.cwd(), "features/masterwork/components/masterworks/MasterworksPage.tsx"),
      "utf8",
    );
    expect(source).toMatch(/^\s*href: string;$/m);
    expect(source).not.toContain("href ?? runHref(");
  });
});

/**
 * Every `.ts`/`.tsx` under `features/masterwork` plus the Masterwork routes —
 * the whole surface area an Expert can reach from a Rulebook, a Masterwork or
 * Encore. Tests are excluded: this very file names the forbidden addresses.
 */
function masterworkSources(): string[] {
  const roots = [
    join(process.cwd(), "features/masterwork"),
    join(process.cwd(), "app/(core)/masterwork"),
  ];
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue;
      found.push(full);
    }
  };
  roots.forEach(walk);
  return found;
}

/**
 * Prose about the defect is allowed; a live address is not.
 *
 * Block comments are tracked across lines — a `{/* … *\/}` explaining WHY the
 * engine's door was removed spans several lines and only its first starts with
 * a comment marker, so a line-shaped filter would read the explanation as the
 * offence it describes.
 */
function offendingLines(source: string): string[] {
  const offenders: string[] = [];
  let inBlock = false;
  source.split("\n").forEach((line, i) => {
    let code = line;
    if (inBlock) {
      const end = code.indexOf("*/");
      if (end === -1) return;
      code = code.slice(end + 2);
      inBlock = false;
    }
    for (;;) {
      const open = code.indexOf("/*");
      if (open === -1) break;
      const close = code.indexOf("*/", open + 2);
      if (close === -1) {
        code = code.slice(0, open);
        inBlock = true;
        break;
      }
      code = code.slice(0, open) + code.slice(close + 2);
    }
    const lineComment = code.indexOf("//");
    if (lineComment > -1) code = code.slice(0, lineComment);
    code = code.trim();
    if (!code) return;
    const hit =
      code.includes("workflows.aimatrx.com") ||
      code.includes("WORKFLOWS_APP_URL") ||
      code.includes("/workflows/runs/") ||
      code.includes("workflowRunsHref") ||
      /\brunHref\(/.test(code);
    if (hit) offenders.push(`${i + 1}: ${code}`);
  });
  return offenders;
}

describe("no Masterwork surface links to the workflow engine", () => {
  it("spells no engine-console or authoring-host address anywhere", () => {
    const offenders: string[] = [];
    for (const file of masterworkSources()) {
      const lines = offendingLines(readFileSync(file, "utf8"));
      for (const line of lines) {
        offenders.push(`${file.replace(process.cwd() + "/", "")} ${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds real Masterwork surfaces to check (the sweep is not empty)", () => {
    const files = masterworkSources();
    expect(files.length).toBeGreaterThan(50);
    expect(
      files.some((f) => f.endsWith("components/masterworks/MasterworksPage.tsx")),
    ).toBe(true);
    expect(files.some((f) => f.endsWith("encore/EncoreRunPage.tsx"))).toBe(true);
  });
});
