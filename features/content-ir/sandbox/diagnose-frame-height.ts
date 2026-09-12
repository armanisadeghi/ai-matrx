/**
 * diagnose-frame-height — the LOCKSTEP DOM WALK behind the frame (DD-123 S5b).
 *
 * WHAT IT IS FOR, and why it exists beside the pixel sweep. The sweep answers
 * "do these two renders differ"; it cannot answer "where, and why". This
 * renders one live body twice in ONE document — unframed in the page, framed
 * in a `/kind-sandbox` iframe — then walks both DOM trees in lockstep and
 * prints the FIRST element whose box or computed style diverges, with the
 * property that moved. It found the S5b cause (the app's own
 * `@media (max-width: 768px)` block firing inside the frame) in one run, after
 * a whole session of pixel diffing had ruled things out and named nothing.
 *
 *   pnpm tsx features/content-ir/sandbox/diagnose-frame-height.ts key1,key2
 *   DIAG_OUT=<dir>            where the per-body JSON lands (default /tmp)
 *   DIAG_PAGE_WIDTH=700       the HOST page's viewport — the S5b control
 *   KEEP_DIAG=1               leave public/__kind-sandbox-diag.html behind
 *
 * 🚨 IT IS A DIAGNOSTIC, NEVER A PARITY PROOF. The iframe here is SAME-ORIGIN
 * and carries no `sandbox` attribute, because reading `contentDocument` is the
 * whole point — so the one thing this cannot speak about is isolation. The
 * route, the CSP header, the bundle and the protocol are the real ones, and
 * layout does not depend on the sandbox attribute; but a claim that the
 * product is safe, or that the shipped frame matches the page, comes from
 * `pnpm sweep:kind-sandbox-parity` and `browser/kind-sandbox.spec.ts`, never
 * from here.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformKindComponentBody } from "./transform/transform-kind-body";
import { getDefaultImportsForKindComponents } from "@/features/agent-apps/utils/allowed-imports";
import { inlineJson } from "./inline-json";
import { SANDBOX_PROTOCOL_VERSION } from "./protocol";
import { launch } from "./parity/cdp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const ORIGIN = process.env.PARITY_ORIGIN ?? "http://localhost:3001";

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

async function buildCases(keys: string[]) {
    const env = loadEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false },
    });
    const { data: comps, error } = await sb
        .schema("content_ir")
        .from("kind_component")
        .select("component_key,component_source,config,kind_definition_id")
        .eq("source", "db")
        .is("deleted_at", null)
        .in("component_key", keys);
    if (error) throw new Error(error.message);
    const rows = (comps ?? []) as any[];
    const defIds = [...new Set(rows.map((r) => r.kind_definition_id))];
    const { data: defs } = await sb
        .schema("content_ir")
        .from("kind_definition")
        .select("id,kind,sample_data")
        .in("id", defIds);
    const defMap = new Map((defs ?? []).map((d: any) => [d.id, d]));
    const { data: instRows } = await sb
        .schema("content_ir")
        .from("kind_instance")
        .select("id,kind_definition_id,data")
        .in("kind_definition_id", defIds)
        .is("deleted_at", null);
    const instances = new Map<string, any>();
    for (const r of instRows ?? []) {
        if (!instances.has(r.kind_definition_id as string)) instances.set(r.kind_definition_id as string, r);
    }
    const allowed = getDefaultImportsForKindComponents();
    const cases: any[] = [];
    for (const key of keys) {
        const row = rows.find((r) => r.component_key === key);
        if (!row) throw new Error(`not a live db body: ${key}`);
        const configured = Array.isArray(row.config?.allowed_imports)
            ? row.config.allowed_imports
            : allowed;
        const { payload } = transformKindComponentBody(row.component_source, configured);
        if (!payload) throw new Error(`${key} did not compile`);
        const def: any = defMap.get(row.kind_definition_id);
        const live = instances.get(row.kind_definition_id);
        cases.push({
            componentKey: key,
            kind: def?.kind ?? "unknown",
            payload,
            data: live ? live.data : (def?.sample_data ?? {}),
        });
    }
    return cases;
}

const WALK = `
window.__PROBE__ = {};

/** The style properties that can change a box's height or its position. */
var PROPS = ["display","position","boxSizing","fontFamily","fontSize","lineHeight","letterSpacing",
  "fontWeight","fontStretch","fontVariationSettings","textRendering","fontSynthesis","whiteSpace",
  "marginTop","marginBottom","marginLeft","marginRight","paddingTop","paddingBottom","paddingLeft","paddingRight",
  "borderTopWidth","borderBottomWidth","borderLeftWidth","borderRightWidth",
  "width","height","minHeight","maxHeight","maxWidth","minWidth","flexDirection","flexWrap","gap","rowGap","columnGap",
  "gridTemplateColumns","gridTemplateRows","alignItems","justifyContent","overflowX","overflowY",
  "transform","zoom","containerType","wordSpacing","textSizeAdjust","webkitTextSizeAdjust","tabSize",
  "textWrap","textWrapStyle","hyphens","overflowWrap","wordBreak"];

