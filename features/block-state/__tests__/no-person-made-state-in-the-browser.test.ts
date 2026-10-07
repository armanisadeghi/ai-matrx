/**
 * THE CENSUS: nothing a person makes inside an answer is kept in the browser.
 *
 * Arman's rule (2026-10-05): anything a person creates is durable server-side
 * from day one through ONE primitive (`useBlockState` → platform.block_states).
 * An interactive block, a canvas kind, or an unsent remark chip that reaches for
 * localStorage / sessionStorage / IndexedDB is a defect — it is the exact class
 * that left questionnaire answers on one laptop.
 *
 * Forcing function: the detector is proven on a PLANTED violation (it fails on
 * the planted source, passes on a clean one), then runs over the real source
 * trees. Allowlist = per-viewer conveniences that are not a person's work.
 *
 * Use case: Dana ticks recipe steps on her laptop; her phone must show them.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

/** Real storage access (not a mention in a comment). */
export function findBrowserStorageUse(source: string): string[] {
  const hits: string[] = [];
  for (const [i, raw] of source.split("\n").entries()) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    if (
      /\b(?:window\.|globalThis\.)?(?:localStorage|sessionStorage)\s*(?:\.|\[)/.test(line) ||
      /\bindexedDB\s*\./.test(line) ||
      /\buse(?:Local|Session)Storage\s*\(/.test(line) ||
      /\bwindow\.(?:localStorage|sessionStorage)\b/.test(line)
    ) {
      hits.push(`${i + 1}: ${line}`);
    }
  }
  return hits;
}

/** Trees where a person's interactive state lives (every file, recursively). */
const WATCHED = [
  "components/mardown-display/blocks",
  "features/canvas/artifact-types",
  "features/content-ir/react",
  "features/content-ir/kinds",
  "features/block-state",
  "../aidream/apps/shared/chat/src/agents/redux/execution-system/instance-resources",
];

/** Per-viewer conveniences — NOT a person's work. Each says why. */
const ALLOWLIST: Record<string, string> = {
  "features/block-state/legacyPurge.ts": "deletes the old browser copies once; keeps nothing",
  "components/mardown-display/blocks/presentations/PresentationExportMenu.tsx":
    "reads the person's Google sign-in token to export; stores nothing they made",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("the detector itself (planted violation)", () => {
  it("fails on a block that keeps answers in localStorage", () => {
    const planted = `export function save(s: unknown) {\n  window.localStorage.setItem("answers", JSON.stringify(s));\n}`;
    expect(findBrowserStorageUse(planted)).toHaveLength(1);
  });
  it("catches sessionStorage and IndexedDB too", () => {
    expect(findBrowserStorageUse(`sessionStorage.getItem("x")`)).toHaveLength(1);
    expect(findBrowserStorageUse(`const db = indexedDB.open("x");`)).toHaveLength(1);
  });
  it("ignores a comment that merely mentions it, and clean code", () => {
    expect(findBrowserStorageUse(`// never localStorage.setItem here\nconst a = 1;`)).toHaveLength(0);
  });
});

describe("every interactive block / kind / chip keeps person-made state server-side", () => {
  const files = WATCHED.flatMap((dir) => walk(join(ROOT, dir)));

  it("scans a real tree (not vacuous)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("uses no localStorage / sessionStorage / IndexedDB outside the allowlist", () => {
    const offenders = files.flatMap((file) => {
      const rel = relative(ROOT, file);
      if (rel in ALLOWLIST) return [];
      const hits = findBrowserStorageUse(readFileSync(file, "utf8"));
      return hits.length ? [`${rel}\n    ${hits.join("\n    ")}`] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("every allowlist entry still exists and still needs its exception", () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      expect(findBrowserStorageUse(readFileSync(join(ROOT, rel), "utf8")).length).toBeGreaterThan(0);
    }
  });
});
