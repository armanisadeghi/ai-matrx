/**
 * THE DETECTOR behind `pnpm check:campaign-entry-points` — pure, side-effect
 * free, and importable from a Jest test.
 *
 * The CLI lives in `scripts/check-campaign-entry-points.ts`; everything that
 * decides what is a finding lives here, so the test suite over the campaign
 * switch (`lib/knobs/unifiedDataCampaign.test.ts`) exercises the SAME code the
 * release gate runs, rather than a second copy of the rules that can drift.
 *
 * Nothing in this module reads the filesystem root, the environment, or
 * `import.meta`: the repo root is always a parameter.
 *
 * WHY AST, NOT REGEX. Every candidate is parsed with the TypeScript compiler
 * and the facts are read off the tree — `ImportDeclaration` / `ExportDeclaration`
 * specifiers, `import()` / `require()` calls, and `.from("<table>")` calls with
 * a string-literal argument. A regex over raw source cannot tell an import from
 * the same characters inside a comment or a string, and this repo has already
 * watched a comment be reworded to dodge a guard (check:signout-scope had to
 * blank comments and strings for exactly that reason). Import specifiers are
 * RESOLVED before they are judged, so `"./lib/migration-target"`,
 * `"../lib/migration-target"` and `"@/scripts/lib/migration-target"` are one
 * fact rather than three spellings to enumerate.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

import {
    CAMPAIGN_MODULES,
    CAMPAIGN_STORE_TABLES,
    type CampaignEntryPoint,
} from "../../lib/knobs/unifiedDataCampaign.register";

/**
 * Files that talk about the campaign in order to POLICE it. Gating a guard on
 * the thing it guards is a guard that stops guarding, so these are the only
 * files allowed to reach campaign names without a register entry.
 */
export const GUARDS_AND_TESTS = new Set([
    "lib/knobs/unifiedDataCampaign.ts",
    "lib/knobs/unifiedDataCampaign.test.ts",
    "lib/knobs/unifiedDataCampaign.register.ts",
    "scripts/check-campaign-entry-points.ts",
    "scripts/lib/campaign-entry-points.ts",
]);

export interface Reach {
    /** Repo-relative file. */
    file: string;
    /** What it reached: a campaign module, or a campaign store table. */
    what: string;
    /** `import` | `store` */
    how: "import" | "store";
    line: number;
}

export interface Violation {
    file: string;
    message: string;
}

/** Resolve a module specifier to a repo-relative path, or null if unresolvable. */
function resolveSpecifier(spec: string, fromFile: string, repoRoot: string): string | null {
    if (spec.startsWith("@/")) return spec.slice(2);
    if (spec.startsWith(".")) {
        const abs = path.resolve(repoRoot, path.dirname(fromFile), spec);
        return path.relative(repoRoot, abs);
    }
    return null;
}

/** The one place the campaign's names are matched. */
function campaignModuleHit(resolved: string): string | null {
    const normalised = resolved.replace(/\\/g, "/");
    for (const mod of CAMPAIGN_MODULES) {
        if (normalised === mod || normalised.startsWith(mod)) return mod;
    }
    return null;
}

/** Read every campaign reach out of ONE file's syntax tree. */
export function scanSource(source: string, file: string, repoRoot: string): Reach[] {
    const reaches: Reach[] = [];
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    const lineOf = (node: ts.Node) =>
        sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    const noteSpecifier = (spec: string, node: ts.Node) => {
        const resolved = resolveSpecifier(spec, file, repoRoot);
        if (!resolved) return;
        const hit = campaignModuleHit(resolved);
        if (hit) reaches.push({ file, what: hit, how: "import", line: lineOf(node) });
    };

    const walk = (node: ts.Node): void => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            noteSpecifier(node.moduleSpecifier.text, node);
        } else if (ts.isImportEqualsDeclaration(node) &&
            ts.isExternalModuleReference(node.moduleReference) &&
            ts.isStringLiteral(node.moduleReference.expression)) {
            noteSpecifier(node.moduleReference.expression.text, node);
        } else if (ts.isCallExpression(node)) {
            const arg0 = node.arguments[0];
            // dynamic import() and require()
            if (arg0 && ts.isStringLiteral(arg0) &&
                (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                    (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
                noteSpecifier(arg0.text, node);
            }
            // `.from("custom_record")` — reach into the campaign store.
            if (arg0 && ts.isStringLiteral(arg0) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === "from" &&
                (CAMPAIGN_STORE_TABLES as readonly string[]).includes(arg0.text)) {
                reaches.push({ file, what: arg0.text, how: "store", line: lineOf(node) });
            }
        }
        ts.forEachChild(node, walk);
    };
    walk(sf);
    return reaches;
}

