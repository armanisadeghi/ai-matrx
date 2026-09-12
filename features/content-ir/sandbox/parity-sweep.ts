/**
 * parity-sweep — the DD-123 S5 rendering-parity proof over EVERY live
 * organization-authored component body.
 *
 *   pnpm sweep:kind-sandbox-parity          # all 139 live bodies, light + dark
 *   pnpm check:kind-sandbox-parity          # the fixed sample, fails on regression
 *   pnpm sweep:kind-sandbox-parity --keys=a,b,c
 *
 * WHAT IT PROVES. For each body it renders the SAME live source twice in one
 * document, at the same moment, at the same width:
 *
 *   gate OFF — mounted straight into the page, which is what
 *              `DbKindComponentImpl` does today when the knob is off;
 *   gate ON  — a real `<iframe src="/kind-sandbox" sandbox="allow-scripts">`
 *              driven over the real protocol (init + a transferred MessagePort).
 *
 * Then it screenshots both columns in headless Chrome and diffs them pixel by
 * pixel. A body whose framed render differs by more than the S3 noise floor is
 * a parity failure with a name, not a feeling.
 *
 * IT NEEDS THE APP RUNNING (`pnpm dev`, port 3001 by default): the page is
 * served from `public/` because the sandbox route's CSP ends in
 * `frame-ancestors <app origin>` — a page opened from `file://` is refused by
 * the browser and would prove nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformKindComponentBody } from "./transform/transform-kind-body";
import { getDefaultImportsForKindComponents } from "@/features/agent-apps/utils/allowed-imports";
import { inlineJson } from "./inline-json";
import { SANDBOX_PROTOCOL_VERSION } from "./protocol";
import { launch, type Rect } from "./parity/cdp";
import { readPng, bestAlignedDiff } from "./parity/png";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const OUT_DIR = resolve(ROOT, ".kind-sandbox-parity");
const BASELINE = resolve(__dirname, "generated/parity-baseline.json");

const ORIGIN = process.env.PARITY_ORIGIN ?? "http://localhost:3001";
const PAGE_WIDTH = 1400;
/**
 * THE VIEWPORT IS TALL ON PURPOSE. A cross-origin iframe that is scrolled out
 * of view gets no `requestAnimationFrame`, so the frame's own self-measurement
 * never runs and it never reports a height — the sweep would then diff a live
 * render against a frame frozen at its initial 200 px and call it a parity
 * failure. Measured: with a 1200 px viewport the third case in a batch reported
 * no size at all; with the batch inside the viewport every case reports.
 */
const PAGE_HEIGHT = 6000;
const BATCH_SIZE = 4;

/**
 * The S3 noise floor. Subpixel antialiasing along a rounded edge lands under
 * it (measured 0.337 % on `wine_tasting_card`); a different colour, a different
 * layout or a different font size does not.
 */
export const PARITY_NOISE_FLOOR_PCT = 0.5;

interface Row {
    component_key: string;
    component_source: string;
    config: Record<string, unknown> | null;
    kind_definition_id: string;
}

interface Case {
    componentKey: string;
    kind: string;
    sourceBytes: number;
    dataSource: string;
    payload: unknown;
    data: unknown;
}

export interface ParityMeasurement {
    /** percentage of pixels that differ, at the best small alignment */
    pct: number;
    maxDelta: number;
    /** the vertical offset that alignment used, in pixels */
    shiftY: number;
    offH: number;
    onH: number;
}

export interface ParityCaseResult {
    componentKey: string;
    kind: string;
    light: ParityMeasurement | null;
    dark: ParityMeasurement | null;
    verdict: "match" | "differs" | "did-not-render";
    note: string | null;
}

