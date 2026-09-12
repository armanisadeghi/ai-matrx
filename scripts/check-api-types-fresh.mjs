#!/usr/bin/env node
/**
 * check:api-types-fresh — the committed generated API contract must be exactly
 * what the generator produces from the aidream checkout. No hand edits.
 *
 * THE CASE IT EXISTS FOR (2026-09-12, DD-128). `pnpm sync-types` and the drop
 * guard only see a REGENERATION. Commit `4c827d5530` never ran either: it opened
 * `types/python-generated/api-types.ts` in an editor and DELETED
 * `DirectiveConfirmRequest.conversation_id` (the approve path's idempotency
 * namespace) and `DirectiveConfirmResult.message`, together with the client code
 * that read them. Every guard in the repo stayed green — the type-check was
 * silenced by the same edit that caused the harm, and
 * `pnpm check:generated-contracts` only counts handwritten shadows. Nothing
 * asserted that the generated file still matched the generator. This does.
 *
 * WHAT IT COMPARES, AND WHY THE TWO HALVES DIFFER
 *   • `types/python-generated/openapi.json` — NORMALIZED compare (both documents
 *     parsed, then compared as JSON values, key order included). Not bytes: the
 *     committed file is serialized by Python (`json.dumps(..., ensure_ascii=False,
 *     indent=2)`) while this check re-serializes the same document through Node
 *     for the generator. Escaping and float spelling can differ with no contract
 *     difference at all, and a guard that fails on that teaches people to ignore
 *     it.
 *   • `types/python-generated/api-types.ts` — BYTE-IDENTICAL. It is produced by
 *     exactly one program (`openapi-typescript`) from the document above, so any
 *     byte difference is a hand edit, a contract change, or a generator upgrade.
 *     All three must be SEEN, and the remedy for all three is the same one
 *     command.
 *
 * Usage:
 *   node scripts/check-api-types-fresh.mjs             # RED if the committed files are not fresh
 *   node scripts/check-api-types-fresh.mjs --self-test # proves it can fail: replays 4c827d5530
 *
 * Exit 0 = fresh. Exit 1 = stale or hand-edited. Exit 2 = UNMEASURED (no aidream
 * checkout, no `uv`, no generator) — never a pass.
 *
 * Cost: it emits the real 7 MB schema from the aidream tree and runs the real
 * generator, ~2-3 minutes. That is why it sits in the release gates beside
 * `check:generated-contracts` rather than in a pre-commit hook.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeOpenApiDocument } from './typegen-openapi-normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const AIDREAM_ROOT = resolve(REPO_ROOT, '../aidream');
const COMMITTED_DIR = resolve(REPO_ROOT, 'types/python-generated');
const GENERATOR = resolve(REPO_ROOT, 'node_modules/.bin/openapi-typescript');

/** Exit 2, with a sentence. An unmeasurable check is never a passing check. */
function unmeasured(lines) {
    console.error('\n  ? api-types freshness UNMEASURED — this check could not run.\n');
    for (const line of lines) console.error(`    ${line}`);
    console.error('');
    process.exit(2);
}

/**
 * Emit the contract from the aidream working tree and run it through the same
 * two steps `sync-types` runs. Returns the temp dir holding the reference
 * `openapi.json` (normalized) and `api-types.ts`.
 */
