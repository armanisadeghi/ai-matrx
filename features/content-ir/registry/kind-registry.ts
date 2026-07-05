/**
 * The canonical kind registry — ONE key (the kind slug), many facets.
 *
 * Loading tiers:
 * - eager: compiled-in system kinds (system-kinds.ts) — the pre-warm
 *          BOOTSTRAP FALLBACK, available at import so speculation and
 *          validation work from the first streamed byte.
 * - warm:  one flexible_data list fetch per app session (ensureWarm), fired
 *          by the first host that expects streamed content. DB rows are the
 *          schema source of truth: they OVERRIDE compiled schemas while the
 *          compiled facets (legacyBlockType, toLegacyServerData, toMarkdown,
 *          artifact, persistence) are preserved.
 * - cold:  unknown kind sighted mid-stream → single-row fetch by slug →
 *          `onSchemaArrived` waiters (ParseSessions) upgrade in place.
 *
 * Module singleton: the registry is app-global state like the store — every
 * host and session shares one instance.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { KindSchema } from "../core/kind-schema.types";
import type { SchemaResolver } from "../core/kind-parser";
import {
  getKindSchemaBySlugFromTables,
  listKindSchemasFromTables,
} from "./schema-source-kind-tables";
import { SYSTEM_KIND_DEFINITIONS } from "./system-kinds";
import type { KindDefinition } from "./kind-registry.types";

type SchemaArrivalListener = (kind: string, schema: KindSchema | null) => void;

class KindRegistry {
  private readonly defs = new Map<string, KindDefinition>();
  private readonly arrivalListeners = new Set<SchemaArrivalListener>();
  private readonly inFlight = new Set<string>();
  private readonly misses = new Set<string>();
  private warmPromise: Promise<void> | null = null;

  constructor(systemKinds: KindDefinition[]) {
    for (const def of systemKinds) {
      this.defs.set(def.kind, def);
    }
  }

  getDefinition(kind: string): KindDefinition | undefined {
    return this.defs.get(kind);
  }

  getSchema(kind: string): KindSchema | undefined {
    return this.defs.get(kind)?.schema ?? undefined;
  }

  listDefinitions(): KindDefinition[] {
    return [...this.defs.values()];
  }

  /** Static map view for one-shot normalize calls. */
  snapshotSchemas(): Record<string, KindSchema> {
    const out: Record<string, KindSchema> = {};
    for (const def of this.defs.values()) {
      if (def.schema) out[def.kind] = def.schema;
    }
    return out;
  }

  /**
   * Register or update a definition. System registration happens in the
   * constructor; this is the path for warm/cold arrivals and for features
   * registering component/artifact facets onto an existing kind.
   */
  upsertDefinition(def: KindDefinition): void {
    const existing = this.defs.get(def.kind);
    this.defs.set(def.kind, { ...existing, ...def });
  }

  /** One list fetch per app session — resolves when user kinds are loaded. */
  ensureWarm(): Promise<void> {
    if (!this.warmPromise) {
      this.warmPromise = listKindSchemasFromTables()
        .then(({ schemas }) => {
          for (const [kind, schema] of Object.entries(schemas)) {
            const existing = this.defs.get(kind);
            // DB rows override the SCHEMA (content_ir is the source of
            // truth once warm); compiled facets — legacyBlockType,
            // toLegacyServerData, toMarkdown, artifact, persistence —
            // survive via the spread. The compiled schema is only the
            // pre-warm bootstrap.
            this.defs.set(kind, {
              ...existing,
              kind,
              schema,
              schemaSource: "content_ir",
              tier: existing?.tier ?? "warm",
            });
          }
        })
        .catch((error) => {
          // Warm load failing must not kill streaming — cold fetches and
          // system kinds still work. Loud, then retryable.
          captureError({
            source: "content-ir",
            message: `kind-registry warm load failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            name: error instanceof Error ? error.name : undefined,
            stack: error instanceof Error ? error.stack : undefined,
            raw: error,
          });
          this.warmPromise = null;
        });
    }
    return this.warmPromise;
  }

  /** Cold fetch, fire-and-forget (the parser's SchemaResolver.request). */
  requestSchema(kind: string): void {
    if (this.getSchema(kind)) return;
    if (this.inFlight.has(kind) || this.misses.has(kind)) return;
    this.inFlight.add(kind);

    void (async () => {
      try {
        // The warm sweep may already be carrying it.
        await this.ensureWarm();
        let schema = this.getSchema(kind) ?? null;

        if (!schema) {
          schema = await getKindSchemaBySlugFromTables(kind);
        }

        if (schema) {
          this.upsertDefinition({
            kind,
            schema,
            schemaSource: "content_ir",
            tier: "cold",
          });
        } else {
          this.misses.add(kind);
        }

        this.notifyArrival(kind, schema);
      } catch (error) {
        captureError({
          source: "content-ir",
          message: `kind-registry cold fetch failed for "${kind}": ${
            error instanceof Error ? error.message : String(error)
          }`,
          relation: kind,
          name: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          raw: error,
        });
        this.notifyArrival(kind, null);
      } finally {
        this.inFlight.delete(kind);
      }
    })();
  }

  onSchemaArrived(listener: SchemaArrivalListener): () => void {
    this.arrivalListeners.add(listener);
    return () => {
      this.arrivalListeners.delete(listener);
    };
  }

  private notifyArrival(kind: string, schema: KindSchema | null): void {
    for (const listener of this.arrivalListeners) {
      listener(kind, schema);
    }
  }

  /** The parser-facing resolver — sync fast path + cold request. */
  resolver(): SchemaResolver {
    return {
      get: (kind) => this.getSchema(kind),
      request: (kind) => this.requestSchema(kind),
    };
  }
}

export const kindRegistry = new KindRegistry(SYSTEM_KIND_DEFINITIONS);
