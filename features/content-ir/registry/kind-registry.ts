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
import type { KindSchema } from "@ai-matrx/content-ir";
import {
  setJsonRootKeyLookup,
  type SchemaResolver,
} from "@ai-matrx/content-ir";
import {
  getKindSchemaAndMetaBySlugFromTables,
  listKindSchemasFromTables,
} from "./schema-source-kind-tables";
import { SYSTEM_KIND_DEFINITIONS } from "./system-kinds";
import { getSurfaceForJsonRootKey } from "./surface-registry";
import type { KindDefinition } from "@ai-matrx/content-ir";

type SchemaArrivalListener = (kind: string, schema: KindSchema | null) => void;

/** One scream per kind per session — a warm sweep re-reports nothing. */
const reportedFieldlessWarmKinds = new Set<string>();

/**
 * Loud recovery: the schema adapter returned a fieldless object override even
 * though it must omit unflattenable object contracts. The compiled floor is
 * kept (see `ensureWarm`) and the adapter invariant failure is captured once.
 */
function reportFieldlessWarmSchema(kind: string): void {
  if (reportedFieldlessWarmKinds.has(kind)) return;
  reportedFieldlessWarmKinds.add(kind);
  const message = `[content-ir] schema adapter returned an unusable fieldless override for "${kind}" — keeping the compiled schema so the kind still parses.`;
  try {
    captureError({
      source: "content-ir",
      message,
      operation: "select",
      relation: kind,
      callSite: "KindRegistry.ensureWarm",
      hint: "The content_ir schema source must omit unavailable object schemas instead of returning an empty field map.",
      raw: { kind, recovery: "compiled_schema_retained" },
    });
  } catch {
    /* diagnostics must never break registry recovery */
  }
}

class KindRegistry {
  private readonly defs = new Map<string, KindDefinition>();
  private readonly arrivalListeners = new Set<SchemaArrivalListener>();
  private readonly inFlight = new Set<string>();
  private readonly misses = new Set<string>();
  private warmPromise: Promise<void> | null = null;
  /**
   * Monotonic registry version — bumps whenever definitions change (warm
   * ingest, cold arrival, upsert). The render seam's repaint hook
   * (useContentIrRegistryVersion) subscribes to this so a schema that lands
   * AFTER a region finalized re-runs the kind route on the frozen envelope.
   */
  private version = 0;
  private readonly versionListeners = new Set<() => void>();
  /**
   * PER-KIND versions + listeners — the granular repaint seam. A cold/warm
   * arrival for kind X must re-render ONLY mounted blocks of kind X (the
   * global counter would re-run the route on every block in every
   * conversation). `epoch` covers wholesale invalidation (rare).
   */
  private readonly kindVersions = new Map<string, number>();
  private readonly kindListeners = new Map<string, Set<() => void>>();
  private epoch = 0;
  /**
   * `emitted_json_schema` per kind, kept BESIDE the definitions.
   *
   * Python-owned kinds store only the emitted JSON Schema — `data` is NULL,
   * so `storageToKindSchema` produces nothing and `KindDefinition.schema`
   * stays undefined (344 of 392 undeclared renderable kinds on 2026-08-25).
   * The loading-slug derivation needs SOME description of the shape to pick a
   * silhouette, so the emitted contract rides along here rather than being
   * discarded. A side map (not a new `KindDefinition` field) because that type
   * is owned by `@ai-matrx/content-ir`.
   */
  private readonly emittedSchemas = new Map<string, unknown>();
  /** Declared `metadata.loading_component` per kind — same reason as above. */
  private readonly declaredLoading = new Map<string, string>();

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

  /** The kind's `emitted_json_schema`, when the source carried one. */
  getEmittedJsonSchema(kind: string): unknown {
    return this.emittedSchemas.get(kind);
  }

  /**
   * Record an emitted contract for a kind (warm/cold ingest only).
   *
   * BUMPS the kind. A loading silhouette is DERIVED from this schema, so for
   * a Python-owned kind (`data` NULL, no parser schema, therefore never in
   * the warm loop's `bumpKind`) this setter is the only moment its shape
   * becomes knowable. Without the bump, a mounted slot's repaint key never
   * moved and it sat on the shapeless generic skeleton for the whole run —
   * precisely the case the slot exists for.
   */
  setEmittedJsonSchema(kind: string, schema: unknown): void {
    if (schema === null || schema === undefined) return;
    if (this.emittedSchemas.get(kind) === schema) return;
    this.emittedSchemas.set(kind, schema);
    this.bumpKind(kind);
  }

