/**
 * make-acceptance-harness — builds the BARE STATIC HTML page that proves the
 * frame runtime can compile and render real organization-authored components
 * with nothing but `kind-sandbox.js` and `kind-sandbox.css`.
 *
 * This is the S1 acceptance witness (DD-123 §2, acceptance (b)), not a demo and
 * not a test fixture. Every component body it renders is read live from
 * `content_ir.kind_component` and every data payload is live too — either a
 * real `kind_instance.data` row or the kind's own `kind_definition.sample_data`;
 * the page prints which, per component, so nobody can mistake one for the
 * other. A body this script invented would prove nothing.
 *
 *   pnpm harness:kind-sandbox <out-dir> [component-id ...]
 *
 * The emitted page has NO bundler, NO Next, NO network: it inlines the
 * Babel-transformed payloads the PARENT would post (`transformKindComponentBody`)
 * and calls `MatrxKindSandbox.mount` — exactly the boundary S2 will put a
 * `postMessage` across.
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transformKindComponentBody } from "./transform/transform-kind-body";
import { getDefaultImportsForKindComponents } from "@/features/agent-apps/utils/allowed-imports";
import { inlineJson } from "./inline-json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");

/** The three acceptance components: plain, markdown-importing, design-system. */
const DEFAULT_IDS = [
    "45e1bb83-304d-46ed-9f94-4e41581a1945", // wine_tasting_card — plain react
    "bbb283d2-120a-4f64-98c7-e8b981abe19d", // newsjacking_expert_article_default — imports MarkdownStream
    "1415cb17-2ad3-4c67-be04-c4daa24b06b2", // practice_prompt_card — @/components/ui/* incl. design-system
];