function loadEnv(): Record<string, string> {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
        if (!/^[A-Z0-9_]+=/.test(line)) continue;
        const i = line.indexOf("=");
        out[line.slice(0, i)] = line.slice(i + 1).replace(/^["']|["']$/g, "");
    }
    return out;
}

async function buildCases(keys: string[] | null): Promise<{
    cases: Case[];
    skipped: Array<{ componentKey: string; reason: string }>;
}> {
    const env = loadEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false },
    });
    let query = sb
        .schema("content_ir")
        .from("kind_component")
        .select("component_key,component_source,config,kind_definition_id")
        .eq("source", "db")
        // 22 of the 162 `source='db'` rows are soft-deleted (measured
        // 2026-09-12) and never render anywhere. Earlier censuses in this
        // campaign counted them; a parity table that includes them reports on
        // components nobody can see.
        .is("deleted_at", null)
        .order("component_key");
    if (keys) query = query.in("component_key", keys);
    const { data: comps, error } = await query;
    if (error) throw new Error(`kind_component read failed: ${error.message}`);
    const rows = (comps ?? []) as unknown as Row[];
    if (keys && rows.length !== keys.length) {
        const got = new Set(rows.map((r) => r.component_key));
        throw new Error(
            `These component keys are not live organization bodies: ${keys
                .filter((k) => !got.has(k))
                .join(", ")}`,
        );
    }

    const defIds = [...new Set(rows.map((r) => r.kind_definition_id))];
    const defs = new Map<string, { kind: string; sample_data: unknown }>();
    for (let i = 0; i < defIds.length; i += 200) {
        const { data } = await sb
            .schema("content_ir")
            .from("kind_definition")
            .select("id,kind,sample_data")
            .in("id", defIds.slice(i, i + 200));
        for (const d of data ?? []) {
            defs.set(d.id as string, {
                kind: d.kind as string,
                sample_data: d.sample_data,
            });
        }
    }
    const { data: instRows } = await sb
        .schema("content_ir")
        .from("kind_instance")
        .select("id,kind_definition_id,data")
        .in("kind_definition_id", defIds)
        .is("deleted_at", null);
    const instances = new Map<string, { id: string; data: unknown }>();
    for (const r of instRows ?? []) {
        if (!instances.has(r.kind_definition_id as string)) {
            instances.set(r.kind_definition_id as string, {
                id: r.id as string,
                data: r.data,
            });
        }
    }

    const allowed = getDefaultImportsForKindComponents();
    const cases: Case[] = [];
    const skipped: Array<{ componentKey: string; reason: string }> = [];
    for (const row of rows) {
        const def = defs.get(row.kind_definition_id);
        const configured = Array.isArray(row.config?.allowed_imports)
            ? (row.config!.allowed_imports as string[])
            : allowed;
        const { payload, error: compileError } = transformKindComponentBody(
            row.component_source,
            configured,
        );
        if (!payload) {
            skipped.push({
                componentKey: row.component_key,
                reason:
                    compileError ??
                    "The body is empty, so there is nothing to render either way.",
            });
            continue;
        }
        const live = instances.get(row.kind_definition_id);
        cases.push({
            componentKey: row.component_key,
            kind: def?.kind ?? "unknown",
            sourceBytes: row.component_source.length,
            dataSource: live
                ? `live content_ir.kind_instance ${live.id}`
                : "the kind's example payload (content_ir.kind_definition.sample_data)",
            payload,
            data: live ? live.data : (def?.sample_data ?? {}),
        });
    }
    return { cases, skipped };
}

