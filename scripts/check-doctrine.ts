#!/usr/bin/env tsx
/**
 * Doctrine check — see PRINCIPLES.md (root).
 *
 * Scans staged or branch-diff changes and reports the new types, components,
 * hooks, slices, and coercions introduced. Advisory by default — the goal is
 * to surface the question "did you check whether an existing primitive could
 * have been extended instead?" at the moment a new primitive is being added.
 *
 * Modes:
 *   pnpm check:doctrine               compare against the merge-base of `main`
 *   pnpm check:doctrine --staged      scan staged files only (pre-commit)
 *   pnpm check:doctrine --branch foo  compare against `foo` instead of `main`
 *   pnpm check:doctrine --strict      exit 1 if any red flags found
 *
 * Exit codes:
 *   0  no doctrine red flags
 *   0  red flags found (informational) — unless --strict, in which case 1
 *   2  script error (bad args, git failure)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

interface Args {
    mode: 'staged' | 'branch';
    branch: string;
    strict: boolean;
}

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const args: Args = { mode: 'branch', branch: 'main', strict: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--staged') args.mode = 'staged';
        else if (a === '--strict') args.strict = true;
        else if (a === '--branch') {
            const v = argv[++i];
            if (!v) {
                console.error('--branch requires a value');
                process.exit(2);
            }
            args.branch = v;
        } else if (a === '-h' || a === '--help') {
            console.log(
                'Usage: check-doctrine [--staged | --branch <name>] [--strict]'
            );
            process.exit(0);
        }
    }
    return args;
}

function git(cmd: string): string {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`git command failed: ${cmd}\n${message}`);
        process.exit(2);
    }
}

interface ChangedFile {
    status: 'A' | 'M' | 'R' | 'C' | 'D' | 'T';
    path: string;
}

function listChangedFiles(args: Args): ChangedFile[] {
    const cmd =
        args.mode === 'staged'
            ? 'git diff --cached --name-status --diff-filter=AMRT'
            : `git diff --name-status --diff-filter=AMRT ${args.branch}...HEAD`;
    const raw = git(cmd).trim();
    if (!raw) return [];
    return raw.split('\n').map((line) => {
        const parts = line.split('\t');
        const status = parts[0]?.[0] as ChangedFile['status'];
        const path = parts[parts.length - 1] ?? '';
        return { status, path };
    });
}

function getAddedLines(args: Args, file: string): string[] {
    const cmd =
        args.mode === 'staged'
            ? `git diff --cached --unified=0 -- "${file}"`
            : `git diff --unified=0 ${args.branch}...HEAD -- "${file}"`;
    const diff = git(cmd);
    const added: string[] = [];
    for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
            added.push(line.slice(1));
        }
    }
    return added;
}

function readWholeFile(path: string): string {
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

// ─── Scanners ────────────────────────────────────────────────────────────────

interface Finding {
    file: string;
    line?: number;
    detail: string;
}

interface Report {
    newComponents: Finding[];        // new *.tsx files with default/named exported component
    newHooks: Finding[];             // new use*.ts(x) files
    newTypes: Finding[];             // new exported interface/type declarations in added lines
    coercions: Finding[];            // `as any` and `as unknown as X` introductions
    parallelSlices: Finding[];       // `createSlice(` in unexpected paths (ESLint catches imports, this catches usage)
}

const COMPONENT_FILE_RE = /(?:^|\/)[A-Z][A-Za-z0-9]+\.tsx$/;
const HOOK_FILE_RE = /(?:^|\/)use[A-Z][A-Za-z0-9]*\.tsx?$/;
const TYPE_DECL_RE = /^\s*export\s+(?:interface\s+([A-Z][A-Za-z0-9]*)|type\s+([A-Z][A-Za-z0-9]*)\s*=)/;
const AS_ANY_RE = /\bas\s+any\b/;
const AS_UNKNOWN_AS_RE = /\bas\s+unknown\s+as\s+/;
const CREATE_SLICE_CALL_RE = /\bcreateSlice\s*\(/;

const ALLOWED_SLICE_GLOBS = [
    /^lib\/redux\//,
    /^lib\/sync\//,
    /^features\/[^/]+\/redux\//,
    /^features\/[^/]+\/state\//,
    /^styles\/themes\//,
    /__tests__\//,
    /\.test\.tsx?$/,
];

function isInAllowedSlicePath(file: string): boolean {
    return ALLOWED_SLICE_GLOBS.some((re) => re.test(file));
}

function shouldScan(file: string): boolean {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return false;
    if (file.startsWith('node_modules/')) return false;
    if (file.startsWith('.next/')) return false;
    if (file.endsWith('.d.ts')) return false;
    return true;
}

// Tooling and tests legitimately reference doctrine patterns as text/fixtures
// (this script's own regex; test cases asserting coercion is caught). They
// produce noise without signal, so the coercion / slice scans skip them.
function isToolingOrTest(file: string): boolean {
    if (file.startsWith('scripts/')) return true;
    if (file.includes('__tests__/')) return true;
    if (/\.test\.tsx?$/.test(file)) return true;
    return false;
}

// Strip line comments and the contents of string / template literals so
// pattern matching doesn't trigger on text inside strings or comments.
// Not a full tokenizer — handles single-line cases reliably, which is what
// a per-line diff scan sees.
function stripCommentsAndStrings(line: string): string {
    let out = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        const prev = i > 0 ? line[i - 1] : '';
        if (!inDouble && !inBacktick && c === "'" && prev !== '\\') {
            inSingle = !inSingle;
            continue;
        }
        if (!inSingle && !inBacktick && c === '"' && prev !== '\\') {
            inDouble = !inDouble;
            continue;
        }
        if (!inSingle && !inDouble && c === '`' && prev !== '\\') {
            inBacktick = !inBacktick;
            continue;
        }
        if (!inSingle && !inDouble && !inBacktick && c === '/' && line[i + 1] === '/') {
            break;
        }
        if (inSingle || inDouble || inBacktick) continue;
        out += c;
    }
    return out;
}

function scan(args: Args, files: ChangedFile[]): Report {
    const report: Report = {
        newComponents: [],
        newHooks: [],
        newTypes: [],
        coercions: [],
        parallelSlices: [],
    };

    for (const { status, path: file } of files) {
        if (!shouldScan(file)) continue;
        if (status === 'D') continue;

        // Whole-file scans for ADDED files
        if (status === 'A') {
            if (COMPONENT_FILE_RE.test(file)) {
                report.newComponents.push({ file, detail: 'new component file' });
            }
            if (HOOK_FILE_RE.test(file)) {
                report.newHooks.push({ file, detail: 'new hook file' });
            }
        }

        // Added-line scans (works for both A and M)
        const addedLines = getAddedLines(args, file);
        const skipPatternScans = isToolingOrTest(file);
        addedLines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;

            const typeMatch = TYPE_DECL_RE.exec(line);
            if (typeMatch) {
                const name = typeMatch[1] ?? typeMatch[2];
                if (name) {
                    report.newTypes.push({ file, detail: `export ${name}` });
                }
            }

            if (skipPatternScans) return;
            const code = stripCommentsAndStrings(line);

            if (AS_UNKNOWN_AS_RE.test(code)) {
                report.coercions.push({ file, detail: `\`as unknown as\` cast — ${trimmed.slice(0, 100)}` });
            } else if (AS_ANY_RE.test(code)) {
                report.coercions.push({ file, detail: `\`as any\` cast — ${trimmed.slice(0, 100)}` });
            }

            if (CREATE_SLICE_CALL_RE.test(code) && !isInAllowedSlicePath(file)) {
                report.parallelSlices.push({ file, detail: 'createSlice() call outside canonical slice dirs' });
            }
        });
    }

    return report;
}

// ─── Report ──────────────────────────────────────────────────────────────────

const COLOR = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    red: '\x1b[31m',
};

function hasAnyFindings(r: Report): boolean {
    return (
        r.newComponents.length +
            r.newHooks.length +
            r.newTypes.length +
            r.coercions.length +
            r.parallelSlices.length >
        0
    );
}

function section(title: string, findings: Finding[], guidance: string) {
    if (findings.length === 0) return;
    process.stdout.write(`\n${COLOR.bold}${COLOR.yellow}${title}${COLOR.reset} (${findings.length})\n`);
    for (const f of findings) {
        const loc = f.line ? `:${f.line}` : '';
        process.stdout.write(`  ${COLOR.cyan}${f.file}${loc}${COLOR.reset}  ${COLOR.dim}${f.detail}${COLOR.reset}\n`);
    }
    process.stdout.write(`  ${COLOR.dim}${guidance}${COLOR.reset}\n`);
}

function main() {
    const args = parseArgs();
    const files = listChangedFiles(args);

    if (files.length === 0) {
        process.stdout.write(`${COLOR.green}Doctrine check: no changed files.${COLOR.reset}\n`);
        return 0;
    }

    process.stdout.write(
        `${COLOR.bold}Doctrine check${COLOR.reset} ${COLOR.dim}(${args.mode}${args.mode === 'branch' ? ` vs ${args.branch}` : ''}, ${files.length} files)${COLOR.reset}\n`
    );
    process.stdout.write(`${COLOR.dim}See PRINCIPLES.md — the artifact is disposable; the platform is the product.${COLOR.reset}\n`);

    const report = scan(args, files);

    section(
        'New components introduced',
        report.newComponents,
        'Confirm none duplicate a component in components/official/ or components/ui/. Registry: /administration/official-components. (Anti-pattern #2.)'
    );

    section(
        'New hooks introduced',
        report.newHooks,
        'Confirm none duplicate a hook in hooks/, lib/hooks/, or features/*/hooks/. Extend an existing hook with an option before forking. (Anti-pattern #4.)'
    );

    section(
        'New exported types',
        report.newTypes,
        'Confirm the shape is not already in types/database.types.ts, types/, features/files/handler/types.ts, features/agents/types/, or a feature types.ts. Coercion (`as`, `as any`) to make a local type fit is a doctrine violation. (Anti-pattern #1.)'
    );

    section(
        'Type coercions',
        report.coercions,
        '`as any` and `as unknown as X` are doctrine violations. If the types don\'t line up, either extend the canonical type or write a typed adapter. (Anti-pattern #1.)'
    );

    section(
        'Parallel createSlice calls',
        report.parallelSlices,
        'createSlice() must live in lib/redux/**, features/*/redux/**, or features/*/state/**. Extend an existing slice rather than spinning up a parallel one. (Anti-pattern #3.) (ESLint catches the import; this catches dynamic-import / programmatic use.)'
    );

    const found = hasAnyFindings(report);
    process.stdout.write('\n');

    if (!found) {
        process.stdout.write(`${COLOR.green}Doctrine check: clean.${COLOR.reset}\n`);
        return 0;
    }

    if (args.strict) {
        process.stdout.write(
            `${COLOR.red}${COLOR.bold}Doctrine check: red flags found (--strict).${COLOR.reset} Re-read PRINCIPLES.md before proceeding.\n`
        );
        return 1;
    }
    process.stdout.write(
        `${COLOR.yellow}Doctrine check: review the items above and confirm extension was considered before creation.${COLOR.reset}\n` +
            `${COLOR.dim}Pass --strict to fail on any red flags.${COLOR.reset}\n`
    );
    return 0;
}

process.exit(main());