async function loadEnv(): Promise<Record<string, string>> {
    const raw = await readFile(join(ROOT, ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
        if (!/^[A-Z0-9_]+=/.test(line)) continue;
        const i = line.indexOf("=");
        out[line.slice(0, i)] = line
            .slice(i + 1)
            .replace(/^["']|["']$/g, "");
    }
    return out;
}

interface HarnessItem {
    id: string;
    componentKey: string;
    kind: string;
    sourceBytes: number;
    dataSource: string;
    payload: unknown;
    data: unknown;
}

async function main(): Promise<void> {
    const outDir = process.argv[2];
    if (!outDir) throw new Error("Usage: harness:kind-sandbox <out-dir> [id...]");
    const ids = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_IDS;

    const env = await loadEnv();
    const sb = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SECRET_KEY,
        { auth: { persistSession: false } },
    );

    const { data: comps, error } = await sb
        .schema("content_ir")
        .from("kind_component")
        .select("id,component_key,component_source,config,kind_definition_id")
        .in("id", ids);
    if (error) throw new Error(`kind_component read failed: ${error.message}`);
    if (!comps || comps.length !== ids.length) {
        throw new Error(
            `Expected ${ids.length} live component rows, got ${comps?.length ?? 0}.`,
        );
    }

    const allowed = getDefaultImportsForKindComponents();
    const items: HarnessItem[] = [];

    for (const id of ids) {
        const c = comps.find((x) => x.id === id)!;
        const { data: kd } = await sb
            .schema("content_ir")
            .from("kind_definition")
            .select("kind,sample_data")
            .eq("id", c.kind_definition_id)
            .single();
        const { data: inst } = await sb
            .schema("content_ir")
            .from("kind_instance")
            .select("id,data")
            .eq("kind_definition_id", c.kind_definition_id)
            .is("deleted_at", null)
            .limit(1);

        const live = inst?.[0];
        const data = live ? live.data : (kd?.sample_data ?? {});
        const dataSource = live
            ? `live content_ir.kind_instance ${live.id}`
            : `live content_ir.kind_definition.sample_data`;

        const configured = Array.isArray(
            (c.config as Record<string, unknown> | null)?.allowed_imports,
        )
            ? ((c.config as Record<string, unknown>)
                  .allowed_imports as string[])
            : allowed;

        const { payload, error: compileError } = transformKindComponentBody(
            c.component_source as string,
            configured,
        );
        if (!payload) {
            throw new Error(
                `${c.component_key} did not transform: ${compileError}`,
            );
        }

        items.push({
            id: c.id as string,
            componentKey: c.component_key as string,
            kind: (kd?.kind as string) ?? "unknown",
            sourceBytes: (c.component_source as string).length,
            dataSource,
            payload,
            data,
        });
    }

    await mkdir(outDir, { recursive: true });
    await copyFile(
        resolve(ROOT, "public/kind-sandbox.js"),
        join(outDir, "kind-sandbox.js"),
    );
    await copyFile(
        resolve(ROOT, "public/kind-sandbox.css"),
        join(outDir, "kind-sandbox.css"),
    );

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kind sandbox runtime — S1 acceptance</title>
<link rel="stylesheet" href="kind-sandbox.css">
<style>
  body { font: 14px system-ui, sans-serif; margin: 0; padding: 24px; }
  .case { margin: 0 0 32px; border: 1px solid #d4d4d8; border-radius: 10px; overflow: hidden; }
  .case > header { padding: 8px 12px; background: #f4f4f5; font: 12px ui-monospace, monospace; }
  .mount { padding: 16px; }
</style>
</head>
<body>
<h1>Kind sandbox frame runtime — bare-page acceptance</h1>
<p>This page loads <code>kind-sandbox.js</code> and <code>kind-sandbox.css</code> and nothing else.
Every component body and every data payload below was read live from the database.</p>
<div id="cases"></div>
<script src="kind-sandbox.js"></script>
<script>
  window.__HARNESS__ = ${inlineJson(items)};
  window.__RESULTS__ = [];
  var host = document.getElementById("cases");
  window.__HARNESS__.forEach(function (item) {
    var wrap = document.createElement("section");
    wrap.className = "case";
    wrap.setAttribute("data-component-key", item.componentKey);
    var head = document.createElement("header");
    head.textContent = item.componentKey + "  ·  kind=" + item.kind +
      "  ·  " + item.sourceBytes + " bytes of live source  ·  data: " + item.dataSource;
    var mount = document.createElement("div");
    mount.className = "mount";
    mount.id = "mount-" + item.componentKey;
    wrap.appendChild(head);
    wrap.appendChild(mount);
    host.appendChild(wrap);

    var errors = [];
    try {
      window.MatrxKindSandbox.mount(mount, item.payload, {
        props: {
          data: item.data,
          kind: item.kind,
          config: {},
          uiOptions: {},
          runAction: function (key) {
            return Promise.resolve({ ok: false, error: "No action bridge in the S1 harness: " + key });
          },
          onResolve: function () {}
        },
        onError: function (m) { errors.push(m); }
      });
    } catch (e) {
      errors.push(String(e && e.message ? e.message : e));
    }
    window.__RESULTS__.push({
      componentKey: item.componentKey,
      errors: errors,
      domNodes: mount.querySelectorAll("*").length,
      textLength: (mount.textContent || "").trim().length,
      sandboxErrorBanners: mount.querySelectorAll("[data-matrx-sandbox-error]").length
    });
  });
  window.__READY__ = true;
</script>
</body>
</html>
`;

    await writeFile(join(outDir, "index.html"), html, "utf8");
    // eslint-disable-next-line no-console
    console.log(`✓ harness → ${join(outDir, "index.html")}`);
    for (const i of items) {
        // eslint-disable-next-line no-console
        console.log(
            `  ${i.componentKey.padEnd(34)} ${String(i.sourceBytes).padStart(6)}b  ${i.dataSource}`,
        );
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
        "[harness:kind-sandbox] failed:",
        err instanceof Error ? err.message : err,
    );
    process.exit(1);
});
