/**
 * kindBinding — pure logic for binding an agent's `output_schema` to a
 * registered Content IR kind (the Shape system).
 *
 * The ONE emission channel proven live today (aidream `ai_task.py`:
 * `output_schema` → `agent_output_contract` → `response_format_for_kind`)
 * consumes exactly the envelope the working education agents carry:
 * `{ name, strict, schema }` where `schema` is the kind's canonical STRICT
 * block export — `kindSchemaToJsonSchema(kind, resolver, { strict: true,
 * injectKind: true })` — the same composition `kind-migration-plan.ts`
 * materializes into `kind_definition.emitted_block_schema`. Writing that
 * export byte-for-byte means every agent bound to the same kind fingerprints
 * identically (aidream `schema_fingerprint` canonicalizes with sorted keys),
 * and the `__kind` discriminators make the payload self-identifying for the
 * render pipeline.
 *
 * Everything here is jest-testable without a DB: callers hand in the catalog
 * entries + resolver from `features/content-ir/registry/kind-catalog.ts`.
 */

import type { KindSchema } from "@/features/content-ir/core/kind-schema.types";
import {
  kindSchemaToJsonSchema,
  type KindJsonSchemaExport,
} from "@/features/content-ir/convert/kind-to-json-schema";
import type { KindCatalogEntry } from "@/features/content-ir/registry/kind-catalog";
import { fingerprintText } from "@/features/content-ir/core/fingerprint";
import type { OutputSchema } from "@/features/agents/types/json-schema";

/**
 * Families that must never appear in the binder: generated data-only machine
 * contracts for tools / actions / workflow edges. `agent_io` is NOT excluded —
 * those rows ARE published agent output contracts (the proven channel) — but
 * it earns no gate bypass: an agent_io row passes the same `is_active` gate
 * as every other kind below.
 */
const EXCLUDED_FAMILIES: ReadonlySet<string> = new Set([
  "tool_io",
  "action_io",
  "workflow_io",
]);

/**
 * Whether a catalog entry belongs in the "Bind to a kind" picker.
 *
 *   - excluded machine-contract families (tool_io / action_io / workflow_io)
 *     never show;
 *   - kinds with a DB row — `agent_io` contracts included — require the
 *     dual-gate `is_active` verdict (Arman's law: is_active gates trust);
 *   - compiled-only system kinds (no DB row → usually no verdict) stay
 *     eligible — shipped code is the platform floor — UNLESS the entry is
 *     explicitly marked inactive;
 *   - schema-less (scalar/passthrough) kinds are noise for structured output.
 */
export function isKindBindable(entry: KindCatalogEntry): boolean {
  if (entry.family !== null && EXCLUDED_FAMILIES.has(entry.family)) {
    return false;
  }
  if (Object.keys(entry.fields).length === 0) return false;
  if (entry.dbRowId !== null) return entry.isActive === true;
  return entry.source === "system" && entry.isActive !== false;
}

/** The picker's list: bindable entries, sorted by kind slug. */
export function listBindableKinds(
  entries: KindCatalogEntry[],
): KindCatalogEntry[] {
  return entries.filter(isKindBindable);
}

export interface KindBoundOutputSchema {
  outputSchema: OutputSchema;
  /**
   * Referenced kinds the resolver could not supply — surfaced loudly by the
   * caller (the export still validates structurally via permissive stubs).
   */
  unresolved: string[];
}

/**
 * The canonical written shape for one kind: `{ name, strict, schema }` with
 * the STRICT, `__kind`-injected block export. Key order matches the admin
 * Schema explorer's export payload so both surfaces produce byte-identical
 * JSON for the same kind. Null when the resolver does not know the kind.
 */
export function buildKindOutputSchema(
  kind: string,
  resolve: (kind: string) => KindSchema | undefined,
): KindBoundOutputSchema | null {
  const exported: KindJsonSchemaExport | null = kindSchemaToJsonSchema(
    kind,
    resolve,
    { strict: true, injectKind: true },
  );
  if (!exported) return null;
  return {
    outputSchema: {
      name: exported.name,
      strict: exported.strict,
      // MATRX-EXCEPTION: JsonSchemaNode is the convert twin's generic node
      // (Record<string, unknown>); OutputSchema.schema is the agents feature's
      // structural JsonSchema. Same JSON at runtime — the generated-export
      // boundary is re-typed here exactly once (mirrors OutputSchemaTab's
      // documented SettingsJsonEditor boundary).
      schema: exported.schema as OutputSchema["schema"],
    },
    unresolved: exported.unresolved,
  };
}

/**
 * Order-insensitive canonical fingerprint of a JSON value — sorted keys, no
 * whitespace — mirroring aidream `schema_fingerprint`'s canonicalization
 * (`json.dumps(..., sort_keys=True)`). Two agents bound to the same kind
 * fingerprint identically even after a jsonb round trip reorders keys.
 */
export function canonicalSchemaFingerprint(value: unknown): string {
  return fingerprintText(canonicalJson(value));
}

/** The canonical (sorted-keys, no-whitespace) JSON text itself — the byte
 * form two equal-modulo-key-order values share. Exported for fidelity tests. */
export function canonicalJson(value: unknown): string {
  return canonicalStringify(value);
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const parts = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`);
  return `{${parts.join(",")}}`;
}

/**
 * The schema payload aidream's `agent_output_contract` fingerprints: the
 * envelope's `schema` member when present, else the whole object (mirrors
 * `output_schema.get("schema") or output_schema` in matrx_ai/kinds.py).
 */
export function schemaPayloadOf(
  outputSchema: Record<string, unknown>,
): unknown {
  const inner = outputSchema.schema;
  return inner !== null && typeof inner === "object" && !Array.isArray(inner)
    ? inner
    : outputSchema;
}

/**
 * Fingerprint index over every bindable kind's canonical written schema —
 * compute once per catalog snapshot (useMemo in the UI), then `matchKind…`
 * is a single fingerprint + Map lookup per keystroke.
 */
export function buildKindFingerprintIndex(
  entries: KindCatalogEntry[],
  resolve: (kind: string) => KindSchema | undefined,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of listBindableKinds(entries)) {
    const built = buildKindOutputSchema(entry.kind, resolve);
    if (!built) continue;
    const fingerprint = canonicalSchemaFingerprint(built.outputSchema.schema);
    // First writer wins on a (defect-grade) fingerprint collision.
    if (!index.has(fingerprint)) index.set(fingerprint, entry.kind);
  }
  return index;
}

/**
 * Which registered kind (if any) the current buffer's schema fingerprints to.
 * Order-insensitive, so it recognizes a bound schema after DB jsonb round
 * trips AND a hand-pasted admin export. Returns the kind slug or null.
 */
export function matchKindForSchema(
  parsed: Record<string, unknown> | null,
  index: Map<string, string>,
): string | null {
  if (!parsed || Object.keys(parsed).length === 0) return null;
  return index.get(canonicalSchemaFingerprint(schemaPayloadOf(parsed))) ?? null;
}
