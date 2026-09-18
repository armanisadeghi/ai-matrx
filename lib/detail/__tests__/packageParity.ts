// lib/detail/__tests__/packageParity.ts
//
// 🚨 THE IN-REPO COPY OF THE DETAIL PRIMITIVE IS A COPY, AND IT MUST STAY EVEN
// WITH THE PACKAGE UNTIL THE PUBLISH LANDS.
//
// The primitive was cut into `@ai-matrx/detail` (aidream `apps/shared/detail`).
// The frontend adopted it and the adoption was REVERTED (`ec7ce701` reverted by
// `32ce9170`, ruling R21) because the package is not on npm yet and a `latest`
// spec killed `pnpm install --frozen-lockfile`. So `lib/detail/**` is the live
// code and the package is the source of truth for what it should say.
//
// The fifteen days between the cut and round 5 are what this file exists for:
// the package fixed a reviewed defect (a producer answering `onReconnect: null`
// still got a Reconnect button — a control that does nothing) and the revert
// un-fixed it here, so the two copies drifted in a way a PERSON could feel while
// every test in both repos stayed green (VERIFY-U-P1-R5, N1 + N2).
//
// This module is the mapping and the normalisation; `the-in-repo-copy-matches-
// the-package.test.ts` is the guard. The normalisation is deliberately narrow:
// ONLY the module-path header comment and relative import specifiers, which
// differ because the two trees have different shapes. Every other byte —
// including every comment — must match, so a fix cannot land on one side only.
//
// THE ONE FILE THAT IS DELIBERATELY DIFFERENT is `core/icons.ts`: the package
// ships its own inlined glyphs (a package takes no icon-library dependency) and
// this repo is Lucide-only, so the host's copy re-exports Lucide's `*Icon`
// aliases under the same names. It is not compared, and it is the only exception.

import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The package's source root: the aidream checkout beside this repo. Path-relative
 * from this file (`lib/detail/__tests__` → the repo root's parent), never an env
 * var — this is a fixed layout of the workspace, not a value.
 */
export const PACKAGE_SRC = path.resolve(
  __dirname,
  "../../../../aidream/apps/shared/detail/src",
);

/** The in-repo copy's root, relative to THIS file. */
export const IN_REPO_ROOT = path.resolve(__dirname, "..");

export interface DetailModulePair {
  /** The canonical module name — what an import resolves to on either side. */
  name: string;
  /** Path under the package's `src/`. */
  pkg: string;
  /** Path under `lib/detail/`. */
  repo: string;
  /** Deliberately host-specific: resolved for imports, never compared. */
  hostSpecific?: true;
}

/**
 * The fifteen module pairs (plus `icons`, which is host-specific). A module in
 * the package that is NOT here is either an entry barrel (`index.ts`), the test
 * seat (`testing/`) or a suite — none of which the host copies.
 */
export const DETAIL_MODULE_PAIRS: readonly DetailModulePair[] = [
  { name: "types", pkg: "types.ts", repo: "types.ts" },
  { name: "format", pkg: "format.ts", repo: "format.ts" },
  { name: "listContext", pkg: "listContext.ts", repo: "listContext.ts" },
  { name: "presentation", pkg: "presentation.ts", repo: "presentation.ts" },
  { name: "host", pkg: "react/host.tsx", repo: "host.tsx" },
  { name: "presentations", pkg: "react/presentations.tsx", repo: "presentations.tsx" },
  { name: "useDetailHealth", pkg: "react/useDetailHealth.ts", repo: "useDetailHealth.ts" },
  { name: "useDetailKeyboard", pkg: "react/useDetailKeyboard.ts", repo: "useDetailKeyboard.ts" },
  { name: "useDetailRecord", pkg: "react/useDetailRecord.ts", repo: "useDetailRecord.ts" },
  { name: "useOpenDetail", pkg: "react/useOpenDetail.ts", repo: "useOpenDetail.ts" },
  { name: "core/DetailBody", pkg: "react/DetailBody.tsx", repo: "core/DetailBody.tsx" },
  { name: "core/DetailHeader", pkg: "react/DetailHeader.tsx", repo: "core/DetailHeader.tsx" },
  {
    name: "core/DetailPresentationPane",
    pkg: "react/DetailPresentationPane.tsx",
    repo: "core/DetailPresentationPane.tsx",
  },
  { name: "core/headerGeometry", pkg: "react/headerGeometry.ts", repo: "core/headerGeometry.ts" },
  { name: "core/useDetailCore", pkg: "react/useDetailCore.ts", repo: "core/useDetailCore.ts" },
  // Host-specific, and the only one: see the header.
  { name: "icons", pkg: "react/icons.tsx", repo: "core/icons.ts", hostSpecific: true },
];

export const COMPARED_PAIRS = DETAIL_MODULE_PAIRS.filter((p) => !p.hostSpecific);

type Side = "pkg" | "repo";

/** `src/react/host.tsx` → `src/react/host`, so a specifier can match it. */
function withoutExtension(file: string): string {
  return file.replace(/\.(tsx?|jsx?)$/, "");
}

function indexBySide(side: Side): Map<string, string> {
  const index = new Map<string, string>();
  for (const pair of DETAIL_MODULE_PAIRS) {
    index.set(withoutExtension(side === "pkg" ? pair.pkg : pair.repo), pair.name);
  }
  return index;
}

const IMPORT_SPECIFIER = /(from\s+|import\s*\(\s*)(["'])(\.[^"']*)\2/g;

/**
 * The comparable text of one module: its path header replaced by a marker, and
 * every RELATIVE import specifier replaced by the canonical module name it
 * resolves to. Nothing else is touched.
 */
export function normalise(source: string, side: Side, ownFile: string): string {
  const index = indexBySide(side);
  const ownDir = path.posix.dirname(withoutExtension(ownFile));
  const body = source.replace(IMPORT_SPECIFIER, (whole, lead, quote, spec) => {
    const resolved = path.posix.normalize(path.posix.join(ownDir, spec));
    const name = index.get(resolved);
    // An unmapped relative import would be a real difference: leave it as-is so
    // the diff SHOWS it rather than hiding it behind the normalisation.
    return name ? `${lead}${quote}@detail/${name}${quote}` : whole;
  });
  // Line 1 is `// lib/detail/<path>` here and `// @ai-matrx/detail — src/<path>`
  // there; the module's own identity, not its content.
  return body.replace(/^\/\/ [^\n]*\n/, "// <module header>\n");
}

export function readPair(pair: DetailModulePair): { pkg: string; repo: string } {
  return {
    pkg: normalise(readFileSync(path.join(PACKAGE_SRC, pair.pkg), "utf8"), "pkg", pair.pkg),
    repo: normalise(readFileSync(path.join(IN_REPO_ROOT, pair.repo), "utf8"), "repo", pair.repo),
  };
}