/** Cheap pre-filter: nothing to parse if none of the names appear at all. */
const NEEDLES = [...CAMPAIGN_MODULES.map((m) => m.split("/").pop()!), ...CAMPAIGN_STORE_TABLES];
export function mightReach(source: string): boolean {
    return NEEDLES.some((n) => source.includes(n));
}

/** THE JUDGEMENT. Given the reaches found and the register, what is wrong? */
export function judge(
    reaches: Reach[],
    entries: readonly CampaignEntryPoint[],
    repoRoot: string,
    exempt: ReadonlySet<string> = GUARDS_AND_TESTS,
): Violation[] {
    const violations: Violation[] = [];
    const registered = new Map(entries.map((e) => [e.file, e]));

    // 1. Unregistered reach — the failure ATTACK-4 named.
    const byFile = new Map<string, Reach[]>();
    for (const r of reaches) {
        if (exempt.has(r.file)) continue;
        if (!byFile.has(r.file)) byFile.set(r.file, []);
        byFile.get(r.file)!.push(r);
    }
    for (const [file, rs] of [...byFile].sort()) {
        if (registered.has(file)) continue;
        const detail = rs
            .map((r) => `line ${r.line}: ${r.how === "import" ? "imports" : "reads"} ${r.what}`)
            .join("; ");
        violations.push({
            file,
            message:
                `reaches campaign code but is NOT in ENTRY_POINTS (${detail}). ` +
                `Register it in lib/knobs/unifiedDataCampaign.ts with a kind and a reason — ` +
                `and if it is code the app serves, kind "runtime", which must also call ` +
                `UNIFIED_DATA_CAMPAIGN.enabled().`,
        });
    }

    // 2. The register must describe reality.
    for (const entry of entries) {
        const abs = path.resolve(repoRoot, entry.file);
        if (!existsSync(abs)) {
            violations.push({ file: entry.file, message: `${entry.id}: registered file does not exist.` });
            continue;
        }
        if (!entry.why || entry.why.trim().length < 10) {
            violations.push({ file: entry.file, message: `${entry.id}: registered with no reason.` });
        }
        const src = readFileSync(abs, "utf8");
        const gated = /UNIFIED_DATA_CAMPAIGN\.enabled\s*\(/.test(src);
        if (entry.kind === "runtime" && !gated) {
            violations.push({
                file: entry.file,
                message:
                    `${entry.id}: kind "runtime" but never calls UNIFIED_DATA_CAMPAIGN.enabled() — ` +
                    `this code ships to users on any lane's release commit with the switch bypassed.`,
            });
        }
        // A RED TWIN is the one non-runtime kind that MAY call the gate: wiring the
        // gate wrongly on purpose is the whole of what it does. It is held to its
        // name instead — a file that does not end `.red.test.ts(x)` cannot claim the
        // word, so "red_twin" can never be used to walk served code past the
        // `runtime` rule above.
        if (entry.kind === "red_twin" && !/\.red\.test\.tsx?$/.test(entry.file)) {
            violations.push({
                file: entry.file,
                message:
                    `${entry.id}: registered "red_twin" but is not named like one. ` +
                    `A red twin's file must end ".red.test.ts" or ".red.test.tsx" — that ` +
                    `name is what keeps this kind from becoming a way to ship ungated ` +
                    `runtime code.`,
            });
        }
        if (entry.kind !== "runtime" && entry.kind !== "red_twin" && gated) {
            violations.push({
                file: entry.file,
                message:
                    `${entry.id}: registered "${entry.kind}" but calls the gate. ` +
                    `Either it is runtime code (change the kind), or it is a deliberately ` +
                    `wrong-wired test (kind "red_twin"), or the gate does not belong here.`,
            });
        }
    }
    return violations;
}


/** Scan a list of repo-relative files. Unreadable files are skipped, never guessed at. */
export function scanFiles(files: string[], repoRoot: string): Reach[] {
    const reaches: Reach[] = [];
    for (const file of files) {
        let source: string;
        try {
            source = readFileSync(path.resolve(repoRoot, file), "utf8");
        } catch {
            continue;
        }
        if (!mightReach(source)) continue;
        reaches.push(...scanSource(source, file, repoRoot));
    }
    return reaches;
}
