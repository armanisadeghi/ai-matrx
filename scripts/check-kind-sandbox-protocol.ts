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

import { execFileSync } from "node:child_process";
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
    // Comments inside the array carry prose in quotes — a doc block explaining
    // why `blocked_resource` exists quotes two sentences, and a naive scan read
    // both as message types. Strip comments before reading the literals.
    const body = source
        .slice(open + 1, close)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
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

/* ────────────────────────────────────────────────────────────────────────────
 * THE GATE PLACES A BODY, IT NEVER PICKS ONE (DD-215)
 *
 * B-95 reported the sandbox gate changing WHICH component an instance
 * rendered, not only where it drew. B-105 proved the resolver never sees the
 * gate — `custom.sandbox_org_components` is read at exactly ONE place, the
 * react-flavor mount, and only chooses between the frame and the in-page
 * compile. That property is the whole reason the rollout is reversible: OFF
 * must be byte-identical to the pre-sandbox path.
 *
 * Nothing in the build enforces it. One `useKindSandboxSettings()` inside the
 * route, the registry, the resolver adapter, or the compile cache would make
 * the gate a SELECTOR — a different component for the same row depending on a
 * setting — and it would look like a reasonable line of code. This guard is
 * what keeps the property true tomorrow.
 * ──────────────────────────────────────────────────────────────────────────── */

const GATE_MODULE = "features/content-ir/react/db-component/useKindSandboxKnob";

/** Everything the gate may legitimately appear in. */
const GATE_READERS_ALLOWED = [
    // THE one mount. The gate chooses the frame or the in-page compile here,
    // AFTER `resolveComponent` has already answered.
    "features/content-ir/react/db-component/DbKindComponentImpl.tsx",
    // The gate itself, and the frame that consumes the ceilings it resolved.
    "features/content-ir/react/db-component/useKindSandboxKnob.ts",
    "features/content-ir/react/db-component/KindSandboxFrame.tsx",
    // This guard, which has to name the symbols it looks for.
    "scripts/check-kind-sandbox-protocol.ts",
] as const;

/** Modules that decide WHICH component renders — the gate must never reach them. */
const SELECTION_PATH_MARKERS = [
    "features/content-ir/registry/",
    "features/content-ir/react/kind-route",
    "features/content-ir/react/partial-kind-route",
    "features/content-ir/react/ensure-kind-renderable",
    "features/content-ir/host/route-env",
    "features/content-ir/react/db-component/dbKindComponentCache",
];

export interface GateLeak {
    file: string;
    why: string;
}

/**
 * PURE, so the self-test can feed it a fabricated offender: which of these
 * files read the sandbox gate without being allowed to?
 */
export function findGateLeaks(files: readonly string[]): GateLeak[] {
    const leaks: GateLeak[] = [];
    for (const file of files) {
        const normalized = file.replace(/\\/g, "/");
        if (normalized.includes("__tests__/") || normalized.endsWith(".test.ts") || normalized.endsWith(".test.tsx")) {
            continue;
        }
        if ((GATE_READERS_ALLOWED as readonly string[]).includes(normalized)) continue;
        const onSelectionPath = SELECTION_PATH_MARKERS.some((m) =>
            normalized.includes(m),
        );
        leaks.push({
            file: normalized,
            why: onSelectionPath
                ? "this module decides WHICH component renders — a gate read here makes the gate a selector"
                : "the gate is read at exactly one mount; a second reader is a second answer",
        });
    }
    return leaks;
}

/** Every tracked file that imports the gate module. */
function gateReaders(): string[] {
    const out = execFileSync(
        "git",
        ["grep", "-l", "-e", "useKindSandboxSettings", "-e", "useKindSandboxEnabled", "-e", "KIND_SANDBOX_KNOB", "--", "*.ts", "*.tsx"],
        { cwd: ROOT, encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
}

function gateSelfTest(): void {
    const real = findGateLeaks(gateReaders());
    const fabricated = findGateLeaks([
        ...gateReaders(),
        "features/content-ir/registry/component-registry.ts",
    ]);
    const redCaught = fabricated.some(
        (l) => l.file === "features/content-ir/registry/component-registry.ts",
    );
    console.log(
        `  ${redCaught ? "PASS" : "FAIL"}  RED: a gate read inside the resolver adapter is caught by name`,
    );
    console.log(
        `  ${real.length === 0 ? "PASS" : "FAIL"}  GREEN: the shipped tree reads the gate only at the one mount (${real.length} leaks)`,
    );
    if (!redCaught || real.length > 0) process.exit(1);
}

function main(): void {
    if (process.argv.includes("--self-test")) {
        selfTest();
        gateSelfTest();
        return;
    }

    const leaks = findGateLeaks(gateReaders());
    if (leaks.length > 0) {
        console.error("\n🚨 THE SHAPE SANDBOX GATE IS BEING READ OUTSIDE ITS ONE MOUNT\n");
        for (const l of leaks) console.error(`  ✗ ${l.file}\n      ${l.why}`);
        console.error(
            `\nThe gate (\`custom.sandbox_org_components\`) decides WHERE an organization's\n` +
                `component draws — never WHICH component draws. The resolver answers first and\n` +
                `answers the same with the gate on or off; only ${GATE_READERS_ALLOWED[0]}\n` +
                `then places that answer in the frame or in the page (DD-215). Move the read\n` +
                `back to that mount, or the same row renders as two different components\n` +
                `depending on a setting — which is the defect B-95 found live.\n` +
                `(The gate module is ${GATE_MODULE}.)\n`,
        );
        process.exit(1);
    }
    console.log(
        `✅ The Shape sandbox gate is read only at the one react-flavor mount (DD-215).`,
    );

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