function generateReference() {
    if (!existsSync(AIDREAM_ROOT)) {
        unmeasured([
            `The aidream checkout is not at ${AIDREAM_ROOT}.`,
            'That checkout IS the contract these generated files must match.',
            'Clone it next to this repo, then re-run.',
        ]);
    }
    if (!existsSync(GENERATOR)) {
        unmeasured([
            `openapi-typescript is not installed at ${GENERATOR}.`,
            'Run: pnpm install',
        ]);
    }

    const dir = mkdtempSync(join(tmpdir(), 'matrx-api-types-fresh-'));
    const emitted = join(dir, 'emitted.json');
    try {
        execFileSync('uv', ['run', 'python', 'scripts/emit_openapi.py', '--out', emitted], {
            cwd: AIDREAM_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (error) {
        const detail = [error?.stderr?.toString(), error?.stdout?.toString()]
            .filter(Boolean)
            .join('\n')
            .trim()
            .split('\n')
            .slice(-6);
        unmeasured([
            'The aidream checkout could not emit its schema, so there is nothing to compare against.',
            `Reproduce it: cd ${AIDREAM_ROOT} && uv run python scripts/emit_openapi.py --out /tmp/openapi.json`,
            ...detail,
        ]);
    }

    const document = JSON.parse(readFileSync(emitted, 'utf-8'));
    normalizeOpenApiDocument(document);
    const openapiPath = join(dir, 'openapi.json');
    writeFileSync(openapiPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');

    const apiTypesPath = join(dir, 'api-types.ts');
    execFileSync(GENERATOR, [openapiPath, '--default-non-nullable', 'false', '-o', apiTypesPath], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
    });

    return { dir, openapiPath, apiTypesPath, document };
}

/** The first line where two texts diverge, as a human sentence. */
function firstDifference(expected, actual) {
    const a = expected.split('\n');
    const b = actual.split('\n');
    const limit = Math.max(a.length, b.length);
    for (let i = 0; i < limit; i += 1) {
        if (a[i] === b[i]) continue;
        return {
            line: i + 1,
            expected: a[i] === undefined ? '(the file ends here)' : a[i].trim(),
            actual: b[i] === undefined ? '(the file ends here)' : b[i].trim(),
        };
    }
    return null;
}

/**
 * Compare one directory of committed generated files against the reference.
 * Returns a list of findings (empty = fresh).
 */
export function compareAgainstReference(committedDir, reference) {
    const findings = [];

    const committedOpenApiPath = join(committedDir, 'openapi.json');
    if (!existsSync(committedOpenApiPath)) {
        findings.push({ file: 'openapi.json', what: 'is missing entirely.' });
    } else {
        const committed = JSON.stringify(JSON.parse(readFileSync(committedOpenApiPath, 'utf-8')));
        const expected = JSON.stringify(JSON.parse(readFileSync(reference.openapiPath, 'utf-8')));
        if (committed !== expected) {
            findings.push({
                file: 'openapi.json',
                what: 'does not describe the aidream checkout (compared as JSON values, not bytes).',
                schemas: schemaLevelDifferences(
                    JSON.parse(readFileSync(reference.openapiPath, 'utf-8')),
                    JSON.parse(readFileSync(committedOpenApiPath, 'utf-8')),
                ),
            });
        }
    }

    const committedTypesPath = join(committedDir, 'api-types.ts');
    if (!existsSync(committedTypesPath)) {
        findings.push({ file: 'api-types.ts', what: 'is missing entirely.' });
    } else {
        const expected = readFileSync(reference.apiTypesPath, 'utf-8');
        const actual = readFileSync(committedTypesPath, 'utf-8');
        if (expected !== actual) {
            findings.push({
                file: 'api-types.ts',
                what: 'is not byte-identical to what the generator produces.',
                difference: firstDifference(expected, actual),
            });
        }
    }

    return findings;
}

/**
 * Which schemas lost or gained properties — the shape of the difference a reader
 * actually needs, instead of "1746 lines differ".
 */
function schemaLevelDifferences(expectedDoc, actualDoc) {
    const expected = expectedDoc?.components?.schemas ?? {};
    const actual = actualDoc?.components?.schemas ?? {};
    const lines = [];
    for (const [name, schema] of Object.entries(expected)) {
        const other = actual[name];
        if (!other) {
            lines.push(`${name} — the committed file does not have this schema at all`);
            continue;
        }
        const expectedProps = Object.keys(schema?.properties ?? {});
        const actualProps = new Set(Object.keys(other?.properties ?? {}));
        const missing = expectedProps.filter((p) => !actualProps.has(p));
        if (missing.length > 0) {
            lines.push(`${name} — the committed file is missing: ${missing.join(', ')}`);
        }
    }
    return lines.slice(0, 20);
}

function report(findings) {
    if (findings.length === 0) {
        console.log('  ✓ api-types fresh: the committed generated contract is exactly what the aidream checkout produces.\n');
        return 0;
    }

    console.error('\n  ✗ THE COMMITTED GENERATED API CONTRACT IS NOT WHAT THE GENERATOR PRODUCES.\n');
    for (const finding of findings) {
        console.error(`    • types/python-generated/${finding.file} ${finding.what}`);
        for (const line of finding.schemas ?? []) console.error(`        ${line}`);
        if (finding.difference) {
            console.error(`        first difference at line ${finding.difference.line}:`);
            console.error(`          the generator produces: ${finding.difference.expected}`);
            console.error(`          the committed file has: ${finding.difference.actual}`);
        }
    }
    console.error('\n    Either the aidream checkout moved on, or someone EDITED a generated file by hand.');
    console.error('    One command fixes both:  pnpm sync-types\n');
    console.error('    🚨 A generated file is never hand-edited. On 2026-09-12 commit 4c827d5530 hand-deleted');
    console.error('       DirectiveConfirmRequest.conversation_id from api-types.ts together with the client');
    console.error('       code that read it, and every other guard stayed green — so a second Approve wrote a');
    console.error('       second project (DD-128). This check is the one that would have spoken.\n');
    return 1;
}

/**
 * FORCING FUNCTION. Replays the exact 2026-09-12 hand edit into a scratch copy
 * of the committed files and requires this check to refuse it, then requires the
 * untouched committed files to pass. Both directions, one emit.
 */
function selfTest(reference) {
    let failures = 0;
    const assert = (ok, label) => {
        console.log(`  ${ok ? '✓' : '✗'} ${label}`);
        if (!ok) failures += 1;
    };

    // GREEN: the tree as committed.
    const atHead = compareAgainstReference(COMMITTED_DIR, reference);
    assert(atHead.length === 0, 'GREEN at HEAD: the committed generated files are fresh');
    for (const finding of atHead) {
        console.log(`      ${finding.file} ${finding.what}`);
        for (const line of finding.schemas ?? []) console.log(`        ${line}`);
        if (finding.difference) console.log(`        line ${finding.difference.line}: ${finding.difference.actual}`);
    }

    // RED: 4c827d5530's two hand edits, replayed in a scratch copy.
    const scratch = mkdtempSync(join(tmpdir(), 'matrx-api-types-handedit-'));
    try {
        copyFileSync(join(COMMITTED_DIR, 'openapi.json'), join(scratch, 'openapi.json'));
        copyFileSync(join(COMMITTED_DIR, 'api-types.ts'), join(scratch, 'api-types.ts'));

        // Edit 1 — api-types.ts, exactly as 4c827d5530 did it: delete the
        // conversation_id and message declarations, doc comments included.
        const types = readFileSync(join(scratch, 'api-types.ts'), 'utf-8');
        const handEdited = types
            .replace(
                /\n *\/\*\*\n *\* Conversation Id\n(?: *\*.*\n)* *\*\/\n *conversation_id\?: string \| null;/,
                '',
            )
            .replace(/\n *\/\*\*\n *\* Message\n(?: *\*.*\n)* *\*\/\n *message: string;/, '');
        if (handEdited === types) {
            console.log('  ✗ the replay could not find the declarations to delete — the fixture drifted.');
            failures += 1;
        }
        writeFileSync(join(scratch, 'api-types.ts'), handEdited, 'utf-8');

        // Edit 2 — the same two properties out of openapi.json, which is what
        // poisoned the drop guard's baseline for the rest of the night.
        const doc = JSON.parse(readFileSync(join(scratch, 'openapi.json'), 'utf-8'));
        delete doc.components.schemas.DirectiveConfirmRequest.properties.conversation_id;
        delete doc.components.schemas.DirectiveConfirmResult.properties.message;
        writeFileSync(join(scratch, 'openapi.json'), `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');

        const findings = compareAgainstReference(scratch, reference);
        assert(findings.length === 2, 'RED: both hand-edited generated files are refused');
        const schemaLines = (findings.find((f) => f.file === 'openapi.json')?.schemas ?? []).join(' | ');
        assert(
            schemaLines.includes('DirectiveConfirmRequest') && schemaLines.includes('conversation_id'),
            'RED: the refusal names DirectiveConfirmRequest.conversation_id by name',
        );
        assert(
            schemaLines.includes('DirectiveConfirmResult') && schemaLines.includes('message'),
            'RED: the refusal names DirectiveConfirmResult.message by name',
        );
        assert(
            Boolean(findings.find((f) => f.file === 'api-types.ts')?.difference),
            'RED: the api-types.ts refusal points at the first line that differs',
        );
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }

    console.log(failures === 0 ? '\n  ✓ check-api-types-fresh self-test passed.\n' : `\n  ✗ ${failures} self-test assertion(s) failed.\n`);
    return failures === 0 ? 0 : 1;
}

function main() {
    const selfTestMode = process.argv.includes('--self-test');
    console.log(
        selfTestMode
            ? '\n  check:api-types-fresh — self-test (replaying the 2026-09-12 hand edit)\n'
            : '\n  check:api-types-fresh — regenerating the contract from the aidream checkout to compare...\n',
    );

    const reference = generateReference();
    let code;
    try {
        code = selfTestMode ? selfTest(reference) : report(compareAgainstReference(COMMITTED_DIR, reference));
    } finally {
        // Before process.exit — a finally never runs after it.
        rmSync(reference.dir, { recursive: true, force: true });
    }
    process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
