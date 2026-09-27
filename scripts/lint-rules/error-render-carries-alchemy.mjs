/**
 * matrx/error-render-carries-alchemy (RC-B12, 2026-09-26)
 *
 * Every error the UI shows carries the Alchemy Menu — through ErrorNotice,
 * ErrorBox or <ErrorAlchemyMenu/> in the same box. The jest census
 * (components/errors/__tests__/error-renders-carry-alchemy.test.ts) proves the
 * whole tree, but CI is a signal, never a gate, and new renders kept landing
 * between runs. This rule puts the SAME census in the editor and `pnpm lint`,
 * so the render is flagged the moment it is written.
 *
 * One definition: the rule loads the census module itself
 * (components/errors/__tests__/error-display-census.ts, through Node's own
 * TypeScript support) — it never re-derives what an error display is.
 * Components that draw the menu themselves are resolved across imports once
 * per lint process (error-census-carriers.ts), then this file's own text
 * wins over the copy on disk.
 *
 * Fix: render the error through <ErrorNotice …/> (or a component that does),
 * or put <ErrorAlchemyMenu error={…} /> inside the error's own box — on its
 * line, never a row of its own. See components/errors/FEATURE.md.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Node warns that a .ts file has no "type" — expected here; keep lint output clean.
async function importQuiet(rel) {
  const original = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const text = typeof warning === "string" ? warning : warning?.message ?? "";
    if (/Module type of file|MODULE_TYPELESS_PACKAGE_JSON|Type Stripping|stripping types/i.test(`${text} ${rest.join(" ")}`)) return;
    return original.call(process, warning, ...rest);
  };
  try {
    return await import(path.join(ROOT, rel));
  } finally {
    process.emitWarning = original;
  }
}

const census = await importQuiet("components/errors/__tests__/error-display-census.ts");
const carriers = await importQuiet("components/errors/__tests__/error-census-carriers.ts");

// The component index (which components draw the menu themselves) is cached
// on disk, one entry per file keyed by its mtime + size: a warm lint re-reads
// only the files that changed since the last run (RC-B12: 35 s → under 2 s).
const CACHE_FILE = path.join(ROOT, "node_modules/.cache/matrx-error-census/facts.json");
const fns = { componentFacts: census.componentFacts, carriersFromFacts: census.carriersFromFacts };

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(cache) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, CACHE_FILE);
  } catch {
    // A cache that cannot be written only costs time on the next run.
  }
}

function trackedTsx() {
  try {
    return execSync("git ls-files -co --exclude-standard -- app components features lib", {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1e9,
    })
      .split("\n")
      .filter((rel) => rel.endsWith(".tsx"));
  } catch {
    return [];
  }
}

let resolver = null;
export let lastIndexStats = null;
function treeResolver() {
  if (resolver) return resolver;
  const started = Date.now();
  const { facts, cache, reparsed } = carriers.collectFacts(ROOT, trackedTsx(), fns, readCache());
  if (reparsed > 0) writeCache(cache);
  resolver = carriers.resolverFromFacts(facts, fns);
  lastIndexStats = { files: facts.size, reparsed, ms: Date.now() - started };
  if (process.env.MATRX_ERROR_CENSUS_TIMING === "1") {
    console.error(`[error-render-carries-alchemy] index: ${facts.size} files, ${reparsed} re-read, ${lastIndexStats.ms} ms`);
  }
  return resolver;
}

export const errorRenderCarriesAlchemy = {
  meta: {
    type: "problem",
    docs: {
      description:
        "An error shown in the UI must carry the Alchemy Menu (ErrorNotice, ErrorBox, or <ErrorAlchemyMenu/> in its own box).",
    },
    schema: [],
    messages: {
      softToast:
        "A failure announced with toast.info / toast.message — no error styling and no Alchemy Menu. Use toast.error(…) (it carries the menu); a partial success is toast.warning.",
      doubledStop:
        "A message value is followed by its own full stop here — messages usually end in one, so the screen shows \"try again.. \". Wrap the value: {asClause(value)} from @/lib/text/asClause.",
      uncarried:
        "This {{what}} shows an error without the Alchemy Menu ({{reason}}). Render it through <ErrorNotice …/>, or put <ErrorAlchemyMenu error={…} /> inside this box, on the error's line — never a row of its own. See components/errors/FEATURE.md.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = path.relative(ROOT, filename).split(path.sep).join("/");
    if (rel.startsWith("..") || !census.isCensusScannable(rel)) return {};
    return {
      "Program:exit"() {
        const source = (context.sourceCode ?? context.getSourceCode()).text;
        const fromTree = treeResolver();
        census.setCarryingComponentsResolver((text, name) => {
          const set = new Set(fromTree(text, name));
          for (const own of census.componentsThatCarry(text, name, set)) set.add(own);
          return set;
        });
        let hits = [];
        try {
          hits = census.uncarriedErrorDisplays(source, rel);
        } finally {
          census.setCarryingComponentsResolver(null);
        }
        for (const line of census.findSoftFailureToasts(source, rel)) {
          context.report({ loc: { start: { line, column: 0 }, end: { line, column: 0 } }, messageId: "softToast" });
        }
        for (const line of census.findDoubledStops(source, rel)) {
          context.report({
            loc: { start: { line, column: 0 }, end: { line, column: 0 } },
            messageId: "doubledStop",
          });
        }
        for (const hit of hits) {
          context.report({
            loc: { start: { line: hit.line, column: 0 }, end: { line: hit.line, column: 0 } },
            messageId: "uncarried",
            data: { what: `<${hit.tag}>`, reason: hit.reason },
          });
        }
      },
    };
  },
};

/**
 * matrx/empty-state-needs-read-gate (RC-B12 round 11) — the sibling rule: an
 * empty view ("No tasks found", <VaultEmptyState/>) under a loading check with
 * no failure check says "nothing here" while the read failed. Gate it:
 * <ReadGate status={readStatusOf(read)} …> (components/read-state/ReadGate.tsx),
 * or a failure branch before it (`isError ? <ReadFailure …/> : …`).
 * Round 13 adds two shapes: an `emptyState=` handed to a list/table primitive
 * over read-backed rows without `read=` (the primitive then cannot tell a
 * failed read from an empty one), and a count rendered from a read with no
 * failure check ("0 loaded" over a failed read).
 * Warn severity: the shrink-only burn-down lives in
 * components/errors/__tests__/empty-state-gate.baseline.json.
 */