function desc(el) {
  return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
    (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).slice(0,6).join(".") : "");
}

function snap(el, originTop, originLeft) {
  var r = el.getBoundingClientRect();
  var cs = el.ownerDocument.defaultView.getComputedStyle(el);
  var styles = {};
  for (var i = 0; i < PROPS.length; i++) styles[PROPS[i]] = cs[PROPS[i]];
  return {
    desc: desc(el),
    top: +(r.top - originTop).toFixed(2),
    left: +(r.left - originLeft).toFixed(2),
    width: +r.width.toFixed(2),
    height: +r.height.toFixed(2),
    text: (el.childNodes.length === 1 && el.firstChild.nodeType === 3) ? el.textContent.slice(0,60) : null,
    styles: styles
  };
}

/**
 * Walk both trees in lockstep. Returns the list of divergences (first 12),
 * each naming what differs.
 */
window.__WALK__ = function (index, tolerance) {
  tolerance = tolerance || 0.75;
  var offHost = document.getElementById('off-' + index);
  var frame = document.querySelector('#on-' + index + ' iframe');
  var fdoc = frame.contentDocument;
  var onHost = fdoc.getElementById('root');
  var offOrigin = offHost.getBoundingClientRect();
  var onOrigin = onHost.getBoundingClientRect();

  var out = { hostBoxes: {
      off: snap(offHost, offOrigin.top, offOrigin.left),
      on: snap(onHost, onOrigin.top, onOrigin.left)
    },
    docBoxes: {
      onHtml: snap(fdoc.documentElement, onOrigin.top, onOrigin.left),
      onBody: snap(fdoc.body, onOrigin.top, onOrigin.left)
    },
    structureMismatch: null, divergences: [], compared: 0 };

  var stack = [[offHost, onHost, ""]];
  while (stack.length && out.divergences.length < 12) {
    var pair = stack.shift();
    var a = pair[0], b = pair[1], path = pair[2];
    var ac = a.children, bc = b.children;
    if (ac.length !== bc.length) {
      out.structureMismatch = out.structureMismatch || (path + " child count off=" + ac.length + " on=" + bc.length);
      continue;
    }
    for (var i = 0; i < ac.length; i++) {
      var sa = snap(ac[i], offOrigin.top, offOrigin.left);
      var sb = snap(bc[i], onOrigin.top, onOrigin.left);
      out.compared++;
      var diffs = [];
      if (Math.abs(sa.height - sb.height) > tolerance) diffs.push("height " + sa.height + " vs " + sb.height);
      if (Math.abs(sa.top - sb.top) > tolerance) diffs.push("top " + sa.top + " vs " + sb.top);
      if (Math.abs(sa.width - sb.width) > tolerance) diffs.push("width " + sa.width + " vs " + sb.width);
      var styleDiffs = [];
      for (var k in sa.styles) if (sa.styles[k] !== sb.styles[k]) styleDiffs.push(k + ": " + sa.styles[k] + " | " + sb.styles[k]);
      if (diffs.length || styleDiffs.length) {
        out.divergences.push({ path: path + "/" + i, el: sa.desc, elOn: sb.desc, text: sa.text, box: diffs, style: styleDiffs });
      }
      stack.push([ac[i], bc[i], path + "/" + i]);
    }
  }
  return out;
};
`;

function pageHtml(cases: any[]): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>kind sandbox height diagnosis</title>
<link rel="stylesheet" href="/kind-sandbox.css">
<style>
  body { margin: 0; padding: 16px; background: hsl(var(--background)); color: hsl(var(--foreground));
         font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif); }
  .case { margin: 0 0 24px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
  .col { min-width: 0; }
  iframe { width: 100%; border: 0; display: block; }
</style>
</head>
<body>
<div id="cases"></div>
<script src="/kind-sandbox.js"></script>
<script>
window.__CASES__ = ${inlineJson(cases)};
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

${WALK}
window.onerror = function (m, u, l, c, e) { window.__ERR__ = String(m) + " @" + l + ":" + c; };
var host = document.getElementById("cases");
window.__CASES__.forEach(function (item, index) {
  var section = document.createElement("section");
  section.className = "case";
  section.innerHTML = '<div class="cols">' +
      '<div class="col"><div id="off-' + index + '"></div></div>' +
      '<div class="col"><div id="on-' + index + '"></div></div>' +
    '</div>';
  host.appendChild(section);
  var record = { componentKey: item.componentKey, index: index, heights: [], onErrors: [] };
  window.__PARITY__[item.componentKey] = record;

  window.MatrxKindSandbox.mount(document.getElementById('off-' + index), item.payload, {
    props: { data: item.data, kind: item.kind, config: {}, uiOptions: {},
      runAction: function (k) { return Promise.resolve({ ok: false, error: "no bridge: " + k }); },
      onResolve: function () {} },
    onError: function (m) { record.onErrors.push("off: " + String(m)); }
  });

  var frameWrap = document.getElementById('on-' + index);
  var frame = document.createElement("iframe");
  // SAME-ORIGIN on purpose: the diagnosis must read the frame's own DOM.
  frame.src = "/kind-sandbox";
  frame.style.height = "200px";
  frame.style.width = (document.documentElement.clientWidth || window.innerWidth) + "px";
  frame.style.maxWidth = "none";
  frameWrap.style.overflow = "hidden";
  frameWrap.style.width = "100%";
  frameWrap.style.minWidth = "0";
  frameWrap.appendChild(frame);
  frame.addEventListener("load", function () {
    var channel = new MessageChannel();
    channel.port1.onmessage = function (event) {
      var msg = event.data || {};
      if (msg.type === "matrx:sandbox:size") { record.heights.push(msg.height); frame.style.height = msg.height + "px"; }
      if (msg.type === "matrx:sandbox:error") record.onErrors.push("on: " + String(msg.message));
    };
    channel.port1.start();
    frame.contentWindow.postMessage({
      type: "matrx:sandbox:init",
      protocolVersion: ${SANDBOX_PROTOCOL_VERSION},
      instanceId: item.componentKey,
      kind: item.kind,
      body: item.payload,
      propsTransform: null,
      props: { data: item.data, kind: item.kind, config: {}, uiOptions: {} },
      themeTokens: rootTokens(),
      colorScheme: scheme(),
      readerViewportWidth: document.documentElement.clientWidth || window.innerWidth,
      contentWidth: frameWrap.clientWidth
    }, location.origin, [channel.port2]);
  });
});
window.__SETTLED__ = function () {
  var keys = Object.keys(window.__PARITY__);
  for (var i = 0; i < keys.length; i++) if (window.__PARITY__[keys[i]].heights.length === 0) return false;
  return true;
};
window.__READY__ = true;
</script>
</body>
</html>
`;
}

