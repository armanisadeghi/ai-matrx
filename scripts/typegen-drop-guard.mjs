#!/usr/bin/env node
/**
 * typegen-drop-guard — a regeneration may never silently DELETE a property the
 * client still reads.
 *
 * THE CASE IT EXISTS FOR (2026-09-12, DD-128). `api-types.ts` was regenerated
 * from the PRODUCTION server while aidream `c64f53507` was still undeployed. The
 * new file therefore lacked `DirectiveConfirmRequest.conversation_id` and
 * `DirectiveConfirmResult.message`. The type-check then failed — correctly — on
 * the client that used them, and the fix went the wrong way: commit `e8782ca26f`
 * DELETED the client's `conversation_id`, which is the approve path's
 * IDEMPOTENCY NAMESPACE, so a second Approve wrote a second project.
 *
 * A type error that says "your code is wrong" when the truth is "the schema you
 * generated from is older than your repo" is the whole defect. This guard speaks
 * FIRST, before the type-check, and says which it is.
 *
 * Usage:
 *   node scripts/typegen-drop-guard.mjs --before <openapi.json> --after <openapi.json>
 *                                       [--root <dir>] [--json]
 *
 * `--root` is the tree whose sources are searched for usages (default: this
 * repo). Exit 0 = no used property was dropped. Exit 1 = one was; nothing is
 * written, and the message names the property, where it lived, and the remedy.
 *
 * A drop that is DELIBERATE is recorded in `scripts/typegen-drop-allowlist.json`
 * with a reason — never by weakening this guard.
 *
 * GRANULARITY, stated plainly: the DROP is decided per declaration site, but the
 * USAGE search matches property NAMES. If `message` disappears from one schema
 * while another schema's `message` is still read, the guard still refuses. That is
 * the safe direction for a contract guard, and the allowlist is the way to say
 * "yes, really". To keep that breadth from burying the real call site, the files
 * and lines it prints are RANKED by the declaring type (`DirectiveConfirmRequest`),
 * so the code that actually breaks is named first.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const ALLOWLIST_PATH = resolve(__dirname, "typegen-drop-allowlist.json");

/** Directories whose contents are generated, vendored or irrelevant to "the client reads it". */
const EXCLUDED_PATHSPECS = [
    ":!types/python-generated",
    ":!types/database.types.ts",
    ":!node_modules",
    ":!.next",
];
const SOURCE_GLOBS = ["*.ts", "*.tsx"];
const MAX_HITS_SHOWN = 5;

function getArg(argv, name, fallback = undefined) {
    const i = argv.indexOf(name);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

/**
 * Every DECLARATION SITE in an OpenAPI document → the property names it declares.
 *
 * 🚨 PER SITE, not a flat set of names. A flat set is useless for this job: on the
 * real 2026-09-12 documents `DirectiveConfirmRequest.conversation_id` and
 * `DirectiveConfirmResult.message` both vanished, yet both NAMES still existed on
 * other schemas, so a name-level diff saw no drop at all. The question is always
 * "did THIS schema lose THIS property", never "does the name still appear
 * somewhere".
 */
export function collectDeclarations(doc) {
    const sites = new Map(); // declaration path -> Set<property name>
    const add = (site, name) => {
        if (typeof name !== "string" || name.length === 0) return;
        if (!sites.has(site)) sites.set(site, new Set());
        sites.get(site).add(name);
    };

    const walk = (node, path) => {
        if (Array.isArray(node)) {
            node.forEach((item, i) => walk(item, `${path}[${i}]`));
            return;
        }
        if (!node || typeof node !== "object") return;

        if (node.properties && typeof node.properties === "object" && !Array.isArray(node.properties)) {
            for (const key of Object.keys(node.properties)) add(path || "(root)", key);
        }
        // Parameters are declared per operation, so the operation is the site.
        if (typeof node.name === "string" && typeof node.in === "string") {
            const operation = path.replace(/\.parameters\[\d+\]$/, "");
            add(`${operation} (${node.in} parameters)`, node.name);
        }
        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") walk(value, path ? `${path}.${key}` : key);
        }
    };

    walk(doc, "");
    return sites;
}

function readAllowlist() {
    if (!existsSync(ALLOWLIST_PATH)) return {};
    const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8"));
    return parsed.allowed_drops ?? {};
}

