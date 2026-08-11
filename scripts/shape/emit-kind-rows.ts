/**
 * Emit the exact `content_ir.kind_definition` column payloads for one or more
 * COMPILED kinds, so a kind migration is never hand-written.
 *
 *   pnpm shape:emit episode_title_options episode_title_option
 *
 * For each kind it prints, ready to paste into a migration:
 *   data                  — kindSchemaToStorage(schema).data
 *   emitted_block_schema  — kindSchemaToJsonSchema(strict, injectKind)   ← has __kind
 *   emitted_json_schema   — kindSchemaToJsonSchema(strict, no inject)    ← wire shape
 *   emitted_fingerprint   — fingerprintText(JSON.stringify(block schema))
 *
 * The converters ARE the source of truth (the same ones the client registry
 * and `regenerate-kind-block-schemas.ts` use), so what this prints is exactly
 * what the frontend would emit for the same row. Read-only: it touches no
 * database.
 */

import { SYSTEM_KIND_DEFINITIONS } from "@/features/content-ir/registry/system-kinds";
import { kindSchemaToStorage } from "@/features/content-ir/registry/kind-storage-transform";
import { kindSchemaToJsonSchema } from "@/features/content-ir/convert/kind-to-json-schema";
import { fingerprintText } from "@/features/content-ir/core/fingerprint";
import type { KindSchema } from "@/features/content-ir/core/kind-schema.types";

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
  const wire = kindSchemaToJsonSchema(kind, resolve, {
    strict: true,
    injectKind: false,
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
