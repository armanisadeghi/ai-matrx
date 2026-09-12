/**
 * apply-breakpoint-migration — runs the DD-123 ruling-8 rewrite over the live
 * organization-authored bodies and, with `--apply`, saves each one through the
 * ONE sanctioned write path.
 *
 * THE WRITE PATH IS NOT NEGOTIABLE. A component body is DATA in
 * `content_ir.kind_component.component_source`, and that column has rules:
 *
 *   · `saveKindComponentCode` (features/content-ir/studio/kind-component-code-service.ts)
 *     is the canonical writer — it runs the shared source gate, guards the
 *     `version` column optimistically so two editors cannot silently overwrite
 *     each other, and stamps `updated_by` with the signed-in actor;
 *   · the database trigger `zzz_component_author_gate` refuses a body written
 *     by anyone who is not AI Matrx staff, so this script signs in as a real
 *     person rather than using a service key;
 *   · bumping `version` SUPERSEDES any open `content_ir.kind_component_incident`
 *     for that kind (log_kind_component_incident: "a newer component version
 *     supersedes an open row, auto-resolved with a note"), so the run reports
 *     which incidents it closed rather than closing them silently.
 *
 *   pnpm migrate:kind-sandbox-breakpoints            # dry run + full diff
 *   pnpm migrate:kind-sandbox-breakpoints --apply
 *   pnpm migrate:kind-sandbox-breakpoints --keys=a,b
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteViewportBreakpoints } from "./migrate-viewport-breakpoints";
import { transformKindComponentBody } from "./transform/transform-kind-body";
import { getDefaultImportsForKindComponents } from "@/features/agent-apps/utils/allowed-imports";
import { componentSourceGate } from "@/features/agent-apps/utils/component-source-gate";
import {
    listKindComponentCode,
    saveKindComponentCode,
} from "@/features/content-ir/studio/kind-component-code-service";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const OUT_DIR = resolve(ROOT, ".kind-sandbox-parity");

function loadEnv(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const file of [".env.local", ".env"]) {
        let raw = "";
        try {
            raw = readFileSync(resolve(ROOT, file), "utf8");
        } catch {
            continue;
        }
        for (const line of raw.split("\n")) {
            if (!/^[A-Z0-9_]+=/.test(line)) continue;
            const i = line.indexOf("=");
            const key = line.slice(0, i);
            if (out[key] === undefined) {
                out[key] = line.slice(i + 1).replace(/^["']|["']$/g, "");
            }
        }
    }
    return out;
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const apply = argv.includes("--apply");
    const keysArg = argv.find((a) => a.startsWith("--keys="));
    const keys = keysArg ? keysArg.slice(7).split(",") : null;
    const env = loadEnv();

    // Reading is done with the service key (a sweep, not a person's session);
    // WRITING is done as a signed-in person, because the authoring gate and
    // `updated_by` both need a real actor.
    const reader = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SECRET_KEY,
        { auth: { persistSession: false } },
    );

    let query = reader
        .schema("content_ir")
        .from("kind_component")
        .select("id,component_key,component_source,kind_definition_id")
        .eq("source", "db")
        .is("deleted_at", null)
        .order("component_key");
    if (keys) query = query.in("component_key", keys);
    const { data: rows, error } = await query;
    if (error) throw new Error(`kind_component read failed: ${error.message}`);

    const planned: Array<{
        key: string;
        id: string;
        kindDefinitionId: string;
        variants: number;
        container: string;
        roots: number;
        next: string;
        before: string;
    }> = [];
    const refusals: Array<{ key: string; refusal: string }> = [];

    for (const row of rows ?? []) {
        const source = (row.component_source as string) ?? "";
        if (!source.trim()) continue;
        const result = rewriteViewportBreakpoints(source);
        if (result.refusal) {
            refusals.push({ key: row.component_key as string, refusal: result.refusal });
            continue;
        }
        if (!result.variants) continue;

        // PREFLIGHT. A rewritten body that does not compile, or that the shared
        // source gate would refuse, must never reach the database — the write
        // path would refuse it row by row and leave the corpus half migrated.
        const gate = componentSourceGate(result.next, { flavor: null });
        if (gate) {
            refusals.push({
                key: row.component_key as string,
                refusal: `The rewritten body is refused by the shared component source gate: ${gate}`,
            });
            continue;
        }
        const { payload, error: compileError } = transformKindComponentBody(
            result.next,
            getDefaultImportsForKindComponents(),
        );
        if (!payload) {
            refusals.push({
                key: row.component_key as string,
                refusal: `The rewritten body no longer compiles: ${compileError ?? "no reason given"}`,
            });
            continue;
        }

        planned.push({
            key: row.component_key as string,
            id: row.id as string,
            kindDefinitionId: row.kind_definition_id as string,
            variants: result.variants,
            container: result.container,
            roots: result.roots,
            next: result.next,
            before: source,
        });
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
        `${OUT_DIR}/breakpoint-migration-plan.json`,
        JSON.stringify(
            {
                plannedAt: new Date().toISOString(),
                bodies: planned.map(({ key, id, variants, container, roots }) => ({
                    key,
                    id,
                    variants,
                    container,
                    roots,
                })),
                refusals,
            },
            null,
            2,
        ),
    );
    for (const p of planned) {
        mkdirSync(`${OUT_DIR}/bodies`, { recursive: true });
        writeFileSync(`${OUT_DIR}/bodies/${p.key}.before.tsx`, p.before);
        writeFileSync(`${OUT_DIR}/bodies/${p.key}.after.tsx`, p.next);
    }

    // eslint-disable-next-line no-console
    console.log(
        `${planned.length} bodies would change · ${planned.reduce((n, p) => n + p.variants, 0)} variants rewritten · ${refusals.length} refused`,
    );
    for (const r of refusals) {
        // eslint-disable-next-line no-console
        console.log(`  REFUSED ${r.key}: ${r.refusal}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  before/after bodies → ${OUT_DIR}/bodies`);

    if (!apply) {
        // eslint-disable-next-line no-console
        console.log("\nDry run. Re-run with --apply to write these bodies.");
        return;
    }

    const writer = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: false } },
    );
    const { data: signIn, error: signInError } =
        await writer.auth.signInWithPassword({
            email: env.AI_ADMIN_USERNAME,
            password: env.AI_ADMIN_PASSWORD,
        });
    if (signInError || !signIn.user) {
        throw new Error(
            `Could not sign in as ${env.AI_ADMIN_USERNAME} to write component bodies: ${signInError?.message ?? "no user returned"}`,
        );
    }
    // eslint-disable-next-line no-console
    console.log(`\nWriting as ${signIn.user.email} (${signIn.user.id}).`);

    const written: Array<{ key: string; version: number }> = [];
    for (const p of planned) {
        const records = await listKindComponentCode(writer as any, p.kindDefinitionId);
        const record = records.find((r) => r.id === p.id);
        if (!record) {
            throw new Error(
                `${p.key}: the row disappeared between the plan and the write. Re-run the dry run.`,
            );
        }
        const saved = await saveKindComponentCode(writer as any, {
            component: record,
            componentSource: p.next,
        });
        written.push({ key: p.key, version: saved.version });
        // eslint-disable-next-line no-console
        console.log(
            `  ✓ ${p.key} — ${p.variants} variants, container ${p.container}, version ${record.version} → ${saved.version}`,
        );
    }
    writeFileSync(
        `${OUT_DIR}/breakpoint-migration-written.json`,
        JSON.stringify({ writtenAt: new Date().toISOString(), written }, null, 2),
    );
    // eslint-disable-next-line no-console
    console.log(`\n${written.length} bodies written.`);
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
        "[migrate:kind-sandbox-breakpoints] failed:",
        err instanceof Error ? err.message : err,
    );
    process.exit(1);
});
