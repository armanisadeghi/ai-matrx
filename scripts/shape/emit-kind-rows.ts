/**
 * Emit the exact `content_ir.kind_definition` column payloads for one or more
 * COMPILED kinds, so a kind migration is never hand-written.
 *
 *   pnpm shape:emit episode_title_options episode_title_option
 *
 * For each kind it prints, ready to paste into a migration:
 *   data                  — kindSchemaToStorage(schema).data
 *   emitted_block_schema  — kindSchemaToJsonSchema(strict, injectKind)
 *   emitted_json_schema   — THE SAME EXPORT. See below.
 *   emitted_fingerprint   — fingerprintText(JSON.stringify(block schema))
 *
 * 🚨 THERE IS NO "WIRE SHAPE" ANY MORE (Arman, 2026-08-23). `emitted_json_schema`
 * used to be emitted with `injectKind: false` on the doctrine that `__kind` was
 * envelope framing added at emit time. That doctrine is DEAD: `__kind` is part
 * of the data (KINDS_EVERYWHERE_PLAN §4.2), and because `emitted_json_schema` is
 * both what every Python validator reads AND what `response_format_for_kind`
 * binds an agent to, a marker-free export made 493 of 738 live kinds ship a
 * schema that FORBADE their own identity — a bound producer was structurally
 * unable to say what it was emitting. Both columns now carry the marker.
 *
 * The two columns remain distinct COLUMNS so nothing downstream has to change
 * shape, but they are emitted from the same call. Never reintroduce
 * `injectKind: false` here.
 *
 * The converters ARE the source of truth (the same ones the client registry
 * and `regenerate-kind-block-schemas.ts` use), so what this prints is exactly
 * what the frontend would emit for the same row. Read-only: it touches no
 * database.
 */

import { SYSTEM_KIND_DEFINITIONS } from "@/features/content-ir/registry/system-kinds";
import { kindSchemaToStorage } from "@ai-matrx/content-ir";
import { kindSchemaToJsonSchema } from "@ai-matrx/content-ir";
import { fingerprintText } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";

const schemas = new Map<string, KindSchema>();
for (const def of SYSTEM_KIND_DEFINITIONS) {
  if (def.schema) schemas.set(def.kind, def.schema);
}
const resolve = (kind: string): KindSchema | undefined => schemas.get(kind);

const requested = process.argv.slice(2);
if (requested.length === 0) {
  console.error("usage: pnpm shape:emit <kind> [<kind>...]");
  process.exit(1);
}

for (const kind of requested) {
  const schema = resolve(kind);
  if (!schema) {
    console.error(`\n### ${kind}\nNOT a compiled kind (no schema in SYSTEM_KIND_DEFINITIONS).`);
    process.exitCode = 1;
    continue;
  }
  const storage = kindSchemaToStorage(schema);
  const block = kindSchemaToJsonSchema(kind, resolve, {
    strict: true,
    injectKind: true,
  });
  // Same options as `block` — see the header. A kind's schema declares its
  // own identity, in both columns.
  const wire = kindSchemaToJsonSchema(kind, resolve, {
    strict: true,
    injectKind: true,
  });
  if (!block || !wire) {
    console.error(`\n### ${kind}\nconverter declined this kind.`);
    process.exitCode = 1;
    continue;
  }

  console.log(`\n### ${kind}`);
  console.log(`-- data`);
  console.log(JSON.stringify(storage.data));
  console.log(`-- edges`);
  console.log(JSON.stringify(storage.edges));
  console.log(`-- emitted_block_schema`);
  console.log(JSON.stringify(block.schema));
  console.log(`-- emitted_json_schema`);
  console.log(JSON.stringify(wire.schema));
  console.log(`-- emitted_fingerprint`);
  console.log(fingerprintText(JSON.stringify(block.schema)));
}
