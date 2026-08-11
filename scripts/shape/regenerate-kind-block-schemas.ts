/**
 * Re-emit `kind_definition.emitted_block_schema` + `emitted_fingerprint` from
 * the LIVE `data[]` + `kind_edge` graph through the ONE sanctioned TS emitter
 * (`kindSchemaToJsonSchema`, strict + `__kind` injected — the exact
 * composition `planKindMigration` materializes). The DB never emits.
 *
 * WHY IT EXISTS: the emitter is code, the stored block schema is data, and any
 * change to how the `__kind` discriminator is written puts the two out of
 * step. `emitted_block_schema` has no runtime reader today, so stale rows are
 * not a live correctness problem — but code and DB disagreeing is exactly what
 * the migration-parity tests exist to catch, so it gets reconciled rather than
 * tolerated.
 *
 * THE GATE IS SELF-VERIFYING, and deliberately narrow. A row is rewritten ONLY
 * when the freshly emitted schema is canonically identical to the stored one
 * once BOTH sides' `__kind` discriminators are normalized (a single-value
 * `enum` and a `const` express the same constraint, so the normalization is
 * lossless). That proves the stored bytes came from THIS emitter over THESE
 * fields and that the discriminator FORM is the only difference — in either
 * direction, so the script serves a change and its revert equally. Any other
 * difference — a schema python wrote, a row whose fields have since changed, a
 * kind the client cannot reconstruct at all (FOUND_DEFECTS D156) — is reported
 * loudly with the differing JSON paths and left untouched.
 *
 * This is NOT a general re-emitter and must not become one: a blind rewrite
 * would silently overwrite python-authored contracts with whatever the client
 * happens to be able to reconstruct, and would launder unrelated schema drift
 * into a "sync" commit.
 *
 *   pnpm shape:reemit-discriminator           # dry run — report
 *   pnpm shape:reemit-discriminator --apply   # write the eligible rows
 *
 * AFTER --apply: run `pnpm shape:revalidate --apply`. Every `kind_definition`
 * UPDATE bumps `version` via `platform._touch_row`, which version-strands the
 * canonical `kind_example` rows even though `emitted_json_schema` (what the
 * examples validate against) carries no `__kind` and is untouched here.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

import { fingerprintText } from "@/features/content-ir/core/fingerprint";
import { KIND_KEY } from "@/features/content-ir/core/kind-schema.types";
import type { KindSchema } from "@/features/content-ir/core/kind-schema.types";
import { kindSchemaToJsonSchema } from "@/features/content-ir/convert/kind-to-json-schema";
import {
  reconstructKindRegistry,
  type KindDefProjection,
  type KindEdgeProjection,
} from "@/features/content-ir/registry/schema-source-kind-tables";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const apply = process.argv.includes("--apply");

interface DefRow extends KindDefProjection {
  authoring_owner: string;
  emitted_block_schema: unknown;
  emitted_fingerprint: string | null;
}

/**
 * Every leaf path where two canonical JSON values disagree — so a refusal
 * names the ACTUAL difference instead of asking the next agent to go diff it
 * by hand. Capped, because an unbounded dump buries the finding.
 */
function leafDiff(a: unknown, b: unknown, path = "", out: string[] = []): string[] {
  if (out.length >= 6) return out;
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      leafDiff(a[key], b[key], `${path}/${key}`, out);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    a.forEach((item, i) => leafDiff(item, b[i], `${path}/${i}`, out));
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push(`${path || "/"}: stored=${JSON.stringify(a)} fresh=${JSON.stringify(b)}`);
  }
  return out;
}

/** Deep key sort — jsonb round trips reorder object keys; comparisons must not care. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = canonical(record[key]);
    return out;
  }
  return value;
}

/**
 * Collapse every `__kind` discriminator to one comparison form, whichever way
 * it is written: `{const: X}` and `{enum: [X]}` both become `{__kindSlug: X}`.
 * Only the `__kind` property is touched — a `const`/single-value `enum`
 * anywhere else stays put and will (correctly) fail the equality gate.
 */
