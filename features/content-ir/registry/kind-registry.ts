/**
 * The canonical kind registry — ONE key (the kind slug), many facets.
 *
 * Loading tiers (LAZY since 2026-08-29 — Arman's ruling: never fetch until
 * needed; a list fetch is names only; the DB is the only truth):
 * - eager: compiled-in system kinds (system-kinds.ts) — the pre-warm
 *          BOOTSTRAP FALLBACK, available at import so speculation and
 *          validation work from the first streamed byte.
 * - warm:  ONE LIGHT CATALOG fetch per app session (ensureWarm/refresh):
 *          slug + declared loading slug per non-deleted kind, a few KB. No
 *          schemas, no emitted contracts — the old ~1.9 MB bulk sweep is
 *          retired. The catalog powers `isKnownKind` and the loading layer's
 *          first look.
 * - cold:  ANY kind sighted (unknown OR compiled) → single-row fetch by slug
 *          → schema + emitted contract + loading slug land per kind;
 *          `onSchemaArrived` waiters (ParseSessions) upgrade in place. DB
 *          rows remain the schema source of truth: the cold fetch OVERRIDES
 *          a compiled schema while compiled facets (legacyBlockType,
 *          toLegacyServerData, toMarkdown, artifact, persistence) survive.
 *
 * Module singleton: the registry is app-global state like the store — every
 * host and session shares one instance.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  INVALIDATION_KEYS,
  registerInvalidationCallback,
} from "@/lib/invalidation/invalidation-registry";
import type { KindSchema } from "@ai-matrx/content-ir";
import {
  setJsonRootKeyLookup,
  type SchemaResolver,
} from "@ai-matrx/content-ir";
import {
  getKindSchemaAndMetaBySlugFromTables,
  listKindCatalogFromTables,
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
      callSite: "KindRegistry.requestSchema",
      hint: "The content_ir schema source must omit unavailable object schemas instead of returning an empty field map.",
      raw: { kind, recovery: "compiled_schema_retained" },
    });
  } catch {
    /* diagnostics must never break registry recovery */
  }
}

/**
 * How long a cold-fetch MISS stays latched before the slug becomes fetchable
 * again. A permanent per-session latch was crack #2 of the 2026-08-29 render
 * audit: a shape sighted moments before its `kind_definition` row committed
 * (the create-then-run flow every new customer walks) could NEVER render for
 * the rest of the session — "first try doesn't work" until a full reload.
 */
const MISS_TTL_MS = 15_000;

class KindRegistry {
  private readonly defs = new Map<string, KindDefinition>();
  private readonly arrivalListeners = new Set<SchemaArrivalListener>();
  private readonly inFlight = new Set<string>();
  /** kind → when the miss was recorded. Expires (MISS_TTL_MS) + cleared on refresh. */
  private readonly misses = new Map<string, number>();
  private warmPromise: Promise<void> | null = null;
  private lastWarmAt = 0;
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
  /**
   * Every non-deleted `kind_definition` slug, from the LIGHT catalog — the
   * lazy design's membership set. Replaces "is it in the warm defs?" as the
   * registered-kind predicate now that warm no longer ingests schemas.
   */
  private catalogSlugs = new Set<string>();

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

