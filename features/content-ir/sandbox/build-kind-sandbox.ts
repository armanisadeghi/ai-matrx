/**
 * Build the kind sandbox frame runtime:
 *   features/content-ir/sandbox/runtime/entry.tsx   →  public/kind-sandbox.js
 *   features/content-ir/sandbox/runtime/sandbox.css →  public/kind-sandbox.css
 *
 * Run via `pnpm build:kind-sandbox`, wired into `pnpm build` beside
 * `build:sw` so a stale artifact can never ship. The frame has
 * `connect-src 'none'`, so this artifact IS the frame's entire world: a stale
 * bundle is a silently wrong renderer, not a cache miss.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TWO AUDITS, BOTH BLOCKING. They are the point of this script, not a garnish.
 *
 *  (1) THE GRAPH AUDIT names the module that broke the rule. Every file
 *      esbuild actually put in the output is checked against a list of things
 *      the frame may never contain — Next internals, the Supabase client, the
 *      window-panel system. It fails with the import CHAIN from the entry to
 *      the offender, because "something pulled Supabase in" is not actionable
 *      and "CopyButtons → AiCopyMenu → useExportActions → … → supabase/ssr" is.
 *
 *  (2) THE ARTIFACT AUDIT reads the minified bytes that will actually be
 *      served and refuses call shapes that can reach the network or another
 *      document: `fetch(`, `new XMLHttpRequest`, `new WebSocket`,
 *      `new EventSource`, `sendBeacon(`, `window.top`, `window.parent`,
 *      `parent.postMessage`. It matches CALL shapes, never bare words: the
 *      component-source-gate's banned-identifier vocabulary is legitimately
 *      present in the bundle as string data, and a string is not a capability.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE FOUR FRAME SUBSTITUTIONS (esbuild `alias`) — each one has a module with
 * a header explaining why it exists and what the author sees instead:
 *   @/components/MarkdownStream               → FrameMarkdown     (ruling 1)
 *   @/components/agent-copy/AgentCopyGroomerHost → FrameGroomerHost
 *   @/features/google-workspace/export/sendToGoogle → FrameSendToGoogle
 * They are aliases rather than database migrations, so the live component
 * bodies are migrated to the frame-safe implementations without a row
 * changing — including the five that import MarkdownStream.
 */
import { build, type Metafile } from "esbuild";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { formatFileSize } from "@ai-matrx/kit/format";

const __dirname = dirname(fileURLToPath(import.meta.url));
// features/content-ir/sandbox → repo root: 3 levels up.
const ROOT = resolve(__dirname, "../../..");

const JS_ENTRY = resolve(__dirname, "runtime/entry.tsx");
const CSS_ENTRY = resolve(__dirname, "runtime/sandbox.css");
const JS_OUT = resolve(ROOT, "public/kind-sandbox.js");
const CSS_OUT = resolve(ROOT, "public/kind-sandbox.css");

const ALIAS: Record<string, string> = {
    "@/components/MarkdownStream": resolve(__dirname, "runtime/FrameMarkdown.tsx"),
    "@/components/agent-copy/AgentCopyGroomerHost": resolve(
        __dirname,
        "runtime/FrameGroomerHost.tsx",
    ),
    "@/features/google-workspace/export/sendToGoogle": resolve(
        __dirname,
        "runtime/FrameSendToGoogle.ts",
    ),
};

