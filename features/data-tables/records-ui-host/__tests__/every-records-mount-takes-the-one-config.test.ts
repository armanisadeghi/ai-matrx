/**
 * GUARD: every records-ui mount takes its `config` from `useAppRecordsConfig` (the host file).
 *
 * A hand-built config forgets the live-updates port (the "Not live" banner) or the actor. So no
 * file outside the host may call `createRecordsRealtimePort(` or write a records `config={{ … }}`
 * literal (dataSource / actor / organizationId keys) by hand.
 *
 * Allowed: the host file; two non-React subscribers that join the port
 * directly (no config); tests; `features/spaces/` until Spaces switches itself.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");

const ALLOWED = [
  "features/data-tables/records-ui-host/recordsUiHost.tsx",
  "features/content-ir/registry/table-kind-source.ts",
];
const ALLOWED_PREFIX = ["features/spaces/"];

function sourceFiles(): string[] {
  const out = execSync(
    `grep -rlE "createRecordsRealtimePort\\(|config=\\{\\{" features app components lib --include=*.ts --include=*.tsx || true`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes("__tests__") && !/\.test\.tsx?$/.test(f) && !f.includes("node_modules"))
    .filter((f) => !ALLOWED.includes(f) && !ALLOWED_PREFIX.some((p) => f.startsWith(p)));
}

/** A `config={{ … }}` literal whose body names the records config's keys. */
function handBuiltConfigs(text: string): number {
  let count = 0;
  const re = /config=\{\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = text.slice(m.index, m.index + 400);
    if (/\bdataSource\b/.test(body) || /\bactor\s*:/.test(body)) count += 1;
  }
  return count;
}

describe("every records-ui mount takes the one config", () => {
  const files = sourceFiles();

  it("scans a real set of files (the scan itself works)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("no file outside the host calls createRecordsRealtimePort(", () => {
    const offenders = files.filter((f) => /createRecordsRealtimePort\(/.test(readFileSync(path.join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no file outside the host hand-builds a records config literal", () => {
    const offenders = files.filter((f) => handBuiltConfigs(readFileSync(path.join(ROOT, f), "utf8")) > 0);
    expect(offenders).toEqual([]);
  });

  it("the detector fires on a hand-built config (proof it can fail)", () => {
    expect(handBuiltConfigs("<RecordsMount config={{ dataSource, actor: personActor(u), organizationId }} />")).toBe(1);
    expect(handBuiltConfigs("<RecordsMount config={recordsConfig} />")).toBe(0);
  });
});