function normalizeKindDiscriminator(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKindDiscriminator);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === KIND_KEY && child !== null && typeof child === "object" && !Array.isArray(child)) {
      const prop = child as Record<string, unknown>;
      const slug =
        typeof prop.const === "string"
          ? prop.const
          : Array.isArray(prop.enum) && prop.enum.length === 1 && typeof prop.enum[0] === "string"
            ? prop.enum[0]
            : null;
      if (slug !== null) {
        const { const: _c, enum: _e, ...rest } = prop;
        out[key] = { ...rest, __kindSlug: slug };
        continue;
      }
    }
    out[key] = normalizeKindDiscriminator(child);
  }
  return out;
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)",
    );
    process.exit(1);
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    db: { schema: "content_ir" },
  });

  const { data: defs, error: defErr } = await sb
    .from("kind_definition")
    .select(
      "id, kind, label, data, is_active, metadata, authoring_owner, emitted_block_schema, emitted_fingerprint",
    )
    .is("deleted_at", null);
  if (defErr) throw new Error(`kind_definition read failed: ${defErr.message}`);

  const { data: edges, error: edgeErr } = await sb
    .from("kind_edge")
    .select("parent_definition_id, field_name, child_definition_id, position")
    .is("deleted_at", null);
  if (edgeErr) throw new Error(`kind_edge read failed: ${edgeErr.message}`);

  const rows = (defs ?? []) as DefRow[];
  // The SAME reconstruction the client registry uses, so what we emit here is
  // what the frontend emits for the same row.
  const { schemas } = reconstructKindRegistry(
    rows as KindDefProjection[],
    (edges ?? []) as KindEdgeProjection[],
  );
  const resolveKind = (k: string): KindSchema | undefined => schemas[k];

  const eligible: { row: DefRow; schema: unknown; fingerprint: string }[] = [];
  const refused: { kind: string; owner: string; why: string }[] = [];

  for (const row of rows) {
    const stored = row.emitted_block_schema;
    // Only rows that actually carry a `__kind` discriminator are in scope.
    if (!JSON.stringify(stored ?? null).includes(`"${KIND_KEY}"`)) continue;

    const exported = kindSchemaToJsonSchema(row.kind, resolveKind, {
      strict: true,
      injectKind: true,
    });
    if (!exported) {
      refused.push({
        kind: row.kind,
        owner: row.authoring_owner,
        why: "no reconstructable field schema (FOUND_DEFECTS D156)",
      });
      continue;
    }

    const storedForm = canonical(normalizeKindDiscriminator(stored));
    const freshForm = canonical(normalizeKindDiscriminator(exported.schema));
    if (JSON.stringify(storedForm) !== JSON.stringify(freshForm)) {
      refused.push({
        kind: row.kind,
        owner: row.authoring_owner,
        why:
          "stored schema is ALREADY stale for reasons beyond the __kind discriminator — " +
          `${leafDiff(storedForm, freshForm).join(" | ")}`,
      });
      continue;
    }

    // Same canonicalization the planner uses (JSON.stringify of the emitted
    // object in emitter key order), so this matches what planKindMigration
    // would write for the same kind.
    const fingerprint = fingerprintText(JSON.stringify(exported.schema));
    if (
      fingerprint === row.emitted_fingerprint &&
      JSON.stringify(canonical(stored)) === JSON.stringify(canonical(exported.schema))
    ) {
      continue; // already in sync
    }

    eligible.push({ row, schema: exported.schema, fingerprint });
  }

  console.log(
    `kinds read: ${rows.length} | eligible: ${eligible.length} | refused: ${refused.length}`,
  );
  for (const e of eligible) {
    console.log(
      `  rewrite  ${e.row.kind}  ${e.row.emitted_fingerprint ?? "(null)"} -> ${e.fingerprint}`,
    );
  }
  for (const r of refused) {
    console.warn(`  REFUSED  ${r.kind} [${r.owner}] — ${r.why}`);
  }

  if (!apply) {
    console.log(
      eligible.length > 0
        ? "\nDry run. Re-run with --apply to write the eligible rows."
        : "\nNothing to do.",
    );
    return;
  }

  let written = 0;
  for (const e of eligible) {
    const { error } = await sb
      .from("kind_definition")
      .update({
        emitted_block_schema: e.schema as never,
        emitted_fingerprint: e.fingerprint,
      })
      .eq("id", e.row.id);
    if (error) {
      console.error(`  FAILED ${e.row.kind}: ${error.message}`);
      continue;
    }
    written += 1;
  }
  console.log(`\nwrote ${written}/${eligible.length} rows.`);
  if (written > 0) {
    console.log(
      "Now run `pnpm shape:revalidate --apply` — the version bump strands canonical examples.",
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
