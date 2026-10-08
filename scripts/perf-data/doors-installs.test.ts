/**
 * `pnpm perf:data --doors` died at the template_install row with ELIFECYCLE and no message. The install
 * rows must always come back as a row or ONE named skip - never a throw, never silence.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

type Rpc = (schema: string, fn: string) => Promise<{ ms: number; status: number; text: string }>;
/** doors.mjs is ESM: run measureInstalls in node with the given rpc stub (source text) and read the rows back. */
async function measureInstalls(args: { orgId: string; templateId: string; installs: number; rpc: Rpc; log: () => void }) {
  const code = `import { measureInstalls } from ${JSON.stringify(path.join(__dirname, "doors.mjs"))};
const calls = [];
const rpc = ${args.rpc.toString()};
const rows = await measureInstalls({ orgId: "o", templateId: "t", installs: ${args.installs}, rpc: (s, f) => { calls.push(f); return rpc(s, f); }, log: () => {} });
console.log("ROWS" + JSON.stringify({ rows, calls }));`;
  const r = spawnSync("node", ["--input-type=module", "-e", code], { encoding: "utf8" });
  const line = r.stdout.split("\n").find((l) => l.startsWith("ROWS"));
  if (!line) throw new Error(`no rows: ${r.stderr}`);
  const parsed = JSON.parse(line.slice(4));
  measureInstalls.last = parsed.calls;
  return parsed.rows;
}
measureInstalls.last = [] as string[];

const base = { orgId: "o", templateId: "t", installs: 2 };
const quiet = () => {};

it("a door that refuses becomes a named skip, not a crash", async () => {
  const rpc = async () => ({ ms: 5, status: 400, text: JSON.stringify({ code: "P0001", message: "no organization" }) });
  const rows = await measureInstalls({ ...base, rpc, log: quiet });
  expect(rows).toHaveLength(1);
  expect(rows[0].firstError).toMatch(/^skipped: install 1 answered 400 no organization/);
});

it("a body that is not JSON is a named skip", async () => {
  const rpc = async () => ({ ms: 5, status: 200, text: "<html>504</html>" });
  const rows = await measureInstalls({ ...base, rpc, log: quiet });
  expect(rows[0].firstError).toMatch(/^skipped:/);
});

it("a thrown fetch is a named skip", async () => {
  const rpc = async () => { throw new Error("socket hang up"); };
  const rows = await measureInstalls({ ...base, rpc, log: quiet });
  expect(rows[0].firstError).toContain("socket hang up");
});

it("a good install gives both rows and removes what it installed", async () => {
  const rpc = async (_s: string, fn: string) => { return { ms: 5, status: 200, text: JSON.stringify(fn === "template_install" ? { done: true, install_id: "i1" } : { done: true }) }; };
  const rows = await measureInstalls({ ...base, rpc, log: quiet });
  expect(rows.map((r: { door: string }) => r.door)).toEqual(["custom.template_install (first call)", "custom.template_install (whole install)"]);
  expect(measureInstalls.last.filter((c) => c === "template_uninstall")).toHaveLength(2);
});