function pageHtml(cases: Case[]): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Kind sandbox parity sweep</title>
<link rel="stylesheet" href="/kind-sandbox.css">
<style>
  /* 🚨 THE FONT MUST BE THE APP'S, ON BOTH SIDES. In the app the typeface
     comes from a class on <body> in the Next layout; this page has no layout,
     so it names the same token the app resolves. Get this wrong in either
     direction and the two columns are set in different faces, their text wraps
     at different points, and every text-heavy body reports a double-digit
     "difference" that is really the instrument's. Measured 2026-09-12: the
     frame's own document had no font at all, which is the defect this page
     found (fixed in runtime/sandbox.css). */
  body { margin: 0; padding: 16px; background: hsl(var(--background)); color: hsl(var(--foreground));
         font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif); }
  .case { margin: 0 0 24px; }
  .case > header { font: 11px/1.4 ui-monospace, monospace; padding: 4px 0; color: hsl(var(--muted-foreground)); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
  /* THE CLIP — what KindSandboxFrame does, and for the same reason (S5b,
     sandbox/protocol.ts, THE READER'S VIEWPORT): the iframe is as wide as the
     READER'S window so viewport media queries inside the frame answer the same
     question they answer in the page, and this element is the component's real
     column. A sweep whose host page did not do this would measure the host's
     bug, not the frame's parity. */
  .col { min-width: 0; }
  .clip { overflow: hidden; min-width: 0; width: 100%; }
  iframe { border: 0; display: block; max-width: none; }
</style>
</head>
<body>
<div id="cases"></div>
<script src="/kind-sandbox.js"></script>
<script>
window.__CASES__ = ${inlineJson(cases)};
window.__PROTOCOL_VERSION__ = ${SANDBOX_PROTOCOL_VERSION};
window.__PARITY__ = {};

function rootTokens() {
  var names = {};
  for (var s = 0; s < document.styleSheets.length; s++) {
    var rules = null;
    try { rules = document.styleSheets[s].cssRules; } catch (e) { continue; }
    if (!rules) continue;
    var stack = [rules];
    while (stack.length) {
      var list = stack.pop();
      for (var i = 0; i < list.length; i++) {
        var rule = list[i];
        if (rule.cssRules) { stack.push(rule.cssRules); continue; }
        if (!rule.selectorText) continue;
        if (!/(^|[\\s,])(:root|html)\\b|\\.dark\\b|\\[data-theme/.test(rule.selectorText)) continue;
        for (var j = 0; j < rule.style.length; j++) {
          var name = rule.style.item ? rule.style.item(j) : rule.style[j];
          if (name && name.indexOf("--") === 0) names[name] = true;
        }
      }
    }
  }
  var inline = document.documentElement.style;
  for (var k = 0; k < inline.length; k++) {
    var n = inline.item ? inline.item(k) : inline[k];
    if (n && n.indexOf("--") === 0) names[n] = true;
  }
  var computed = getComputedStyle(document.documentElement);
  var out = {};
  Object.keys(names).forEach(function (name) {
    var value = computed.getPropertyValue(name).trim();
    if (value) out[name] = value;
  });
  return out;
}
function scheme() { return document.documentElement.classList.contains("dark") ? "dark" : "light"; }
/** The width the HOST page's own media queries answer against. */
function readerViewportWidth() { return document.documentElement.clientWidth || window.innerWidth; }

var host = document.getElementById("cases");
var ports = {};

window.__CASES__.forEach(function (item, index) {
  var section = document.createElement("section");
  section.className = "case";
  section.innerHTML =
    '<header>' + item.componentKey + ' · kind=' + item.kind + ' · ' + item.sourceBytes + ' bytes · ' + item.dataSource + '</header>' +
    '<div class="cols">' +
      '<div class="col"><div class="unframed" id="off-' + index + '"></div></div>' +
      '<div class="col"><div class="clip" id="on-' + index + '"></div></div>' +
    '</div>';
  host.appendChild(section);

  var record = { componentKey: item.componentKey, index: index, offErrors: [], onErrors: [], heights: [], ready: false };
  window.__PARITY__[item.componentKey] = record;

  try {
    window.MatrxKindSandbox.mount(document.getElementById('off-' + index), item.payload, {
      props: {
        data: item.data, kind: item.kind, config: {}, uiOptions: {},
        runAction: function (key) { return Promise.resolve({ ok: false, error: "no action bridge in the sweep: " + key }); },
        onResolve: function () {}
      },
      onError: function (m) { record.offErrors.push(String(m)); }
    });
  } catch (e) { record.offErrors.push(String(e && e.message || e)); }

  var frameWrap = document.getElementById('on-' + index);
  var frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.src = "/kind-sandbox";
  frame.title = item.componentKey + " — component";
  frame.style.height = "200px";
  frame.style.width = readerViewportWidth() + "px";
  frameWrap.appendChild(frame);

  frame.addEventListener("load", function () {
    var channel = new MessageChannel();
    ports[item.componentKey] = channel.port1;
    channel.port1.onmessage = function (event) {
      var msg = event.data || {};
      if (msg.type === "matrx:sandbox:size") {
        record.heights.push(msg.height);
        frame.style.height = msg.height + "px";
      }
      if (msg.type === "matrx:sandbox:error") record.onErrors.push(String(msg.message));
      if (msg.type === "matrx:sandbox:ready") record.ready = true;
    };
    channel.port1.start();
    frame.contentWindow.postMessage({
      type: "matrx:sandbox:init",
      protocolVersion: window.__PROTOCOL_VERSION__,
      instanceId: item.componentKey,
      kind: item.kind,
      body: item.payload,
      propsTransform: null,
      props: { data: item.data, kind: item.kind, config: {}, uiOptions: {} },
      themeTokens: rootTokens(),
      colorScheme: scheme(),
      readerViewportWidth: readerViewportWidth(),
      contentWidth: frameWrap.clientWidth
    }, "*", [channel.port2]);
  });
});

window.__SETTLED__ = function () {
  var keys = Object.keys(window.__PARITY__);
  for (var i = 0; i < keys.length; i++) {
    if (window.__PARITY__[keys[i]].heights.length === 0) return false;
  }
  return true;
};

/**
 * SNAP EVERY CASE TO A WHOLE PIXEL BEFORE ANYTHING IS SHOT.
 *
 * A component is 912.31 px tall, so the NEXT case in the page starts at a
 * fractional y — and there the two columns stop being comparable: the unframed
 * render is laid out AT that fraction (Chrome rounds its borders and text
 * baselines against it), while the framed render is laid out at 0 inside its
 * own document and then composited at the fraction. The pictures are then one
 * sharp image and one half-pixel-shifted image of the SAME layout, which reads
 * as 4-6 % of pixels differing on any text-heavy body — a difference the
 * product does not have and the DOM does not have.
 *
 * It is also why a body's number used to move with the batch it was measured
 * in (B-36 §5): a different neighbour above it meant a different fraction.
 * Rounding each case's height puts every case back on a whole pixel.
 */
window.__SNAP__ = function () {
  var sections = document.querySelectorAll(".case");
  // Release any previous snap first: a theme change can make a body taller,
  // and a case frozen at yesterday's height would clip it instead of measuring
  // it — a parity number taken off a clipped render proves nothing.
  for (var i = 0; i < sections.length; i++) sections[i].style.height = "";
  void document.body.offsetHeight;
  for (var j = 0; j < sections.length; j++) {
    sections[j].style.height = Math.ceil(sections[j].getBoundingClientRect().height) + "px";
  }
  return sections.length;
};

window.__SET_THEME__ = function (dark) {
  document.documentElement.classList.toggle("dark", !!dark);
  var tokens = rootTokens();
  Object.keys(ports).forEach(function (key) {
    ports[key].postMessage({ type: "matrx:sandbox:theme", instanceId: key, themeTokens: tokens, colorScheme: scheme() });
  });
  return scheme();
};

/** Absolute document rects for one case's two columns. */
window.__RECTS__ = function (index) {
  function box(el) {
    var r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  }
  // The CLIP is the component's column; the iframe inside it is deliberately
  // as wide as the whole window, so shooting the iframe would shoot the page.
  return { off: box(document.getElementById('off-' + index)), on: box(document.getElementById('on-' + index)) };
};
window.__READY__ = true;
</script>
</body>
</html>
`;
}

/** Poll one boolean expression in the page until it is true or time runs out. */
async function waitFor(
    page: Awaited<ReturnType<typeof launch>>,
    expression: string,
    ms: number,
): Promise<boolean> {
    const until = Date.now() + ms;
    for (;;) {
        const ok = await page.evaluate<boolean>(expression).catch(() => false);
        if (ok) return true;
        if (Date.now() > until) return false;
        await new Promise((r) => setTimeout(r, 400));
    }
}

async function settle(
    page: Awaited<ReturnType<typeof launch>>,
    ms: number,
): Promise<boolean> {
    const until = Date.now() + ms;
    for (;;) {
        const ok = await page
            .evaluate<boolean>("!!window.__SETTLED__ && window.__SETTLED__()")
            .catch(() => false);
        if (ok) return true;
        if (Date.now() > until) return false;
        await new Promise((r) => setTimeout(r, 400));
    }
}

async function runBatch(
    cases: Case[],
    batchIndex: number,
    shotDir: string,
): Promise<ParityCaseResult[]> {
    const file = resolve(ROOT, `public/__kind-sandbox-parity-sweep-${batchIndex}.html`);
    writeFileSync(file, pageHtml(cases), "utf8");
    const page = await launch({ width: PAGE_WIDTH, height: PAGE_HEIGHT });
    const results: ParityCaseResult[] = [];
    try {
        await page.navigate(
            `${ORIGIN}/__kind-sandbox-parity-sweep-${batchIndex}.html`,
        );
        // The page has to exist before anything can be asked of it. A batch
        // whose page never loads is reported as a batch that never loaded —
        // it is never allowed to look like a parity result.
        let loaded = await waitFor(page, "!!window.__READY__", 30000);
        if (!loaded) {
            // The dev server restarting mid-sweep once cost a whole 35-batch
            // run (observed 2026-09-12: every batch came back "never finished
            // loading" because the app had been restarted under it). One
            // re-navigate distinguishes a page that is genuinely broken from a
            // server that was briefly not there.
            await new Promise((r) => setTimeout(r, 5000));
            await page.navigate(
                `${ORIGIN}/__kind-sandbox-parity-sweep-${batchIndex}.html`,
            );
            loaded = await waitFor(page, "!!window.__READY__", 30000);
        }
        if (!loaded) {
            return cases.map((c) => ({
                componentKey: c.componentKey,
                kind: c.kind,
                light: null,
                dark: null,
                verdict: "did-not-render" as const,
                note: `the parity page for this batch never finished loading at ${ORIGIN}`,
            }));
        }
        let settled = await settle(page, 25000);
        if (!settled) {
            // Last resort for a very tall batch: put each silent frame at the
            // top of the viewport so its rAF runs, then wait again.
            await page
                .evaluate(
                    "Object.values(window.__PARITY__ || {}).filter(r => !r.heights.length).forEach(r => { var f = document.querySelector('#on-' + r.index + ' iframe'); if (f) f.scrollIntoView(); })",
                )
                .catch(() => undefined);
            settled = await settle(page, 15000);
            await page.evaluate("window.scrollTo(0, 0)").catch(() => undefined);
        }
        // One more frame for the host to apply the last reported height.
        await new Promise((r) => setTimeout(r, 1200));
        // …then put every case back on a whole pixel (see `__SNAP__`).
        await page.evaluate("window.__SNAP__()").catch(() => undefined);
        await new Promise((r) => setTimeout(r, 300));

        const perTheme: Record<
            "light" | "dark",
            Array<ParityMeasurement | null>
        > = { light: [], dark: [] };

        for (const theme of ["light", "dark"] as const) {
            await page.evaluate(`window.__SET_THEME__(${theme === "dark"})`);
            // The app's own `transition-colors` utilities animate a theme
            // change on BOTH sides of the boundary. Capturing during that
            // animation compares two different moments, not two renders, so
            // the sweep waits the transition out rather than reporting a
            // difference that does not exist a second later.
            await new Promise((r) => setTimeout(r, 3000));
            // A theme change can change type metrics and therefore heights, so
            // the whole-pixel snap is re-taken for this theme.
            await page.evaluate("window.__SNAP__()").catch(() => undefined);
            await new Promise((r) => setTimeout(r, 300));
            for (let i = 0; i < cases.length; i++) {
                const rects = await page.evaluate<{ off: Rect; on: Rect }>(
                    `window.__RECTS__(${i})`,
                );
                const w = Math.round(Math.min(rects.off.width, rects.on.width));
                const h = Math.round(Math.min(rects.off.height, rects.on.height));
                if (w < 4 || h < 4) {
                    perTheme[theme].push(null);
                    continue;
                }
                const key = `${cases[i].componentKey}-${theme}`;
                const offFile = `${shotDir}/${key}-off.png`;
                const onFile = `${shotDir}/${key}-on.png`;
                await page.shot(offFile, {
                    x: Math.round(rects.off.x),
                    y: Math.round(rects.off.y),
                    width: w,
                    height: h,
                });
                await page.shot(onFile, {
                    x: Math.round(rects.on.x),
                    y: Math.round(rects.on.y),
                    width: w,
                    height: h,
                });
                const d = bestAlignedDiff(readPng(offFile), readPng(onFile));
                perTheme[theme].push({
                    pct: d.pct,
                    maxDelta: d.maxDelta,
                    shiftY: d.shiftY,
                    offH: Math.round(rects.off.height),
                    onH: Math.round(rects.on.height),
                });
            }
        }

        const state = await page.evaluate<Record<string, any>>(
            "JSON.parse(JSON.stringify(window.__PARITY__))",
        );
        if (process.env.PARITY_DEBUG) {
            // eslint-disable-next-line no-console
            console.log("    state:", JSON.stringify(state));
        }
        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            const rec = state[c.componentKey] ?? {};
            const light = perTheme.light[i];
            const dark = perTheme.dark[i];
            const worst = Math.max(light?.pct ?? 100, dark?.pct ?? 100);
            const notes: string[] = [];
            if (!settled) notes.push("the batch did not settle within 25 s");
            if ((rec.onErrors ?? []).length)
                notes.push(`framed errors: ${rec.onErrors.join(" | ")}`);
            if ((rec.offErrors ?? []).length)
                notes.push(`unframed errors: ${rec.offErrors.join(" | ")}`);
            if (light && light.offH !== light.onH)
                notes.push(`height off=${light.offH} on=${light.onH}`);
            if (light?.shiftY)
                notes.push(`aligned by ${light.shiftY} px`);
            results.push({
                componentKey: c.componentKey,
                kind: c.kind,
                light,
                dark,
                verdict: !light && !dark ? "did-not-render" : worst <= PARITY_NOISE_FLOOR_PCT ? "match" : "differs",
                note: notes.length ? notes.join("; ") : null,
            });
        }
    } finally {
        await page.close();
        rmSync(file, { force: true });
    }
    return results;
}

function markdown(results: ParityCaseResult[], skipped: Array<{ componentKey: string; reason: string }>): string {
    const lines = [
        "| body | kind | light diff % | dark diff % | verdict | cause |",
        "|---|---|---|---|---|---|",
    ];
    for (const r of [...results].sort((a, b) =>
        (b.light?.pct ?? 0) - (a.light?.pct ?? 0),
    )) {
        lines.push(
            `| \`${r.componentKey}\` | ${r.kind} | ${r.light ? r.light.pct.toFixed(3) : "—"} | ${
                r.dark ? r.dark.pct.toFixed(3) : "—"
            } | ${r.verdict} | ${r.note ?? ""} |`,
        );
    }
    for (const s of skipped) {
        lines.push(`| \`${s.componentKey}\` | — | — | — | not-compared | ${s.reason} |`);
    }
    return lines.join("\n");
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const isCheck = argv.includes("--check");
    const writeBaseline = argv.includes("--write-baseline");
    const keysArg = argv.find((a) => a.startsWith("--keys="));
    let keys: string[] | null = keysArg ? keysArg.slice(7).split(",") : null;

    let baseline: { sample: string[]; results: Record<string, number> } | null = null;
    if (isCheck) {
        baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
        keys = baseline!.sample;
    }

    const { cases, skipped } = await buildCases(keys);
    mkdirSync(OUT_DIR, { recursive: true });
    const shotDir = `${OUT_DIR}/shots`;
    mkdirSync(shotDir, { recursive: true });

    const results: ParityCaseResult[] = [];
    for (let i = 0; i < cases.length; i += BATCH_SIZE) {
        const batch = cases.slice(i, i + BATCH_SIZE);
        process.stdout.write(
            `  batch ${i / BATCH_SIZE + 1}/${Math.ceil(cases.length / BATCH_SIZE)}: ${batch
                .map((c) => c.componentKey)
                .join(", ")}\n`,
        );
        try {
            results.push(...(await runBatch(batch, i / BATCH_SIZE, shotDir)));
        } catch (error) {
            // One batch that blows up must not throw away the other forty.
            const message = error instanceof Error ? error.message : String(error);
            // eslint-disable-next-line no-console
            console.error(`    batch failed: ${message}`);
            results.push(
                ...batch.map((c) => ({
                    componentKey: c.componentKey,
                    kind: c.kind,
                    light: null,
                    dark: null,
                    verdict: "did-not-render" as const,
                    note: `the sweep could not measure this batch: ${message}`,
                })),
            );
        }
    }

    writeFileSync(
        `${OUT_DIR}/parity-report.json`,
        JSON.stringify({ ranAt: new Date().toISOString(), origin: ORIGIN, results, skipped }, null, 2),
    );
    writeFileSync(`${OUT_DIR}/parity-report.md`, markdown(results, skipped));

    const differs = results.filter((r) => r.verdict !== "match");
    // eslint-disable-next-line no-console
    console.log(
        `\n${results.length} bodies compared · ${results.length - differs.length} match · ${differs.length} differ · ${skipped.length} not compared`,
    );
    // eslint-disable-next-line no-console
    console.log(`report → ${OUT_DIR}/parity-report.md`);

    if (writeBaseline) {
        const sample = results
            .filter((r) => r.verdict !== "did-not-render")
            .map((r) => r.componentKey)
            .sort();
        const recorded: Record<string, number> = {};
        for (const r of results) {
            if (r.verdict === "did-not-render") continue;
            recorded[r.componentKey] = Math.max(
                r.light?.pct ?? 0,
                r.dark?.pct ?? 0,
            );
        }
        writeFileSync(
            BASELINE,
            `${JSON.stringify(
                {
                    recordedAt: new Date().toISOString(),
                    note: "Worst-of-light-and-dark pixel difference between the framed and unframed render of each body in the parity sample. Regenerate with: pnpm sweep:kind-sandbox-parity --keys=<the sample> --write-baseline",
                    sample,
                    results: recorded,
                },
                null,
                2,
            )}\n`,
        );
        // eslint-disable-next-line no-console
        console.log(`baseline → ${BASELINE} (${sample.length} bodies)`);
    }

    if (isCheck) {
        const failures: string[] = [];
        for (const r of results) {
            const allowed = baseline!.results[r.componentKey];
            if (allowed === undefined) {
                failures.push(
                    `\`${r.componentKey}\` is in the parity sample but has no recorded baseline. Run: pnpm sweep:kind-sandbox-parity --keys=${r.componentKey}`,
                );
                continue;
            }
            const worst = Math.max(r.light?.pct ?? 100, r.dark?.pct ?? 100);
            // THE MARGIN IS DELIBERATELY WIDE. A browser screenshot is not
            // deterministic to the pixel: a body caught mid-transition, a
            // scrollbar that appears for one frame, a font that finishes
            // loading a beat late — one body in the S5 sample was measured at
            // 0.000 % and 4.400 % on two consecutive runs with nothing
            // changed. A guard that cries at 0.25 % gets muted, which is worse
            // than no guard. What this catches is the failure it exists for:
            // the frame losing the app's stylesheet, its theme tokens, or its
            // database-class safelist — every one of which moves a body by
            // double digits.
            const ceiling = Math.max(allowed, PARITY_NOISE_FLOOR_PCT) + 1.5;
            if (worst > ceiling) {
                failures.push(
                    `\`${r.componentKey}\` now renders ${worst.toFixed(3)} % different inside the sandbox frame; the recorded baseline is ${allowed.toFixed(
                        3,
                    )} %. Something changed the frame's stylesheet, its theme tokens, or this body.`,
                );
            }
        }
        if (failures.length) {
            // eslint-disable-next-line no-console
            console.error(
                `\n✗ Sandbox rendering parity regressed:\n  - ${failures.join("\n  - ")}\n\n  Look at ${OUT_DIR}/shots for the two pictures of each body.\n`,
            );
            process.exit(1);
        }
        // eslint-disable-next-line no-console
        console.log(
            `✓ Every body in the parity sample renders inside the sandbox frame exactly as its recorded baseline says it should (${results.length} bodies, light and dark).`,
        );
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
        "[kind-sandbox-parity] failed:",
        err instanceof Error ? err.message : err,
    );
    process.exit(1);
});