async function main() {
    const keys = (process.argv[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!keys.length) throw new Error("usage: diagnose-frame-height.ts key1,key2");
    const cases = await buildCases(keys);
    const file = resolve(ROOT, "public/__kind-sandbox-diag.html");
    writeFileSync(file, pageHtml(cases), "utf8");
    const page = await launch({ width: Number(process.env.DIAG_PAGE_WIDTH ?? 1400), height: 6000 });
    try {
        await page.navigate(`${ORIGIN}/__kind-sandbox-diag.html`);
        for (let i = 0; i < 60; i++) {
            const ok = await page.evaluate<boolean>("!!window.__READY__ && window.__SETTLED__()").catch(() => false);
            if (ok) break;
            await new Promise((r) => setTimeout(r, 500));
        }
        await new Promise((r) => setTimeout(r, 2000));
        for (let i = 0; i < cases.length; i++) {
            const out = await page.evaluate<any>(`JSON.stringify(window.__WALK__(${i}))`);
            const parsed = typeof out === "string" ? JSON.parse(out) : out;
            // eslint-disable-next-line no-console
            console.log(`\n===== ${cases[i].componentKey} =====`);
            // eslint-disable-next-line no-console
            const outFile = `${process.env.DIAG_OUT ?? "/tmp"}/${cases[i].componentKey}.json`;
            writeFileSync(outFile, JSON.stringify(parsed, null, 2), "utf8");
            console.log("wrote", outFile, "divergences:", parsed.divergences.length, "compared:", parsed.compared,
                "offH:", parsed.hostBoxes.off.height, "onH:", parsed.hostBoxes.on.height);
        }
        const state = await page.evaluate<any>("JSON.stringify(window.__PARITY__)");
        // eslint-disable-next-line no-console
        console.log("\nSTATE:", typeof state === "string" ? state : JSON.stringify(state));
    } finally {
        await page.close();
        if (!process.env.KEEP_DIAG) rmSync(file, { force: true });
    }
}

main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
});