  /**
   * The kind's DECLARED `metadata.loading_component`, from the catalog entry.
   *
   * Read this rather than `getDefinition(kind)?.loadingComponent` when all you
   * need is the slug: a kind whose `data` is NULL never produces a
   * `KindDefinition` at all (the warm loop only walks kinds that yielded a
   * parser schema), so its declared slug is invisible on the definition — it
   * lives only here.
   */
  getDeclaredLoadingComponent(kind: string): string | null {
    return (
      this.defs.get(kind)?.loadingComponent ??
      this.declaredLoading.get(kind) ??
      null
    );
  }

  /**
   * Record a declared loading slug for a kind (warm/cold ingest only).
   * BUMPS the kind — same reason as `setEmittedJsonSchema`: this is where a
   * Python-owned kind's declared silhouette arrives, and a mounted slot has
   * to repaint when it does.
   */
  setDeclaredLoadingComponent(kind: string, slug: string | null): void {
    if (!slug) return;
    if (this.declaredLoading.get(kind) === slug) return;
    this.declaredLoading.set(kind, slug);
    this.bumpKind(kind);
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
    this.bumpKind(def.kind);
    this.bumpVersion();
  }

  /** Per-kind version (+ the global epoch). The repaint hook's snapshot. */
  getKindVersion(kind: string): number {
    return this.epoch + (this.kindVersions.get(kind) ?? 0);
  }

  /** Subscribe to changes for ONE kind (+ epoch-wide invalidations). */
  subscribeKind(kind: string, listener: () => void): () => void {
    const set = this.kindListeners.get(kind) ?? new Set();
    set.add(listener);
    this.kindListeners.set(kind, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.kindListeners.delete(kind);
    };
  }

  private bumpKind(kind: string): void {
    this.kindVersions.set(kind, (this.kindVersions.get(kind) ?? 0) + 1);
    const listeners = this.kindListeners.get(kind);
    if (listeners) for (const listener of listeners) listener();
  }

  /** Current registry version (repaint snapshot). */
  getVersion(): number {
    return this.version;
  }

  /** Subscribe to ANY definition change. Returns the unsubscribe. */
  subscribeVersion(listener: () => void): () => void {
    this.versionListeners.add(listener);
    return () => {
      this.versionListeners.delete(listener);
    };
  }

  private bumpVersion(): void {
    this.version += 1;
    for (const listener of this.versionListeners) listener();
  }

  /** One list fetch per app session — resolves when user kinds are loaded. */
  ensureWarm(): Promise<void> {
    if (!this.warmPromise) {
      this.warmPromise = listKindSchemasFromTables()
        .then(({ schemas, entries }) => {
          const loadingBySlug = new Map<string, string | null>();
          for (const entry of entries) {
            loadingBySlug.set(entry.slug, entry.loadingComponent ?? null);
            // Capture from the ENTRY list, which covers every catalog kind —
            // including the Python-owned ones whose `data` is NULL and which
            // therefore never reach the definition loop below. Without this
            // their declared loading slug is silently lost and the shape
            // renders the generic skeleton no matter what its owner chose.
            this.setDeclaredLoadingComponent(entry.slug, entry.loadingComponent ?? null);
            this.setEmittedJsonSchema(entry.slug, entry.emittedJsonSchema);
          }
          for (const [kind, schema] of Object.entries(schemas)) {
            const existing = this.defs.get(kind);
            // Defensive invariant: the content_ir adapter omits Python-owned
            // object contracts that cannot be faithfully flattened from
            // `emitted_json_schema` into KindSchema. If any source still
            // returns a fieldless override, keep the compiled floor and report
            // the adapter defect before it can collapse every payload field
            // into residue and render an empty component.
            // `root` is the OTHER legal shape of an empty field map (a
            // non-object root form), so a row carrying one is a real schema.
            if (
              !schema.root &&
              Object.keys(schema.fields).length === 0 &&
              existing?.schema != null &&
              (existing.schema.root !== undefined ||
                Object.keys(existing.schema.fields).length > 0)
            ) {
              reportFieldlessWarmSchema(kind);
              continue;
            }
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
              loadingComponent: loadingBySlug.get(kind) ?? null,
            });
            this.bumpKind(kind);
          }
          this.bumpVersion();
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
          const result = await getKindSchemaAndMetaBySlugFromTables(kind);
          schema = result?.schema ?? null;
          if (schema) {
            this.upsertDefinition({
              kind,
              schema,
              schemaSource: "content_ir",
              tier: "cold",
              loadingComponent: result?.loadingComponent ?? null,
            });
          } else {
            this.misses.add(kind);
          }
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

// The host owns the surface table; the kernel stays importless. Registered here
// because this module is on the import path of every real parse entry point.
setJsonRootKeyLookup((key) => getSurfaceForJsonRootKey(key)?.kind ?? null);

export const kindRegistry = new KindRegistry(SYSTEM_KIND_DEFINITIONS);