  /**
   * Is this slug OURS — a compiled kind, a catalog row, or anything a cold
   * fetch has landed? The registered-kind predicate for save-from-chat, the
   * JsonBlock tripwire, and every other "do we know this shape?" question.
   * Call after `ensureWarm()` (cheap — the light catalog) for DB coverage.
   */
  isKnownKind(kind: string): boolean {
    return (
      this.defs.has(kind) ||
      this.catalogSlugs.has(kind) ||
      this.emittedSchemas.has(kind)
    );
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

  /** One LIGHT catalog fetch per app session (slugs + loading slugs only). */
  ensureWarm(): Promise<void> {
    if (!this.warmPromise) {
      this.warmPromise = this.loadWarm();
    }
    return this.warmPromise;
  }

  /**
   * Re-run the warm list (rate-limited, in-flight deduped) — the definitions
   * twin of `ComponentResolver.refresh`. Until this existed the schema side
   * was frozen for the whole app session (crack #3): a kind created after the
   * tab loaded could arrive only through the single-slug cold path, and a
   * latched miss blocked even that. Cleared misses ride along so "try again"
   * actually tries again. `maxAgeMs = 0` forces.
   */
  refresh(maxAgeMs = 10_000): Promise<void> {
    if (this.warmPromise && Date.now() - this.lastWarmAt < maxAgeMs) {
      return this.warmPromise;
    }
    this.warmPromise = this.loadWarm();
    return this.warmPromise;
  }

  /**
   * THE LAZY WARM TIER (Arman's ruling, 2026-08-29: never fetch until
   * needed; a list fetch is NAMES ONLY, a quick cheap first look — the DB
   * is the only truth). This loads the light catalog (slug + declared
   * loading slug, a few KB) so `isKnownKind` and the loading layer have
   * their first look. Schemas, emitted contracts, and everything heavy load
   * PER KIND through the cold tier when a kind is actually sighted — the
   * old bulk read (~1.9 MB of every `data` + `emitted_json_schema` per
   * session) is gone.
   */
  private loadWarm(): Promise<void> {
    return listKindCatalogFromTables()
        .then((entries) => {
          this.catalogSlugs = new Set(entries.map((e) => e.slug));
          for (const entry of entries) {
            this.setDeclaredLoadingComponent(
              entry.slug,
              entry.loadingComponent ?? null,
            );
          }
          this.lastWarmAt = Date.now();
          // A completed catalog sweep is fresh truth: every latched
          // cold-fetch miss is stale by definition, so the slugs become
          // fetchable again.
          this.misses.clear();
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

  /** Cold fetch, fire-and-forget (the parser's SchemaResolver.request). */
  requestSchema(kind: string): void {
    // Already carrying DB truth for this kind — nothing to fetch. A COMPILED
    // schema is only the bootstrap floor, not truth: under the lazy design
    // the DB override that the bulk warm sweep used to deliver arrives
    // through THIS path instead, so a compiled kind still fetches once.
    if (this.defs.get(kind)?.schemaSource === "content_ir") return;
    if (this.inFlight.has(kind)) return;
    // A miss is a lease, not a verdict: past its TTL the slug is fetchable
    // again, so a shape created seconds after its first sighting renders on
    // the next request instead of never (crack #2).
    const missedAt = this.misses.get(kind);
    if (missedAt !== undefined) {
      if (Date.now() - missedAt < MISS_TTL_MS) return;
      this.misses.delete(kind);
    }
    this.inFlight.add(kind);

    void (async () => {
      try {
        // The light catalog first (cheap, memoized): an unknown slug skips
        // the per-kind read entirely; a known one proceeds.
        await this.ensureWarm();
        const compiled = this.defs.get(kind);
        let schema = compiled?.schema ?? null;

        if (this.catalogSlugs.size === 0 || this.isKnownKind(kind)) {
          const result = await getKindSchemaAndMetaBySlugFromTables(kind);
          if (result) {
            this.setDeclaredLoadingComponent(kind, result.loadingComponent);
            this.setEmittedJsonSchema(kind, result.emittedJsonSchema);
          }
          const dbSchema = result?.schema ?? null;
          // Defensive invariant (ported from the retired bulk warm sweep): a
          // FIELDLESS DB schema must never override a real compiled one — it
          // would collapse every payload field into residue and render the
          // component empty. `root` is the other legal shape of an empty
          // field map, so a row carrying one is a real schema.
          const fieldlessOverride =
            dbSchema !== null &&
            !dbSchema.root &&
            Object.keys(dbSchema.fields).length === 0 &&
            compiled?.schema != null &&
            (compiled.schema.root !== undefined ||
              Object.keys(compiled.schema.fields).length > 0);
          if (fieldlessOverride) {
            reportFieldlessWarmSchema(kind);
          } else if (dbSchema) {
            schema = dbSchema;
            this.upsertDefinition({
              ...compiled,
              kind,
              schema: dbSchema,
              schemaSource: "content_ir",
              tier: compiled?.tier ?? "cold",
              loadingComponent: result?.loadingComponent ?? null,
            });
          } else if (!schema) {
            this.misses.set(kind, Date.now());
          }
        } else if (!schema) {
          this.misses.set(kind, Date.now());
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

// A kind DEFINITION write (agent `kind_create` / `kind_update_schema` /
// `kind_activate`, or the browser Shape Studio) fires this by name — same
// inversion as the component registry's callback below it: zero import edge
// from the stream-processing chunk into this cluster. The force refresh
// replaces the warm tier, clears latched misses, and the per-kind repaint
// upgrades mounted blocks in place.
registerInvalidationCallback(INVALIDATION_KEYS.kindDefinitions, () => {
  void kindRegistry.refresh(0);
});
