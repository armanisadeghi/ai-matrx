/**
 * generate-class-safelist — close the Tailwind DATABASE-CLASS GAP (DD-123
 * §1.8) by generation, never by hand.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE GAP, stated exactly. Tailwind v4 emits a utility only when it SCANS a
 * source file containing that class. Organization-authored component bodies
 * are rows in `content_ir.kind_component` — no file, so no scan, so a class an
 * author used that no repo file happens to use produces NO CSS and the
 * component renders unstyled in that respect. This is true of the app's own
 * stylesheet today, and it would be equally true of the sandbox frame's sheet,
 * because both are compiled from `app/globals.css`.
 *
 * WHAT THIS SCRIPT DOES. It reads the live bodies, extracts class candidates
 * with TAILWIND'S OWN EXTRACTOR (`@tailwindcss/oxide`'s `Scanner` — the same
 * code the compiler runs over source files, so the candidate set cannot drift
 * from what Tailwind would have found in a file), compiles the stylesheet
 * twice to learn which candidates actually produce CSS, and writes the ones
 * that do into `generated/db-class-safelist.css` as `@source inline(…)`.
 *
 * WHY IT LANDS IN `app/globals.css` AND NOT ONLY IN THE FRAME'S SHEET. S3's
 * bar is that a framed component looks IDENTICAL to the same component
 * unframed. A safelist only the frame had would make the frame look BETTER
 * than the page — parity broken in the other direction, and a rendering
 * difference nobody could explain. `sandbox.css` imports `app/globals.css`, so
 * importing the generated file there gives both sheets exactly the same
 * utilities, and fixes the page's own long-standing gap in the same stroke.
 *
 *   pnpm gen:kind-sandbox-safelist          regenerate from the live rows
 *   pnpm check:kind-sandbox-safelist        fail if the live rows have moved
 *
 * The artifact carries a FINGERPRINT of the corpus it was generated from (row
 * count + the newest `updated_at` + a hash of the candidate set). The check
 * script re-reads the corpus and compares: when an author saves a body using a
 * class nothing else uses, the check fails and names the regeneration command.
 * That is how it stays current — a generated file with no way to notice it is
 * stale is just a hand-written file with a longer header.
 */
import { createClient } from "@supabase/supabase-js";
import { Scanner } from "@tailwindcss/oxide";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(__dirname, "generated/db-class-safelist.css");
const SANDBOX_CSS = resolve(__dirname, "runtime/sandbox.css");

export interface CorpusFingerprint {
    rows: number;
    newestUpdatedAt: string;
    candidateHash: string;
}

export interface SafelistResult {
    candidates: string[];
    generating: string[];
    alreadyCovered: string[];
    gap: string[];
    fingerprint: CorpusFingerprint;
}

