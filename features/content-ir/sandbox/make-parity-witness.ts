/**
 * make-parity-witness — the S3 acceptance page: the SAME live component body,
 * rendered twice side by side, with the sandbox gate OFF and ON.
 *
 *   pnpm witness:kind-sandbox-parity           (needs `pnpm preview:start`)
 *   → http://localhost:3001/__kind-sandbox-parity.html
 *
 * WHY THIS EXISTS. S3's bar is that a framed component is visually IDENTICAL
 * to the same component unframed. That is not a claim a unit test can settle —
 * it is a picture. This page puts the two renders in one viewport so the
 * difference, if any, is visible rather than argued:
 *
 *   left  — GATE OFF: the body mounted straight into THIS document, which is
 *           what `DbKindComponentImpl` does today when the knob is off.
 *   right — GATE ON: a real `<iframe src="/kind-sandbox" sandbox="allow-scripts">`,
 *           driven over the real protocol — init with a transferred MessagePort,
 *           the host's resolved theme tokens, live props.
 *
 * Both halves use the same artifact (`/kind-sandbox.js`) and the same
 * stylesheet (`/kind-sandbox.css`, compiled from `app/globals.css`), so the
 * only thing that differs between the columns is the document boundary — which
 * is precisely what is under test.
 *
 * IT IS SERVED FROM `public/` ON PURPOSE. The sandbox route's CSP ends in
 * `frame-ancestors <app origin>`: a page opened from `file://` or from any
 * other origin is REFUSED by the browser and would prove nothing. The file is
 * git-ignored — it is a witness you regenerate, not an artifact you keep.
 *
 * The page exposes `window.__PARITY__` (per case: both columns' node counts,
 * text length, error banners, and the frame's reported heights) so a browser
 * agent can read the numbers instead of eyeballing the screenshot, and a
 * theme switch that flips `.dark` on this document — the same signal the app
 * emits — so the token re-send path is exercised, not only the mount path.
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformKindComponentBody } from "./transform/transform-kind-body";
import { getDefaultImportsForKindComponents } from "@/features/agent-apps/utils/allowed-imports";
import { inlineJson } from "./inline-json";
import { SANDBOX_PROTOCOL_VERSION } from "./protocol";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const OUT = resolve(ROOT, "public/__kind-sandbox-parity.html");

/** Plain react · design-system + overlay (tooltip) · markdown-importing. */
const DEFAULT_KEYS = [
    "wine_tasting_card",
    "agent_definition_card",
    "newsjacking_expert_article_default",
];

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

async function main(): Promise<void> {
    const keys = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_KEYS;
    const env = await loadEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false },
    });

    const { data: comps, error } = await sb
        .schema("content_ir")
        .from("kind_component")
        .select("id,component_key,component_source,config,kind_definition_id")
        .in("component_key", keys);
    if (error) throw new Error(`kind_component read failed: ${error.message}`);
    if (!comps || comps.length !== keys.length) {
        throw new Error(
            `Expected ${keys.length} live component rows, got ${comps?.length ?? 0}.`,
        );
    }

    const allowed = getDefaultImportsForKindComponents();
    const cases: unknown[] = [];

    for (const key of keys) {
        const row = comps.find((c) => c.component_key === key)!;
        const { data: kd } = await sb
            .schema("content_ir")
            .from("kind_definition")
            .select("kind,sample_data")
            .eq("id", row.kind_definition_id)
            .single();
        const { data: instances } = await sb
            .schema("content_ir")
            .from("kind_instance")
            .select("id,data")
            .eq("kind_definition_id", row.kind_definition_id)
            .is("deleted_at", null)
            .limit(2);

        const first = instances?.[0];
        const second = instances?.[1];
        const configured = Array.isArray(
            (row.config as Record<string, unknown> | null)?.allowed_imports,
        )
            ? ((row.config as Record<string, unknown>).allowed_imports as string[])
            : allowed;
        const { payload, error: compileError } = transformKindComponentBody(
            row.component_source as string,
            configured,
        );
        if (!payload) throw new Error(`${key} did not transform: ${compileError}`);

        cases.push({
            componentKey: key,
            kind: (kd?.kind as string) ?? "unknown",
            sourceBytes: (row.component_source as string).length,
            dataSource: first
                ? `live content_ir.kind_instance ${first.id}`
                : "live content_ir.kind_definition.sample_data",
            secondDataSource: second
                ? `live content_ir.kind_instance ${second.id}`
                : null,
            payload,
            data: first ? first.data : (kd?.sample_data ?? {}),
            // A SECOND live value for the same kind: posting it over the
            // protocol is how the resize proof is taken — same component, new
            // content, the frame must re-measure and the host must re-size.
            secondData: second ? second.data : null,
        });
    }

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kind sandbox — gate off vs gate on (S3 parity witness)</title>
<link rel="stylesheet" href="/kind-sandbox.css">
<style>
  body { margin: 0; padding: 20px; background: hsl(var(--background)); color: hsl(var(--foreground)); font-family: system-ui, sans-serif; }
  .case { margin: 0 0 28px; }
  .case > header { font: 12px ui-monospace, monospace; padding: 6px 0; color: hsl(var(--muted-foreground)); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
  .col > h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: hsl(var(--muted-foreground)); }
  /* THE CLIP — same as KindSandboxFrame and the sweep (S5b,
     sandbox/protocol.ts, THE READER'S VIEWPORT). */
  .col { min-width: 0; }
  .clip { overflow: hidden; min-width: 0; width: 100%; }
  iframe { border: 0; display: block; max-width: none; }
  .bar { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; padding: 8px 0 16px; background: hsl(var(--background)); }
  .bar button { font: 12px system-ui; padding: 6px 10px; border-radius: 6px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--foreground)); cursor: pointer; }
