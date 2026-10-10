/**
 * NO NAVIGATION ROW IS EVER HIDDEN BEHIND A SWITCH, AND THE STORE-SWITCH GATE STAYS DELETED.
 *
 * Arman, 2026-10-03: "Why am I being told that the table builder is off to organizations by
 * default? EVERYTHING IS ON by default and things can only be TURNED OFF! Don't limit what
 * users can do." The sidebar used to carry `gate: "unified-data-campaign"` on Make, Records and
 * Kits and hid them until a per-organization switch answered ON — so a person with no active
 * organization (an admin included) saw no Data entries and was told the store was off.
 *
 * RED when: a nav row carries a `gate` key; Make / Records / Kits leave the Data menu; any source
 * file imports the deleted gate hooks or names the deleted OFF / UNAVAILABLE sentences.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  adminNavItems,
  DATA_NAV_CHILDREN,
  dockItems,
  primaryNavItems,
  type ShellNavChild,
} from "../constants/nav-data";

const ROOT = path.resolve(__dirname, "../../..");
const SOURCE_DIRS = ["app", "features", "components", "lib", "hooks", "providers", "utils"];
const SELF = path.relative(ROOT, __filename);

/** Names that must never come back. Built from parts so this file does not match itself. */
const DELETED = [
  ["useUnifiedData", "CampaignGate"].join(""),
  ["useShell", "NavGates"].join(""),
  ["UNIFIED_DATA_CAMPAIGN", "_OFF_SENTENCE"].join(""),
  ["UNIFIED_DATA_CAMPAIGN", "_UNAVAILABLE_SENTENCE"].join(""),
  ["Unified", "DataSwitchNotice"].join(""),
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(name)) out.push(full);
  }
  return out;
}

function everyChild(children: readonly ShellNavChild[] | undefined, out: ShellNavChild[] = []): ShellNavChild[] {
  for (const child of children ?? []) {
    out.push(child);
    everyChild(child.children, out);
  }
  return out;
}

describe("no nav row is gated", () => {
  const rows = [...primaryNavItems, ...adminNavItems, ...dockItems].flatMap((item) => [
    item as unknown as ShellNavChild,
    ...everyChild(item.children),
  ]);

  it("no navigation row carries a `gate` key", () => {
    const gated = [...rows, ...everyChild(DATA_NAV_CHILDREN)].filter((row) => "gate" in row);
    expect(gated.map((row) => row.label)).toEqual([]);
  });

  it("the nav source declares no `gate:` property at all", () => {
    const src = readFileSync(path.join(ROOT, "features/shell/constants/nav-data.ts"), "utf8");
    expect(src).not.toMatch(/^\s*gate\??:/m);
  });

  it("Records are always in the Data menu and Make in Workspace (/kits is retired)", () => {
    const hrefs = DATA_NAV_CHILDREN.map((child) => child.href);
    expect(hrefs).toContain("/data");
    expect(hrefs).not.toContain("/make");
    const workspace = primaryNavItems.find((item) => item.label === "Workspace");
    expect((workspace?.children ?? []).map((child) => child.href)).toContain("/make");
    expect(DATA_NAV_CHILDREN.some((child) => /\/kits/i.test(child.href ?? ""))).toBe(false);
  });

  it("no source file names the deleted store-switch gate", () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file);
        if (rel === SELF) continue;
        const src = readFileSync(file, "utf8");
        for (const name of DELETED) if (src.includes(name)) offenders.push(`${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