/** Module-path fragment → why the frame may not contain it. */
const FORBIDDEN_MODULES: ReadonlyArray<readonly [RegExp, string]> = [
    [/\/next\/dist\//, "Next.js internals"],
    [/\/@supabase\//, "the Supabase client (a data door)"],
    [/features\/window-panels\//, "the window-panel system (it owns the host page's layout)"],
    [/utils\/supabase\//, "a Supabase client factory"],
    // The APP's store only — recharts ships its own private redux store,
    // which is internal to the chart library and reaches nothing of ours.
    [/^lib\/redux\//, "the app's Redux store"],
    [/^features\/[^/]+\/redux\//, "a feature's Redux slice"],
];

/**
 * Call shapes that can reach the network, another document, or durable
 * browser state. The storage and dynamic-import shapes were added 2026-09-12
 * (V-27 finding D): the frame has NO legitimate use for persistence — its
 * whole state is the props the host sends — and `import(` would fetch, which
 * `connect-src 'none'` refuses at run time but which must never be in the
 * bundle in the first place.
 */
const FORBIDDEN_CALLS: ReadonlyArray<readonly [RegExp, string]> = [
    [/(^|[^.\w$"'`])fetch\s*\(/, "a fetch() call"],
    [/new\s+XMLHttpRequest/, "an XMLHttpRequest"],
    [/new\s+WebSocket\s*\(/, "a WebSocket"],
    [/new\s+EventSource\s*\(/, "an EventSource"],
    [/sendBeacon\s*\(/, "a navigator.sendBeacon() call"],
    [/window\s*\.\s*top\b/, "a window.top reference"],
    [/window\s*\.\s*parent\b/, "a window.parent reference"],
    [/parent\s*\.\s*postMessage\s*\(/, "a parent.postMessage() call"],
    [/next\/dist/, "a Next.js internal path"],
    [/(^|[^.\w$"'`])localStorage\b/, "a localStorage access"],
    [/(^|[^.\w$"'`])sessionStorage\b/, "a sessionStorage access"],
    [/\.\s*localStorage\b/, "a localStorage access"],
    [/\.\s*sessionStorage\b/, "a sessionStorage access"],
    [/indexedDB\s*\./, "an IndexedDB access"],
    // READ only. Writing the clipboard IS the copy bar — the one capability
    // an author is explicitly given — and it cannot leak anything: the value
    // is the content the reader is already looking at. READING the clipboard
    // is the exfiltration shape (whatever the user last copied, anywhere),
    // and nothing in the frame has any business doing it.
    [/clipboard\s*\.\s*read/, "a navigator.clipboard READ"],
    [/(^|[^.\w$"'`])import\s*\(/, "a dynamic import()"],
];

/**
 * THE byte-size voice: @ai-matrx/kit/format owns "512 B" / "1.5 KB" / "12 MB".
 * The local copy printed two decimals at MB; the package's one-decimal-under-
 * ten rule is the fleet-wide decision.
 */
function formatBytes(n: number): string {
    return formatFileSize(n);
}

function shorten(p: string): string {
    return p.replace(/node_modules\/\.pnpm\/[^/]+\/node_modules\//, "~/");
}

/** Breadth-first import chain from the entry to `target`, for the error text. */
function importChain(meta: Metafile, entry: string, target: string): string[] {
    const seen = new Set<string>();
    const queue: Array<[string, string[]]> = [[entry, [entry]]];
    while (queue.length > 0) {
        const [node, path] = queue.shift()!;
        if (seen.has(node)) continue;
        seen.add(node);
        if (node === target) return path;
        for (const imported of meta.inputs[node]?.imports ?? []) {
            queue.push([imported.path, [...path, imported.path]]);
        }
    }
    return [target];
}

async function buildJs(): Promise<{ code: string; meta: Metafile }> {
    const result = await build({
        entryPoints: [JS_ENTRY],
        outfile: JS_OUT,
        bundle: true,
        minify: true,
        sourcemap: false,
        target: "es2020",
        format: "iife",
        platform: "browser",
        legalComments: "none",
        metafile: true,
        absWorkingDir: ROOT,
        tsconfig: resolve(ROOT, "tsconfig.json"),
        loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
        alias: ALIAS,
        // THE FRAME HAS NO STORAGE (V-27 finding D). Both globals are
        // replaced with the announcing stand-in: on an opaque origin the real
        // ones throw a SecurityError, and durable state in an invisible place
        // is not something a Shape component may have. After this the audit
        // below can refuse the real names outright.
        inject: [resolve(__dirname, "runtime/frame-storage.ts")],
        define: {
            "process.env.NODE_ENV": '"production"',
            localStorage: "__matrxFrameStorage",
            sessionStorage: "__matrxFrameStorage",
            "window.localStorage": "__matrxFrameStorage",
            "window.sessionStorage": "__matrxFrameStorage",
        },
        logLevel: "info",
    });

    return { code: await readFile(JS_OUT, "utf8"), meta: result.metafile };
}

async function buildCss(): Promise<string> {
    const source = await readFile(CSS_ENTRY, "utf8");
    const result = await postcss([tailwindcss()]).process(source, {
        from: CSS_ENTRY,
        to: CSS_OUT,
    });
    await mkdir(dirname(CSS_OUT), { recursive: true });
    await writeFile(CSS_OUT, result.css, "utf8");
    return result.css;
}

function auditGraph(meta: Metafile): string[] {
    const entry = relative(ROOT, JS_ENTRY);
    const outKey = Object.keys(meta.outputs)[0];
    const bundled = Object.entries(meta.outputs[outKey].inputs)
        .filter(([, v]) => v.bytesInOutput > 0)
        .map(([k]) => k);

    const failures: string[] = [];
    for (const [pattern, why] of FORBIDDEN_MODULES) {
        const hit = bundled.find((p) => pattern.test(p));
        if (!hit) continue;
        const chain = importChain(meta, entry, hit).map(shorten);
        failures.push(
            `${why} is in the frame bundle — ${shorten(hit)}\n` +
                chain.map((c, i) => `${"    ".repeat(1)}${i === 0 ? "" : "-> "}${c}`).join("\n"),
        );
    }
    return failures;
}

function auditArtifact(code: string): string[] {
    const failures: string[] = [];
    for (const [pattern, why] of FORBIDDEN_CALLS) {
        const hit = pattern.exec(code);
        if (hit) {
            const at = Math.max(0, hit.index - 60);
            failures.push(
                `${why} is in the served bytes — near: ...${code.slice(at, hit.index + 60)}...`,
            );
        }
    }
    return failures;
}

async function main(): Promise<void> {
    const { code, meta } = await buildJs();

    const failures = [...auditGraph(meta), ...auditArtifact(code)];
    if (failures.length > 0) {
        // A REJECTED ARTIFACT NEVER SURVIVES THE RUN (V-27 finding B,
        // 2026-09-12). esbuild has already written `public/kind-sandbox.js` by
        // the time the audits run, so without this the next `pnpm dev` serves
        // the very bundle the build refused — a failing build that silently
        // ships is worse than no audit at all.
        await rm(JS_OUT, { force: true });
        await rm(CSS_OUT, { force: true });
        throw new Error(
            "The kind sandbox bundle contains things the frame may not have.\n\n" +
                failures.join("\n\n") +
                "\n\nFix the import that pulled it in (usually by aliasing the seam to a " +
                "frame-safe stand-in that announces itself). Do not relax this audit.",
        );
    }

    const css = await buildCss();
    const jsGz = gzipSync(Buffer.from(code)).length;
    const cssGz = gzipSync(Buffer.from(css)).length;

    // eslint-disable-next-line no-console
    console.log(
        `✓ kind-sandbox.js  ${formatBytes(code.length)} raw / ${formatBytes(jsGz)} gz → ${JS_OUT}\n` +
            `✓ kind-sandbox.css ${formatBytes(css.length)} raw / ${formatBytes(cssGz)} gz → ${CSS_OUT}`,
    );
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
        "[build:kind-sandbox] failed:",
        err instanceof Error ? err.message : err,
    );
    process.exit(1);
});
