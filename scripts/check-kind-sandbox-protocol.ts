#!/usr/bin/env npx tsx
/**
 * check:kind-sandbox-protocol — a message type the Shape sandbox accepts but
 * nothing tests is an untested hole in the security boundary.
 *
 * THE CLASS. `features/content-ir/sandbox/protocol.ts` holds the two
 * allowlists — what the host will accept from the frame, and what the frame
 * will accept from the host — plus the error types the host maps onto the
 * incident queue. Adding a line to one of those arrays widens the boundary by
 * one message. It is one line to write, it needs no other change to work, and
 * nothing in the build notices. The S6 suites
 * (`sandbox/__tests__/protocol-round-trip.test.tsx` and
 * `protocol-refusals.test.ts`) prove every type that exists TODAY is
 * accepted where it should be and refused where it should not; this guard is
 * what keeps that true for the type somebody adds tomorrow.
 *
 * WHAT IT DOES. Reads the three arrays out of the protocol module, then reads
 * the sandbox test suites. A type that never appears as a string literal in a
 * test file fails the check, by name, with the file to add it to.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: judge the quality of the test. A guard
 * that tried would be guessing; this one answers the question it can answer
 * honestly — "is anyone asserting anything about this message at all?" — and
 * the forcing-function bar for the assertion itself is the reviewer's.
 *
 * Run:  pnpm check:kind-sandbox-protocol
 * Prove it can fail:  pnpm check:kind-sandbox-protocol:self-test
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const PROTOCOL = "features/content-ir/sandbox/protocol.ts";
const TEST_DIR = "features/content-ir/sandbox/__tests__";

/** The arrays that define the boundary's surface. */
const GUARDED_ARRAYS = [
    {
        name: "HOST_MESSAGE_TYPES",
        what: "a message the FRAME will accept from the host",
    },
    {
        name: "FRAME_MESSAGE_TYPES",
        what: "a message the HOST will accept from the frame",
    },
    {
        name: "SANDBOX_ERROR_TYPES",
        what: "an incident type the host files on the author's queue",
    },
] as const;

interface Finding {
    array: string;
    value: string;
    what: string;
}

/**
 * Read one `export const X = [ "a", "b" ] as const;` array out of the source.
 * Parsing the text rather than importing the module keeps this runnable
 * against a COPY of the file, which is what the self-test needs.
 */
export function readTypeArray(source: string, name: string): string[] {
    const start = source.indexOf(`export const ${name}`);
    if (start === -1) {
        throw new Error(
            `${PROTOCOL} no longer exports ${name}. The sandbox boundary moved; ` +
                `update scripts/check-kind-sandbox-protocol.ts to follow it.`,
        );
    }
    const open = source.indexOf("[", start);
    const close = source.indexOf("]", open);
    if (open === -1 || close === -1) {
        throw new Error(`Could not read the ${name} array out of ${PROTOCOL}.`);
    }
    const body = source.slice(open + 1, close);
    return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function testCorpus(dir: string): string {
    return readdirSync(dir)
        .filter((f) => /\.(test|spec)\.tsx?$/.test(f))
        .map((f) => readFileSync(path.join(dir, f), "utf8"))
        .join("\n");
}

export function findUntested(source: string, corpus: string): Finding[] {
    const findings: Finding[] = [];
    for (const { name, what } of GUARDED_ARRAYS) {
        for (const value of readTypeArray(source, name)) {
            if (!corpus.includes(`"${value}"`) && !corpus.includes(`'${value}'`)) {
                findings.push({ array: name, value, what });
            }
        }
    }
    return findings;
}

/**
 * FORCING PROOF. Add a message type to a COPY of the protocol source and show
 * the guard naming it; then show the real source passing. A guard that cannot
 * be demonstrated failing is not a guard.
 */
function selfTest(): void {
    const source = readFileSync(path.join(ROOT, PROTOCOL), "utf8");
    const corpus = testCorpus(path.join(ROOT, TEST_DIR));

    const widened = source.replace(
        '    "matrx:sandbox:dispose",\n] as const;',
        '    "matrx:sandbox:dispose",\n    "matrx:sandbox:evaluate-untested",\n] as const;',
    );
    if (widened === source) {
        console.error(
            "  FAIL  the self-test could not widen HOST_MESSAGE_TYPES — its shape changed.",
        );
        process.exit(1);
    }

    const red = findUntested(widened, corpus);
    const green = findUntested(source, corpus);

    const redCaught = red.some((f) => f.value === "matrx:sandbox:evaluate-untested");
    console.log(
        `  ${redCaught ? "PASS" : "FAIL"}  RED: a type added with no test is caught by name`,
    );
    console.log(
        `  ${green.length === 0 ? "PASS" : "FAIL"}  GREEN: every shipped type has a test (${
            green.length
        } untested)`,
    );
    if (!redCaught || green.length > 0) process.exit(1);
}

function main(): void {
    if (process.argv.includes("--self-test")) {
        selfTest();
        return;
    }

    const source = readFileSync(path.join(ROOT, PROTOCOL), "utf8");
    const corpus = testCorpus(path.join(ROOT, TEST_DIR));
    const findings = findUntested(source, corpus);

    if (findings.length === 0) {
        const counted = GUARDED_ARRAYS.map(
            ({ name }) => `${readTypeArray(source, name).length} ${name}`,
        ).join(", ");
        console.log(
            `✅ Every Shape sandbox message type is asserted somewhere in ${TEST_DIR} (${counted}).`,
        );
        return;
    }

    console.error("\n🚨 A SHAPE SANDBOX MESSAGE TYPE HAS NO TEST\n");
    for (const f of findings) {
        console.error(`  ✗ ${f.value}  (${f.array} — ${f.what})`);
    }
    console.error(
        `\nEach of these widens the sandbox boundary by one message and nothing asserts\n` +
            `anything about it. Add the case to ${TEST_DIR}/protocol-round-trip.test.tsx\n` +
            `(the two real halves over a real port) or protocol-refusals.test.ts (the shared\n` +
            `validator): prove it is accepted where it should be AND refused where it should\n` +
            `not — the wrong instance, over the cap, from the wrong direction.\n`,
    );
    process.exit(1);
}

main();
