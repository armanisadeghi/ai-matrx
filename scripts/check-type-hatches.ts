#!/usr/bin/env tsx
/**
 * Type-escape-hatch ratchet — see TYPESCRIPT_STANDARDS.md §3 + docs/upgrades/README.md.
 *
 * The escape hatches agents use to dodge the type system (`any`, `as any`,
 * `as unknown as`, ts-directives, …) are sometimes legitimate and sometimes
 * cheating — legitimacy is contextual, so a blunt lint `error` is wrong. The
 * honest gate is a RATCHET: freeze the current whole-repo count per category in
 * `scripts/type-escape-baseline.json`, then fail if any category GROWS. Existing
 * debt is allowed; new debt is not. As waves grind a category down, re-freeze
 * (`--update`) — the baseline only ever ratchets toward zero. When a category
 * hits 0 it graduates to a hard ESLint `error` and leaves this script.
 *
 * Modes:
 *   pnpm check:hatches              count repo-wide, diff vs baseline (advisory)
 *   pnpm check:hatches --strict     exit 1 if ANY category grew (CI gate)
 *   pnpm check:hatches --update     re-freeze the baseline to current counts
 *   pnpm check:hatches <path>       LIST every occurrence under <path>, grouped
 *                                   by category (dispatch a fix agent per path)
 *
 * Counting is comment/string-aware for cast categories (so `as any` inside a
 * string/comment doesn't count); ts-directives are counted on the raw line
 * (they LIVE in comments). Tracked .ts/.tsx only — generated types, .d.ts,
 * node_modules, .next, scripts, and tests are excluded.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "scripts", "type-escape-baseline.json");

// ─── Categories ──────────────────────────────────────────────────────────────
// `raw` patterns are matched on the un-stripped line (ts-directives live in
// comments); the rest are matched on the comment/string-stripped code.
interface Category {
    key: string;
    label: string;
    re: RegExp;
    raw?: boolean;
}

const CATEGORIES: Category[] = [
    { key: "anyAnnotation", label: ": any", re: /:\s*any\b/g },
    { key: "asAny", label: "as any", re: /\bas\s+any\b/g },
    { key: "asUnknownAs", label: "as unknown as", re: /\bas\s+unknown\s+as\b/g },
    { key: "angleAny", label: "<any>", re: /<any>/g },
    { key: "recordAny", label: "Record<string, any>", re: /Record<\s*string\s*,\s*any\s*>/g },
    { key: "tsIgnore", label: "@ts-ignore", re: /@ts-ignore\b/g, raw: true },
    { key: "tsNocheck", label: "@ts-nocheck", re: /@ts-nocheck\b/g, raw: true },
    { key: "tsExpectError", label: "@ts-expect-error", re: /@ts-expect-error\b/g, raw: true },
    // Silent-coercion hatches (TYPESCRIPT_STANDARDS.md §1.5 "fail loud at the
    // boundary") — the strictNullChecks-era cheats the cast categories miss.
    // `!` postfix assertion: word/)/] before the !, then a follower that only an
    // assertion has (`.`, `)`, `,`, `;`, `:`, `]`, `}`) — the follower whitelist
    // keeps JSX prose ("Done!") from counting.
    { key: "nonNullAssert", label: "value! assertion", re: /[\w)\]]!(?=[.,);:\]}])/g },
    { key: "nullishEmptyObject", label: "?? {}", re: /\?\?\s*\{\}/g },
    { key: "orEmptyObject", label: "|| {}", re: /\|\|\s*\{\}/g },
    // `|| []` only — `?? []` after an error-guard is the canonical Supabase
    // empty-result read (type-safety skill, supabase-patterns.md) and stays legal.
    { key: "orEmptyArray", label: "|| []", re: /\|\|\s*\[\]/g },
    // String-default coercion: quotes are stripped from `code`, so match raw.
    { key: "nullishEmptyString", label: '?? ""', re: /\?\?\s*(?:""|'')/g, raw: true },
    { key: "orEmptyString", label: '|| ""', re: /\|\|\s*(?:""|'')/g, raw: true },
];

type Counts = Record<string, number>;

interface Baseline {
    _comment: string;
    updated: string;
    counts: Counts;
}

// ─── File selection ────────────────────────────────────────────────────────────
function listFiles(scope?: string): string[] {
    const out = execSync("git ls-files -- '*.ts' '*.tsx'", {
        encoding: "utf8",
        cwd: ROOT,
        maxBuffer: 256 * 1024 * 1024,
    });
    return out
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean)
        .filter((f) => !f.endsWith(".d.ts"))
        .filter((f) => !f.startsWith("scripts/"))
        .filter((f) => !f.includes("__tests__/"))
        .filter((f) => !/\.test\.tsx?$/.test(f))
        .filter((f) => f !== "types/database.types.ts")
        .filter((f) => f !== "types/matrixDb.types.ts")
        .filter((f) => !f.startsWith("types/python-generated/"))
        .filter((f) => (scope ? f === scope || f.startsWith(scope.replace(/\/$/, "") + "/") : true));
}

// Strip line comments + string/template literal contents (mirrors
// check-doctrine.ts) so cast patterns don't match inside strings/comments.
function stripCommentsAndStrings(line: string): string {
    let out = "";
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        const prev = i > 0 ? line[i - 1] : "";
        if (!inDouble && !inBacktick && c === "'" && prev !== "\\") { inSingle = !inSingle; continue; }
        if (!inSingle && !inBacktick && c === '"' && prev !== "\\") { inDouble = !inDouble; continue; }
        if (!inSingle && !inDouble && c === "`" && prev !== "\\") { inBacktick = !inBacktick; continue; }
        if (!inSingle && !inDouble && !inBacktick && c === "/" && line[i + 1] === "/") break;
        if (inSingle || inDouble || inBacktick) continue;
        out += c;
    }
    return out;
}

interface Occurrence {
    file: string;
    line: number;
    category: string;
    snippet: string;
}

function scan(files: string[]): { counts: Counts; occurrences: Occurrence[] } {
    const counts: Counts = Object.fromEntries(CATEGORIES.map((c) => [c.key, 0]));
    const occurrences: Occurrence[] = [];
    for (const file of files) {
        const full = join(ROOT, file);
        if (!existsSync(full)) continue;
        const lines = readFileSync(full, "utf8").split("\n");
        lines.forEach((rawLine, idx) => {
            const code = stripCommentsAndStrings(rawLine);
            for (const cat of CATEGORIES) {
                const target = cat.raw ? rawLine : code;
                const matches = target.match(cat.re);
                if (matches && matches.length > 0) {
                    counts[cat.key] += matches.length;
                    occurrences.push({
                        file,
                        line: idx + 1,
                        category: cat.label,
                        snippet: rawLine.trim().slice(0, 120),
                    });
                }
            }
        });
    }
    return { counts, occurrences };
}

// ─── Output ──────────────────────────────────────────────────────────────────
const C = {
    reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    yellow: "\x1b[33m", green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m",
};

function readBaseline(): Baseline | null {
    if (!existsSync(BASELINE_PATH)) return null;
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

function writeBaseline(counts: Counts): void {
    const baseline: Baseline = {
        _comment:
            "Type-escape-hatch ratchet baseline (TYPESCRIPT_STANDARDS.md §3). Counts only ever ratchet DOWN. Regenerate with `pnpm check:hatches --update` after a wave reduces them. CI gate: `pnpm check:hatches --strict`.",
        updated: new Date().toISOString().slice(0, 10),
        counts,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
}

function main(): void {
    const argv = process.argv.slice(2);
    const strict = argv.includes("--strict");
    const update = argv.includes("--update");
    const scope = argv.find((a) => !a.startsWith("--"));

    // ── Scoped listing mode: dump occurrences for a fix agent ────────────────
    if (scope) {
        const { occurrences } = scan(listFiles(scope));
        if (occurrences.length === 0) {
            console.log(`${C.green}No type-escape hatches under ${scope}.${C.reset}`);
            return;
        }
        console.log(`${C.bold}Type-escape hatches under ${scope} (${occurrences.length}):${C.reset}\n`);
        const byCat = new Map<string, Occurrence[]>();
        for (const o of occurrences) {
            if (!byCat.has(o.category)) byCat.set(o.category, []);
            byCat.get(o.category)!.push(o);
        }
        for (const [cat, list] of byCat) {
            console.log(`${C.yellow}${cat}${C.reset} (${list.length}):`);
            for (const o of list) console.log(`  ${o.file}:${o.line}  ${C.dim}${o.snippet}${C.reset}`);
            console.log("");
        }
        return;
    }

    // ── Count / ratchet mode ─────────────────────────────────────────────────
    const { counts } = scan(listFiles());

    if (update) {
        writeBaseline(counts);
        console.log(`${C.green}Baseline frozen → ${BASELINE_PATH}${C.reset}`);
        for (const cat of CATEGORIES) console.log(`  ${cat.label.padEnd(22)} ${counts[cat.key]}`);
        return;
    }

    const baseline = readBaseline();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    console.log(`${C.bold}Type-escape-hatch ratchet${C.reset}  (total: ${total})\n`);
    console.log(`  category                current  baseline   delta`);
    console.log(`  ----------------------  -------  --------  ------`);

    let grew = false;
    for (const cat of CATEGORIES) {
        const cur = counts[cat.key];
        const base = baseline?.counts[cat.key] ?? cur;
        const delta = cur - base;
        const deltaStr =
            delta > 0 ? `${C.red}+${delta}${C.reset}` :
            delta < 0 ? `${C.green}${delta}${C.reset}` :
            `${C.dim}0${C.reset}`;
        if (delta > 0) grew = true;
        console.log(`  ${cat.label.padEnd(22)}  ${String(cur).padStart(7)}  ${String(base).padStart(8)}  ${deltaStr}`);
    }

    if (!baseline) {
        console.log(`\n${C.yellow}No baseline yet. Freeze one with: pnpm check:hatches --update${C.reset}`);
        return;
    }

    console.log("");
    if (grew) {
        console.log(`${C.red}${C.bold}✗ A type-escape category GREW above baseline.${C.reset}`);
        console.log(`  New escape hatches aren't allowed — model the type, narrow honestly`);
        console.log(`  (see TYPESCRIPT_STANDARDS.md §3 / the type-safety skill / @/types/json).`);
        console.log(`  If a fix legitimately removed AND added in the same category, re-freeze with --update.`);
        if (strict) process.exit(1);
    } else {
        console.log(`${C.green}✓ No growth. (Grind a category to 0 → graduate it to an ESLint error.)${C.reset}`);
    }
}

main();