</style>
</head>
<body>
<div class="bar">
  <button id="toggle-theme" type="button">Toggle light / dark</button>
  <button id="swap-data" type="button">Swap in the second live value (resize proof)</button>
  <span id="state" style="font:12px ui-monospace,monospace"></span>
</div>
<div id="cases"></div>
<script src="/kind-sandbox.js"></script>
<script>
window.__CASES__ = ${inlineJson(cases)};
window.__PROTOCOL_VERSION__ = ${SANDBOX_PROTOCOL_VERSION};
window.__PARITY__ = {};

function rootTokens() {
  // The same collection the host does (features/content-ir/sandbox/theme-tokens.ts):
  // names out of the sheets, values out of the computed style.
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

function scheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** The width the HOST page's own media queries answer against (S5b). */
function readerViewportWidth() {
  return document.documentElement.clientWidth || window.innerWidth;
}

var host = document.getElementById("cases");
var ports = {};

window.__CASES__.forEach(function (item) {
  var section = document.createElement("section");
  section.className = "case";
  section.setAttribute("data-component-key", item.componentKey);
  section.innerHTML =
    '<header>' + item.componentKey + ' · kind=' + item.kind + ' · ' + item.sourceBytes +
    ' bytes of live source · data: ' + item.dataSource + '</header>' +
    '<div class="cols">' +
      '<div class="col"><h3>Gate OFF — rendered in this page</h3><div class="unframed" id="unframed-' + item.componentKey + '"></div></div>' +
      '<div class="col"><h3>Gate ON — rendered in the sandbox frame</h3><div class="clip" id="framed-' + item.componentKey + '"></div></div>' +
    '</div>';
  host.appendChild(section);

  // ── GATE OFF: straight into this document ──────────────────────────────
  var mount = section.querySelector('#unframed-' + item.componentKey);
  var offErrors = [];
  window.MatrxKindSandbox.mount(mount, item.payload, {
    props: {
      data: item.data, kind: item.kind, config: {}, uiOptions: {},
      runAction: function (key) { return Promise.resolve({ ok: false, error: "no action bridge in the witness: " + key }); },
      onResolve: function () {}
    },
    onError: function (m) { offErrors.push(m); }
  });

  // ── GATE ON: the real route, the real protocol ─────────────────────────
  var frameWrap = section.querySelector('#framed-' + item.componentKey);
  var frame = document.createElement("iframe");
  // THE ATTRIBUTE ORDER MATTERS: the sandbox attribute must be on the element
  // BEFORE the src starts the load, or the document is fetched under the wrong
  // policy (and some embedders block the request outright).
  frame.setAttribute("sandbox", "allow-scripts");
  frame.src = "/kind-sandbox";
  frame.title = item.componentKey + " — component";
  frame.style.height = "320px";
  frame.style.width = readerViewportWidth() + "px";
  frameWrap.appendChild(frame);

  var record = { componentKey: item.componentKey, offErrors: offErrors, onErrors: [], heights: [] };
  window.__PARITY__[item.componentKey] = record;

  frame.addEventListener("load", function () {
    var channel = new MessageChannel();
    ports[item.componentKey] = channel.port1;
    channel.port1.onmessage = function (event) {
      var msg = event.data || {};
      if (msg.type === "matrx:sandbox:size") {
        record.heights.push({ height: msg.height, contentHeight: msg.contentHeight, capped: !!msg.capped });
        frame.style.height = msg.height + "px";
      }
      if (msg.type === "matrx:sandbox:error") record.onErrors.push(msg.message);
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

document.getElementById("toggle-theme").addEventListener("click", function () {
  document.documentElement.classList.toggle("dark");
  var tokens = rootTokens();
  Object.keys(ports).forEach(function (key) {
    ports[key].postMessage({ type: "matrx:sandbox:theme", instanceId: key, themeTokens: tokens, colorScheme: scheme() });
  });
  document.getElementById("state").textContent = "theme: " + scheme();
});

document.getElementById("swap-data").addEventListener("click", function () {
  window.__CASES__.forEach(function (item) {
    if (!item.secondData) return;
    var port = ports[item.componentKey];
    if (!port) return;
    port.postMessage({ type: "matrx:sandbox:props", instanceId: item.componentKey,
      props: { data: item.secondData, kind: item.kind, config: {}, uiOptions: {} } });
  });
  document.getElementById("state").textContent = "second live value posted";
});

window.__READY__ = true;
</script>
</body>
</html>
`;

    await writeFile(OUT, html, "utf8");
    // eslint-disable-next-line no-console
    console.log(
        `✓ parity witness → ${OUT}\n  open http://localhost:3001/__kind-sandbox-parity.html (pnpm preview:start)`,
    );
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
        "[witness:kind-sandbox-parity] failed:",
        err instanceof Error ? err.message : err,
    );
    process.exit(1);
});
