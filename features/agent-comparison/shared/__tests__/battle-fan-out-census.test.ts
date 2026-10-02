/**
 * Census: every Agent Battle mode's Submit All fans out through ONE helper.
 *
 * Class closed (Model Battle, 2026-10-01): each mode hand-rolled "copy the
 * shared composer into every column, then send each", so a column that had
 * already run got an empty follow-up whenever the composer was empty, and the
 * send door refused it as a failure. The rule now lives once in
 * `runBattleFanOut` (battle-follow-up.ts). This census fails a mode — present
 * or future — whose Submit All copies or sends on its own.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");

function thunkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      thunkFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** The body of every `export const submitAll… = createAsyncThunk(…)` in a file. */
function submitAllBodies(text: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export const (submitAll\w*)\s*=\s*createAsyncThunk/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const next = text.indexOf("\nexport ", m.index + 1);
    out.push({ name: m[1], body: text.slice(m.index, next === -1 ? undefined : next) });
  }
  return out;
}

export function censusFindings(files: { path: string; text: string }[]): string[] {
  const findings: string[] = [];
  for (const { path, text } of files) {
    for (const { name, body } of submitAllBodies(text)) {
      if (!/\brunBattleFanOut\(/.test(body)) findings.push(`${path} ${name}: not through runBattleFanOut`);
      if (/\b(copyInstanceRequestDraft|smartExecute)\(/.test(body)) {
        findings.push(`${path} ${name}: copies or sends on its own`);
      }
    }
  }
  return findings;
}

describe("every battle mode's Submit All goes through runBattleFanOut", () => {
  const files = thunkFiles(ROOT).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, "utf8") }));

  it("finds every mode (a moved file must not hollow the census)", () => {
    const names = files.flatMap((f) => submitAllBodies(f.text).map((b) => b.name)).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        "submitAllBattleColumns",
        "submitAllModel",
        "submitAllRequestMod",
        "submitAllSettings",
        "submitAllSystemPrompt",
        "submitAllTools",
        "submitAllTuning",
        "submitAllVariations",
      ]),
    );
  });

  it("no mode fans out on its own", () => {
    expect(censusFindings(files)).toEqual([]);
  });

  it("catches a hand-rolled fan-out (planted)", () => {
    const planted = `export const submitAllX = createAsyncThunk("x", async () => {
      for (const col of columns) dispatch(copyInstanceRequestDraft({}));
      await dispatch(smartExecute({ conversationId })).unwrap();
    });`;
    expect(censusFindings([{ path: "x.ts", text: planted }])).toEqual([
      "x.ts submitAllX: not through runBattleFanOut",
      "x.ts submitAllX: copies or sends on its own",
    ]);
  });
});