export const emptyStateNeedsReadGate = {
  meta: {
    type: "problem",
    docs: { description: "An empty view must be unreachable while its read is loading or failed." },
    schema: [],
    messages: {
      ungated:
        "This empty view hangs off a read (a loading check is above it) but nothing above it checks whether the read FAILED — a failed read would say \"nothing here\". Wrap it in <ReadGate status={readStatusOf(read)} …> from @/components/read-state/ReadGate, or add a failure branch first (isError ? <ReadFailure error={error} what=\"…\" /> : …).",
      ungatedProp:
        "This emptyState is handed to a list/table primitive over read-backed rows, but the primitive is not told the read's outcome — a failed read would show the empty state. Pass read={readOf(query, { what: \"…\" })} (ReadOutcome from @/components/read-state/ReadGate) beside it (RC-B12 round 13).",
      ungatedCount:
        "This count comes from a read, and nothing above it checks whether that read FAILED — a failed read renders 0 as if it were the answer. Gate it on the read's failure, or render it through <UntrustedCount value={…} trustworthy={!isError} label=\"…\" /> (@/components/official/stale-data/UntrustedCount) (RC-B12 round 13).",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = path.relative(ROOT, filename).split(path.sep).join("/");
    if (rel.startsWith("..") || !census.isCensusScannable(rel)) return {};
    return {
      "Program:exit"() {
        const source = (context.sourceCode ?? context.getSourceCode()).text;
        for (const line of census.findUngatedEmptyStates(source, rel)) {
          context.report({ loc: { start: { line, column: 0 }, end: { line, column: 0 } }, messageId: "ungated" });
        }
        for (const line of census.findUngatedEmptyStateProps(source, rel)) {
          context.report({ loc: { start: { line, column: 0 }, end: { line, column: 0 } }, messageId: "ungatedProp" });
        }
        for (const line of census.findUngatedCounts(source, rel)) {
          context.report({ loc: { start: { line, column: 0 }, end: { line, column: 0 } }, messageId: "ungatedCount" });
        }
      },
    };
  },
};