async function loadEnv(): Promise<Record<string, string>> {
    const raw = await readFile(resolve(ROOT, ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
        if (!/^[A-Z0-9_]+=/.test(line)) continue;
        const i = line.indexOf("=");
        out[line.slice(0, i)] = line.slice(i + 1).replace(/^["']|["']$/g, "");
    }
    return out;
}

interface BodyRow {
    component_key: string;
    component_source: string | null;
    updated_at: string | null;
}

/** Every organization-authored body, live. No sample, no fixture. */
export async function readLiveBodies(): Promise<BodyRow[]> {
    const env = await loadEnv();
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
        throw new Error(
            "The safelist generator reads the live component bodies and needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local. Without them it cannot know which classes the corpus uses, and it will not guess.",
        );
    }
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb
        .schema("content_ir")
        .from("kind_component")
        .select("component_key,component_source,updated_at")
        .eq("source", "db");
    if (error) {
        throw new Error(`Reading content_ir.kind_component failed: ${error.message}`);
    }
    return (data ?? []).filter((row) => (row.component_source ?? "").trim());
}

/** Tailwind's own extractor, over the database rows instead of over files. */
export function extractCandidates(bodies: BodyRow[]): string[] {
    const scanner = new Scanner({});
    const found = new Set<string>();
    for (const row of bodies) {
        const source = row.component_source ?? "";
        for (const candidate of scanner.scanFiles([
            { content: source, extension: "tsx" },
        ])) {
            found.add(candidate);
        }
    }
    return Array.from(found).sort();
}

export function fingerprintOf(
    bodies: BodyRow[],
    candidates: string[],
): CorpusFingerprint {
    const newest = bodies
        .map((row) => row.updated_at ?? "")
        .sort()
        .at(-1);
    return {
        rows: bodies.length,
        newestUpdatedAt: newest || "unknown",
        candidateHash: createHash("sha256")
            .update(candidates.join("\n"))
            .digest("hex")
            .slice(0, 16),
    };
}

/** Class names a compiled stylesheet actually contains, unescaped. */
function classesIn(css: string): Set<string> {
    const out = new Set<string>();
    const selector = /\.((?:[^\s\\.,:>+~()[\]{}'"#=]|\\.)+)/g;
    let match: RegExpExecArray | null;
    while ((match = selector.exec(css))) {
        out.add(match[1].replace(/\\(.)/g, "$1"));
    }
    return out;
}

async function compile(extra: string): Promise<string> {
    const base = await readFile(SANDBOX_CSS, "utf8");
    const result = await postcss([tailwindcss()]).process(`${base}\n${extra}`, {
        from: SANDBOX_CSS,
        to: resolve(ROOT, "public/kind-sandbox.css"),
    });
    return result.css;
}

function inlineDirectivesFor(candidates: string[]): string {
    return candidates
        .filter((candidate) => !/["\n\\]/.test(candidate))
        .map((candidate) => `@source inline(${JSON.stringify(candidate)});`)
        .join("\n");
}

/**
 * Which candidates produce real CSS, and which of those the repo scan already
 * covered. The difference is the gap this artifact closes — the number that
 * belongs in the report, measured rather than asserted.
 */
export async function measureSafelist(bodies: BodyRow[]): Promise<SafelistResult> {
    const candidates = extractCandidates(bodies);
    // THE BASELINE MUST NOT SEE THE PREVIOUS RUN'S OWN ARTIFACT. `globals.css`
    // imports it, so compiling as-is would count last run's safelist as
    // "already covered by the repo scan" and report a gap of zero forever. The
    // artifact is emptied for the baseline pass and restored either way.
    const previous = await readFile(OUT, "utf8").catch(() => null);
    let baseline: Set<string>;
    try {
        await mkdir(dirname(OUT), { recursive: true });
        await writeFile(OUT, "/* measuring the baseline — restored below */\n", "utf8");
        baseline = classesIn(await compile(""));
    } finally {
        if (previous !== null) await writeFile(OUT, previous, "utf8");
    }
    const withAll = classesIn(await compile(inlineDirectivesFor(candidates)));
    const generating = candidates.filter((candidate) => withAll.has(candidate));
    const alreadyCovered = generating.filter((candidate) => baseline.has(candidate));
    const gap = generating.filter((candidate) => !baseline.has(candidate));
    return {
        candidates,
        generating,
        alreadyCovered,
        gap,
        fingerprint: fingerprintOf(bodies, candidates),
    };
}

function artifactFor(result: SafelistResult): string {
    const { fingerprint } = result;
    return `/* GENERATED — do not edit by hand.
 *
 * The Tailwind utilities the ${fingerprint.rows} organization-authored component
 * bodies in content_ir.kind_component use. Tailwind emits a utility only for a
 * class it SCANS in a source file; these classes live in the database, so
 * without this file they produce no CSS and the component silently renders
 * unstyled in that respect — in the sandbox frame AND on the page, which both
 * compile from app/globals.css.
 *
 * Regenerate:  pnpm gen:kind-sandbox-safelist
 * Verify:      pnpm check:kind-sandbox-safelist   (fails when the live bodies move)
 *
 * Corpus fingerprint — rows: ${fingerprint.rows}; newest updated_at: ${fingerprint.newestUpdatedAt}; candidates: ${fingerprint.candidateHash}
 * Candidates scanned: ${result.candidates.length}
 * Of those, Tailwind generates: ${result.generating.length}
 * Already covered by the repo source scan: ${result.alreadyCovered.length}
 * Closed by this file: ${result.gap.length}
 */
${inlineDirectivesFor(result.generating)}
`;
}

export function fingerprintIn(artifact: string): CorpusFingerprint | null {
    const match =
        /Corpus fingerprint — rows: (\d+); newest updated_at: (\S+); candidates: ([0-9a-f]+)/.exec(
            artifact,
        );
    if (!match) return null;
    return {
        rows: Number(match[1]),
        newestUpdatedAt: match[2],
        candidateHash: match[3],
    };
}

export const SAFELIST_ARTIFACT = OUT;

async function main(): Promise<void> {
    const check = process.argv.includes("--check");
    const bodies = await readLiveBodies();
    const candidates = extractCandidates(bodies);
    const live = fingerprintOf(bodies, candidates);

    if (check) {
        const artifact = await readFile(OUT, "utf8").catch(() => "");
        const stamped = fingerprintIn(artifact);
        if (!stamped) {
            throw new Error(
                `${OUT} is missing or carries no corpus fingerprint. Run: pnpm gen:kind-sandbox-safelist`,
            );
        }
        if (stamped.candidateHash !== live.candidateHash) {
            throw new Error(
                `The organization-authored component bodies have changed since the Tailwind safelist was generated ` +
                    `(file: ${stamped.rows} rows / ${stamped.candidateHash}; live: ${live.rows} rows / ${live.candidateHash}). ` +
                    `Classes an author has used since then produce no CSS, in the sandbox frame and on the page. ` +
                    `Run: pnpm gen:kind-sandbox-safelist`,
            );
        }
        // eslint-disable-next-line no-console
        console.log(
            `✓ kind-sandbox class safelist matches the live corpus (${live.rows} bodies, ${candidates.length} candidates).`,
        );
        return;
    }

    const result = await measureSafelist(bodies);
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, artifactFor(result), "utf8");
    // eslint-disable-next-line no-console
    console.log(
        `✓ ${OUT}\n` +
            `  bodies: ${bodies.length}\n` +
            `  class candidates scanned: ${result.candidates.length}\n` +
            `  Tailwind generates: ${result.generating.length}\n` +
            `  already covered by the repo scan: ${result.alreadyCovered.length}\n` +
            `  GAP closed by this file: ${result.gap.length}`,
    );
}

const invokedDirectly =
    process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
    main().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(
            "[kind-sandbox safelist] failed:",
            err instanceof Error ? err.message : err,
        );
        process.exit(1);
    });
}
