/**
 * GUARD 5 — ONE RECORD CARD (KINDS-GLUE wave 3 §7.2). `check:shapes --gate=one-record-card`.
 *
 * A record of a Table (`table:<uuid>`) draws as ONE card in a chat, a note and the in-app
 * canvas. Three legs, each red on its own plant:
 *
 *  (a) RENDERER: from the three render roots (`block-dispatch.tsx`, `KindValueRenderImpl.tsx`,
 *      `artifact-renderers.tsx`), walk every local import (static, `import()`, `lazy`) and fail on
 *      any reachable file — other than `PlatformRecordBlock.tsx` and `use-table-record.ts` — that
 *      imports a record drawer (`RecordValue`, `renderValue`, `cardWords`, `cardTitleField`) FROM
 *      `@ai-matrx/records-ui`. Keyed on the import source, never a bare name: `YamlBlock.tsx`,
 *      `buildRecordColumns.tsx` and `ContentIrHostBoundary.tsx` have their own `renderValue`.
 *  (b) PLANNER: a `table:` value leads to the `kind_value` canvas def
 *      (`resolveArtifactDefByKind`), the def is registered with a renderer, and the component
 *      registry carries the `table:` prefix rule to `platform_record`.
 *  (b3) CONTROL KEYS: every `tableRenderSchema(` call is wrapped by `withControlKeyFields(`
 *      (census here; the parse half is `table-kind-control-keys.test.ts`).
 *  (c) REGISTRY: no `content_ir.kind_definition` row starts with `table:` or is the reserved
 *      normalized twin `table_<uuid with _>` — a Table is a kind, never a registry row.
 *
 * Text-level by design (like shape-doctor-extract.ts): the render cluster has import cycles, so
 * the walk reads files; leg (b) imports only the pure artifact registry.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { SHAPE_SOURCE_FILES } from "../../features/content-ir/registry/shape-doctor-extract";
import { resolveArtifactDefByKind } from "../../features/canvas/artifact-types/artifact-type-registry";

export const ONE_RECORD_CARD_CODE = "one-record-card";

const DRAWERS = ["RecordValue", "renderValue", "cardWords", "cardTitleField"] as const;
const ALLOWED = new Set([
  "components/mardown-display/blocks/result-kinds/PlatformRecordBlock.tsx",
  "components/mardown-display/blocks/result-kinds/use-table-record.ts",
]);
export const RENDER_ROOTS = [
  SHAPE_SOURCE_FILES.blockDispatch.path,
  "components/official/structured-value/KindValueRenderImpl.tsx",
  "features/canvas/artifact-types/artifact-renderers.tsx",
];

const SAMPLE_TABLE_KIND = "table:3f0c2a9e-5b1d-4c7e-9a2f-6d8e1b4c0a71";
const RESERVED_TWIN = /^table_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/;

export interface OneRecordCardFinding {
  severity: "red";
  code: typeof ONE_RECORD_CARD_CODE;
  kind?: string;
  message: string;
}

const IMPORT_SPEC = /(?:import|export)\s+(?:type\s+)?(?:[^;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolveLocal(root: string, from: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = resolve(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  if (!base) return null;
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** The named imports a file takes from `@ai-matrx/records-ui` (any subpath). */
export function recordsUiDrawerImports(text: string): string[] {
  const found: string[] = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@ai-matrx\/records-ui(?:\/[^"']*)?["']/g;
  for (const match of text.matchAll(re)) {
    const names = match[1]!
      .split(",")
      .map((part) => part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim())
      .filter(Boolean);
    for (const name of names) if ((DRAWERS as readonly string[]).includes(name)) found.push(name);
  }
  return found;
}

/** Leg (a): every reachable second drawer of a record. */
export function checkRendererLeg(root: string, roots: readonly string[] = RENDER_ROOTS): OneRecordCardFinding[] {
  const findings: OneRecordCardFinding[] = [];
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const rel of roots) {
    const abs = resolve(root, rel);
    if (!existsSync(abs)) {
      findings.push({
        severity: "red",
        code: ONE_RECORD_CARD_CODE,
        message: `render root ${rel} is missing — the one-record-card walk is blind; update scripts/shape/one-record-card.ts`,
      });
      continue;
    }
    queue.push(abs);
  }
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file);
    const drawers = recordsUiDrawerImports(text);
    if (drawers.length > 0 && !ALLOWED.has(rel)) {
      findings.push({
        severity: "red",
        code: ONE_RECORD_CARD_CODE,
        message: `${rel} draws a record with ${drawers.join(", ")} from @ai-matrx/records-ui and is reachable from a kind render root — a record has ONE card (PlatformRecordBlock); route it there instead of a second renderer`,
      });
    }
    for (const match of text.matchAll(IMPORT_SPEC)) {
      const spec = match[1] ?? match[2];
      if (!spec) continue;
      const next = resolveLocal(root, file, spec);
      if (next && !seen.has(next) && !next.includes("/node_modules/") && !/\.(test|spec)\.tsx?$/.test(next)) queue.push(next);
    }
  }
  return findings;
}