/**
 * Source lines that read the property as a member (`x.name`) or write it as an
 * object key (`name:`). Deliberately narrow: a bare identifier match would flag
 * every local variable that happens to share the name.
 */
export function findUsages(name, root) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern =
        `(\\.${escaped}($|[^A-Za-z0-9_])` +
        `|(^|[^A-Za-z0-9_.])${escaped}[[:space:]]*:)`;

    const isGitRepo = existsSync(resolve(root, ".git"));
    try {
        const out = isGitRepo
            ? execFileSync(
                  "git",
                  ["grep", "-n", "-I", "-E", pattern, "--", ...SOURCE_GLOBS, ...EXCLUDED_PATHSPECS],
                  { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
              )
            : execFileSync(
                  "grep",
                  ["-rn", "-I", "-E", "--include=*.ts", "--include=*.tsx", pattern, "."],
                  { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
              );
        return out.split("\n").filter(Boolean);
    } catch (error) {
        // grep exits 1 for "no matches" — that is an answer, not a failure.
        if (error && error.status === 1) return [];
        throw error;
    }
}

/**
 * The TYPE NAMES a drop was declared on — `components.schemas.DirectiveConfirmRequest`
 * → `DirectiveConfirmRequest`. This is what turns a name-wide usage list into a
 * pointer at the real call site.
 */
export function declarationTypeNames(sites) {
    const names = new Set();
    for (const site of sites) {
        const match = /components\.schemas\.([A-Za-z0-9_]+)/.exec(site);
        if (match) names.add(match[1]);
    }
    return [...names];
}

/** Files in `root` that mention any of these type names (a cheap file-level index). */
function filesUsingTypes(typeNames, root) {
    const files = new Set();
    for (const typeName of typeNames) {
        const isGitRepo = existsSync(resolve(root, ".git"));
        try {
            const out = isGitRepo
                ? execFileSync(
                      "git",
                      ["grep", "-l", "-I", "-F", typeName, "--", ...SOURCE_GLOBS, ...EXCLUDED_PATHSPECS],
                      { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
                  )
                : execFileSync(
                      "grep",
                      ["-rl", "-I", "-F", "--include=*.ts", "--include=*.tsx", typeName, "."],
                      { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
                  );
            for (const line of out.split("\n").filter(Boolean)) files.add(line.replace(/^\.\//, ""));
        } catch (error) {
            if (!error || error.status !== 1) throw error;
        }
    }
    return files;
}

/**
 * Rank usage hits by the property's DECLARATION TYPE, not by the bare name.
 *
 * 🚨 WHY. `conversation_id` is read on 384 lines of this repo; printing the first
 * five in path order sent the reader to CX-dashboard files that have nothing to
 * do with the drop, while the actual approve call site —
 * `features/matrx-envelope/components/ProposedDirectivesZone.tsx`, which imports
 * `DirectiveConfirmRequest` — was nowhere in the human output (V-26, D-2). A hit
 * in a file that names the declaring type outranks everything else.
 */
export function rankHitsByDeclaringType(hits, typeNames, root) {
    if (typeNames.length === 0) return { hits, files: new Set() };
    const files = filesUsingTypes(typeNames, root);
    const score = (hit) => {
        const file = hit.split(":", 1)[0];
        if (typeNames.some((typeName) => hit.includes(typeName))) return 2;
        return files.has(file) ? 1 : 0;
    };
    const ranked = hits
        .map((hit, index) => ({ hit, index, score: score(hit) }))
        .sort((a, b) => (b.score - a.score) || (a.index - b.index))
        .map((entry) => entry.hit);
    return { hits: ranked, files };
}

export function runDropGuard({ beforePath, afterPath, root = REPO_ROOT }) {
    const before = collectDeclarations(JSON.parse(readFileSync(beforePath, "utf-8")));
    const after = collectDeclarations(JSON.parse(readFileSync(afterPath, "utf-8")));
    const allowlist = readAllowlist();

    // A site that disappeared ENTIRELY is a removed schema or a renamed route: the
    // type-check names that loudly and unambiguously. The silent, dangerous case —
    // the one that cost the approve path its idempotency key — is a site that
    // SURVIVES and quietly loses a property. That is what this guard rules on.
    const dropped = new Map(); // property name -> Set<site it was dropped from>
    for (const [site, names] of before) {
        const stillThere = after.get(site);
        if (!stillThere) continue;
        for (const name of names) {
            if (stillThere.has(name)) continue;
            if (!dropped.has(name)) dropped.set(name, new Set());
            dropped.get(name).add(site);
        }
    }

    const violations = [];
    const unusedDrops = [];
    const allowed = [];

    for (const [name, sites] of dropped) {
        const declaredIn = [...sites];
        if (allowlist[name]) {
            allowed.push({ name, declaredIn, reason: allowlist[name] });
            continue;
        }
        const typeNames = declarationTypeNames(declaredIn);
        const { hits: ranked, files } = rankHitsByDeclaringType(findUsages(name, root), typeNames, root);
        const record = {
            name,
            declaredIn,
            declaringTypes: typeNames,
            // The files this repo has that actually use the declaring type — the
            // call sites a human needs, ahead of every same-named coincidence.
            callSites: [...files],
            hits: ranked,
        };
        if (ranked.length > 0) violations.push(record);
        else unusedDrops.push(record);
    }

    return { dropped: [...dropped.keys()], violations, unusedDrops, allowed };
}

function main() {
    const argv = process.argv.slice(2);
    const beforePath = getArg(argv, "--before");
    const afterPath = getArg(argv, "--after");
    const root = resolve(getArg(argv, "--root", REPO_ROOT));
    const asJson = argv.includes("--json");

    if (!beforePath || !afterPath) {
        console.error("Usage: node scripts/typegen-drop-guard.mjs --before <openapi.json> --after <openapi.json> [--root <dir>]");
        process.exit(2);
    }

    const result = runDropGuard({ beforePath, afterPath, root });

    if (asJson) {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.violations.length > 0 ? 1 : 0);
    }

    for (const { name, reason } of result.allowed) {
        console.log(`  · ${name} was dropped and that is recorded as intended: ${reason}`);
    }
    for (const { name, declaredIn } of result.unusedDrops) {
        console.log(`  · ${name} was dropped (${declaredIn[0]}) and no source file reads it.`);
    }

    if (result.violations.length === 0) {
        console.log("  ✓ typegen drop guard: the new schema drops nothing this repo still reads.\n");
        process.exit(0);
    }

    console.error("\n  ✗ THE NEW SCHEMA IS MISSING PROPERTIES THIS REPO STILL USES.");
    console.error("    The schema you generated from is older than this repo, or the server");
    console.error("    genuinely removed these. Nothing was written.\n");
    for (const { name, declaredIn, declaringTypes, callSites, hits } of result.violations) {
        console.error(`    • "${name}" — was declared at ${declaredIn.join(", ")}`);
        // THE CALL SITES FIRST. These are the files that use the declaring type
        // itself, so they are the code that actually breaks — never a same-named
        // coincidence somewhere else in the repo.
        if (callSites.length > 0) {
            const shown = callSites.slice(0, MAX_HITS_SHOWN);
            console.error(`      the code that uses ${declaringTypes.join(", ")} lives in:`);
            for (const file of shown) console.error(`        ${file}`);
            if (callSites.length > shown.length) {
                console.error(`        …and ${callSites.length - shown.length} more file(s)`);
            }
        }
        // The DROP is per-schema and exact; the USAGE count is a name-wide search of
        // this repo's sources, so it is a ceiling, not a precise blast radius. The
        // lines are ranked so the declaring type's own call sites come first.
        console.error(`      ${hits.length} source line(s) in this repo use that name, closest first:`);
        for (const hit of hits.slice(0, MAX_HITS_SHOWN)) console.error(`        ${hit.trim()}`);
        if (hits.length > MAX_HITS_SHOWN) console.error(`        …and ${hits.length - MAX_HITS_SHOWN} more`);
    }
    console.error("\n    WHAT TO DO — in this order:");
    console.error("      1. Regenerate from the aidream CHECKOUT, which is the contract this repo");
    console.error("         is written against:  pnpm sync-types   (this is now the default).");
    console.error("      2. If you generated from a server, that server is behind the checkout.");
    console.error("         Wait for the deploy train; do not delete the client's use of the field.");
    console.error("      3. If the removal is REAL and intended, record each name with its reason in");
    console.error("         scripts/typegen-drop-allowlist.json, then remove the client code on purpose.\n");
    console.error("    🚨 Deleting the client's use of a field to clear a type error is how the");
    console.error("       approve path lost its idempotency key on 2026-09-12 (DD-128), and a second");
    console.error("       Approve wrote a second project.\n");
    process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
