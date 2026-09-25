/**
 * WORKFLOW PARITY, THE CLASS — a screen that SAYS what runs never asks the
 * agent-only launch door.
 *
 * `useMandate` / `resolveMandate` exist to LAUNCH in the browser, which only an
 * agent can be, so they refuse a workflow winner. A screen that paints the
 * "Effective Mandate Holder" must use the holder-neutral `useMandateHolder`.
 * On 2026-09-25 the record page (`record-next/MandateRecordBody.tsx`) carried a
 * verbatim copy of the workspace's painter that still used `useMandate`, so
 * `/mandates/record-preview/wfparity.text_summary?tab=holder` read
 * "Mandate Holder: Not available · Source: Unknown" for a workflow-held job
 * while the original workspace page answered correctly.
 *
 * Two guards: (1) every file that paints the effective holder uses the
 * holder-neutral hook and never the launch hook; (2) the painter exists ONCE,
 * so a copy cannot drift from the fixed original again.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = sourceFiles(ROOT).map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

const PAINTS_EFFECTIVE_HOLDER =
  /Effective Mandate Holder|<FulfillmentSection\b|viewFromVerdict\(/;

test("every screen that paints the effective holder resolves holder-neutrally", () => {
  const painters = files.filter((f) => PAINTS_EFFECTIVE_HOLDER.test(f.text));
  expect(painters.length).toBeGreaterThan(0);
  const offenders = painters
    .filter(
      (f) =>
        /\buseMandate\(/.test(f.text) ||
        /from "(@\/features\/mandates|\.\.?)\/useMandate"/.test(f.text),
    )
    .map((f) => f.path);
  expect(offenders).toEqual([]);
});

test("the effective-holder painter and its verdict reader exist exactly once", () => {
  const definitions = (pattern: RegExp) =>
    files.filter((f) => pattern.test(f.text)).map((f) => f.path);
  expect(definitions(/^(export )?function FulfillmentSection\(/m)).toEqual([
    "workspace/MandateWorkspace.tsx",
  ]);
  expect(definitions(/^(export )?function viewFromVerdict\(/m)).toEqual([
    "workspace/MandateWorkspace.tsx",
  ]);
});