/** Leg (b): a `table:` value leads to the `kind_value` def; the component registry routes the prefix. */
export function checkPlannerLeg(root: string): OneRecordCardFinding[] {
  const findings: OneRecordCardFinding[] = [];
  const def = resolveArtifactDefByKind(SAMPLE_TABLE_KIND);
  if (def?.canvasType !== "kind_value") {
    findings.push({
      severity: "red",
      code: ONE_RECORD_CARD_CODE,
      kind: SAMPLE_TABLE_KIND,
      message: `resolveArtifactDefByKind("${SAMPLE_TABLE_KIND}") answered ${def ? `"${def.canvasType}"` : "nothing"} — a table record must open in the canvas as "kind_value" (the table: prefix rule in features/canvas/artifact-types/artifact-type-registry.ts)`,
    });
  }
  const renderers = readFileSync(resolve(root, "features/canvas/artifact-types/artifact-renderers.tsx"), "utf8");
  if (!/\bkind_value:\s*KindValueArtifact\b/.test(renderers)) {
    findings.push({
      severity: "red",
      code: ONE_RECORD_CARD_CODE,
      message: "artifact-renderers.tsx has no kind_value: KindValueArtifact entry — the canvas cannot draw a kind value",
    });
  }
  const components = readFileSync(resolve(root, "features/content-ir/registry/component-registry.ts"), "utf8");
  if (!/if\s*\(isTableKind\(kind\)\)\s*return\s+super\.resolve\(TABLE_KIND_COMPONENT/.test(components)) {
    findings.push({
      severity: "red",
      code: ONE_RECORD_CARD_CODE,
      message: "component-registry.ts lost its table: prefix rule — a table record would never reach PlatformRecordBlock",
    });
  }
  return findings;
}

/** Leg (c): no registry row is a table kind. */
export function checkRegistryLeg(kindSlugs: readonly string[]): OneRecordCardFinding[] {
  return kindSlugs
    .filter((slug) => slug.startsWith("table:") || RESERVED_TWIN.test(slug))
    .map((slug) => ({
      severity: "red" as const,
      code: ONE_RECORD_CARD_CODE,
      kind: slug,
      message: `content_ir.kind_definition row "${slug}" is a table kind — a Table is a kind answered from its Fields, never a registry row; archive the row`,
    }));
}

/**
 * Leg (b3) census: every `tableRenderSchema(` call in the app is wrapped by
 * `withControlKeyFields(` — records cannot add the control keys itself (design §2.4a). The parse
 * half of (b3) is `features/content-ir/__tests__/table-kind-control-keys.test.ts`.
 */
export function checkControlKeyWrapLeg(root: string, dirs: readonly string[] = WRAP_CENSUS_DIRS): OneRecordCardFinding[] {
  const findings: OneRecordCardFinding[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        const calls = (text.match(/\btableRenderSchema\s*\(/g) ?? []).length;
        const wrapped = (text.match(/\bwithControlKeyFields\s*\(\s*tableRenderSchema\s*\(/g) ?? []).length;
        if (calls > wrapped) {
          findings.push({
            severity: "red",
            code: ONE_RECORD_CARD_CODE,
            message: `${relative(root, full)} calls tableRenderSchema ${calls - wrapped} time(s) outside withControlKeyFields( — a reference or a batch would lose _record_id / _records to residue`,
          });
        }
      }
    }
  };
  for (const dir of dirs) walk(resolve(root, dir));
  return findings;
}

const WRAP_CENSUS_DIRS = ["app", "components", "features", "lib", "packages", "hooks", "utils", "providers"];

export function checkOneRecordCard(root: string, kindSlugs: readonly string[]): OneRecordCardFinding[] {
  return [
    ...checkRendererLeg(root),
    ...checkPlannerLeg(root),
    ...checkControlKeyWrapLeg(root),
    ...checkRegistryLeg(kindSlugs),
  ];
}
