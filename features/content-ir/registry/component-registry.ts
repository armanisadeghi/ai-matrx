/**
 * The Shape System component RESOLVER (rulings R1 + R6): (kind, platform,
 * role) → component. Mirrors the kind registry's loading tiers:
 *
 * - eager: compiled bootstrap (system-components.ts) — the trusted-at-boot
 *   floor derived from today's legacy bridges, available at import so the
 *   render seam can gate synchronously from the first streamed byte.
 * - warm:  one `content_ir.kind_component` list fetch per app session
 *   (ensureWarm), fired by the same hosts that warm the kind registry —
 *   never on the hot path. A DB row for a (kind, platform, role) OVERRIDES
 *   the compiled entry once warm; the compiled floor keeps answering until
 *   then (and forever, on DB failure).
 *
 * Resolution is SYNCHRONOUS (the render seam calls it per block); the only
 * async work is the warm load, off the render path.
 *
 * Module singleton, like kindRegistry — every host shares one instance.
 */

// CYCLE-ENTRY ANCHOR — load-bearing side-effect import. This module reaches
// system-kinds (via system-components), and the registry cluster has a cycle
// (system-kinds → kinds/* → legacy-bridge-utils → render-block-envelope →
// region-envelope-memo → kind-registry → system-kinds) whose only safe entry
// is kind-registry (its singleton constructs EAGERLY at module scope; every
// other module in the cycle defers use to call time). Evaluating
// kind-registry first guarantees any consumer entering through THIS module
// initializes the cycle in the safe order.
import "./kind-registry";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { JsonObject } from "@/types/json";
import {
  getKindComponentBySlug,
  listKindComponentsFromTables,
  type KindComponentProjection,
} from "./schema-source-kind-components";
import {
  getSystemComponentEntries,
  type SystemComponentEntry,
} from "./system-components";

export type ComponentRole = "output" | "input";

/** The resolver's answer for one (kind, platform, role). */
export interface ComponentResolution {
  /** The component key the renderer routes on (e.g. "flashcards"). */
  componentKey: string;
  /** `source` column vocabulary: "bundled" | "db" (db = web sandbox only). */
  source: string;
  config: JsonObject;
  /**
   * Render-trust verdict (R6). Compiled entries are always active (trusted
   * at bootstrap); DB rows carry their own `is_active`.
   */
  isActive: boolean;
  /** Which tier produced this answer — the verification hook's `by`. */
  resolvedBy: "compiled" | "db";
  /**
   * `source='db'` rows only: the user-authored component body (TSX/JSX for
   * the in-page allowlist compile, or an HTML document when
   * `config.flavor='html'`). Always null for compiled/bundled entries.
   */
  componentSource: string | null;
  /** `source='db'` rows only: optional `(data) => data` transform source. */
  propsTransform: string | null;
  /** `source='db'` rows only: pinned kind version (null = current). */
  pinnedKindVersion: number | null;
  /**
   * `source='db'` rows only: the row's `updated_at` — the compile-cache
   * staleness key (a refresh with a newer row recompiles automatically).
   * Null for compiled entries.
   */
  updatedAt: string | null;
}

function keyOf(kind: string, platform: string, role: string): string {
  return `${kind}\u0001${platform}\u0001${role}`;
}

export class ComponentRegistry {
  private compiled: Map<string, SystemComponentEntry> | null = null;
  private readonly db = new Map<string, KindComponentProjection>();
  private warmPromise: Promise<void> | null = null;
  private warmFailureLogged = false;
  private lastRefreshAt = 0;
  private refreshPromise: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  /** Cold single-kind fetch dedupe (streaming eager path). */
  private readonly coldInFlight = new Set<string>();
  private readonly coldMisses = new Set<string>();
  /** Monotonic db-tier version — the repaint hook's snapshot key. */
  private version = 0;

  /**
   * Entries arrive as a THUNK, resolved on first use: the compiled bootstrap
   * derives from `SYSTEM_KIND_DEFINITIONS`, which is mid-initialization when
   * this module evaluates (see the cycle note in system-components.ts).
   */
  constructor(private readonly entries: () => SystemComponentEntry[]) {}

  private compiledMap(): Map<string, SystemComponentEntry> {
    if (!this.compiled) {
      this.compiled = new Map();
      for (const entry of this.entries()) {
        this.compiled.set(
          keyOf(entry.kind, entry.platform, entry.role),
          entry,
        );
      }
    }
    return this.compiled;
  }

  /**
   * Synchronous resolve — the render seam's per-block call. DB override
   * first (once warm), compiled floor second, null for unknown.
   */
  resolve(
    kind: string,
    platform: string,
    role: ComponentRole,
  ): ComponentResolution | null {
    const key = keyOf(kind, platform, role);

    const dbRow = this.db.get(key);
    if (dbRow) {
      return {
        componentKey: dbRow.componentKey,
        source: dbRow.source,
        config: dbRow.config,
        isActive: dbRow.isActive,
        resolvedBy: "db",
        componentSource: dbRow.componentSource,
        propsTransform: dbRow.propsTransform,
        pinnedKindVersion: dbRow.pinnedKindVersion,
        updatedAt: dbRow.updatedAt,
      };
    }

    const compiledEntry = this.compiledMap().get(key);
    if (compiledEntry) {
      return {
        componentKey: compiledEntry.componentKey,
        source: compiledEntry.source,
        config: compiledEntry.config,
        isActive: true, // trusted at bootstrap (R6)
        resolvedBy: "compiled",
        componentSource: null,
        propsTransform: null,
        pinnedKindVersion: null,
        updatedAt: null,
      };
    }

    return null;
  }

  /** R6 floor check: compiled-bootstrap membership = always render-trusted. */
  hasCompiled(kind: string, platform: string, role: ComponentRole): boolean {
    return this.compiledMap().has(keyOf(kind, platform, role));
  }

  /**
   * Pure ingest — ensureWarm's landing point (and the unit-test seam, like
   * `reconstructKindRegistry` is for the kind tables). First row per key
   * wins: rows arrive is_default-first / sort_order-asc from the source.
   */
  ingestDbRows(rows: KindComponentProjection[]): void {
    let changed = false;
    for (const row of rows) {
      const key = keyOf(row.kind, row.platform, row.role);
      if (!this.db.has(key)) {
        this.db.set(key, row);
        changed = true;
      }
    }
    // Warm/cold ingest is a resolver-tier change the render seam must see —
    // a db component landing AFTER a region finalized re-runs the route via
    // the repaint hook. (Previously only refresh replacements notified, so
    // the streaming path could never flip to a db component late.)
    if (changed) this.notifyChanged();
  }

  /**
   * Refresh landing point: REPLACE the db tier wholesale (same
   * first-row-per-key contract as ingestDbRows) so edits, deletions, and
   * is_active flips all take effect. Notifies subscribers.
   */
  replaceDbRows(rows: KindComponentProjection[]): void {
    this.db.clear();
    for (const row of rows) {
      const key = keyOf(row.kind, row.platform, row.role);
      if (!this.db.has(key)) this.db.set(key, row);
    }
    // A wholesale replace ALWAYS notifies (deletions/flips count too).
    this.notifyChanged();
  }

  /** Current db-tier version (repaint snapshot). */
  getVersion(): number {
    return this.version;
  }

  private notifyChanged(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /**
   * The eager lightweight single-kind fetch (streaming path): the moment a
   * cloud kind is identified mid-stream, pull ONLY that kind's resolver rows
   * (render-essential columns only) and ingest them so `resolveComponent`
   * can answer before — or shortly after — the region completes. Deduped
   * in-flight and by known-miss; kinds already resolvable are skipped.
   * Fire-and-forget; failures are loud (the warm list remains the backstop).
   */
  requestComponent(kind: string, platform: string, role: ComponentRole): void {
    if (this.resolve(kind, platform, role)) return;
    if (this.coldInFlight.has(kind) || this.coldMisses.has(kind)) return;
    this.coldInFlight.add(kind);

    void (async () => {
      try {
        const rows = await getKindComponentBySlug(kind, platform);
        if (rows.length === 0) {
          this.coldMisses.add(kind);
          return;
        }
        this.ingestDbRows(rows);
      } catch (error) {
        const message = `component-registry cold fetch failed for "${kind}": ${
          error instanceof Error ? error.message : String(error)
        }`;
        console.error(`[content-ir] ${message}`);
        captureError({
          source: "content-ir",
          message,
          name: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          raw: error,
        });
      } finally {
        this.coldInFlight.delete(kind);
      }
    })();
  }

  /**
   * Subscribe to db-tier replacements (refreshKindComponents). Returns the
   * unsubscribe. Consumers use this to re-render when a refresh lands.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Refresh-on-view: re-fetch the warm list and REPLACE the db tier, so an
   * edited `source='db'` component (its `updated_at` bump re-keys the
   * compile cache) renders fresh on the next view. Deduped in-flight and
   * rate-limited by `maxAgeMs` (default 10s) — mounting several previews
   * costs one fetch. Server-side edits do NOT push to open clients (no
   * realtime yet); the contract is refresh-on-view via this call.
   */
  refreshKindComponents(maxAgeMs = 10_000): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    if (Date.now() - this.lastRefreshAt < maxAgeMs) return Promise.resolve();

    this.refreshPromise = listKindComponentsFromTables()
      .then((rows) => {
        this.lastRefreshAt = Date.now();
        this.replaceDbRows(rows);
      })
      .catch((error) => {
        // Loud recovery: the current tier keeps answering; a refresh failure
        // is a real defect (same posture as the warm loader).
        const message = `component-registry refresh failed (current resolver tier still serving): ${
          error instanceof Error ? error.message : String(error)
        }`;
        console.error(`[content-ir] ${message}`);
        captureError({
          source: "content-ir",
          message,
          name: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          raw: error,
        });
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  /** One list fetch per app session; failed loads retry on the next call. */
  ensureWarm(): Promise<void> {
    if (!this.warmPromise) {
      this.warmPromise = listKindComponentsFromTables()
        .then((rows) => {
          this.ingestDbRows(rows);
        })
        .catch((error) => {
          // Loud recovery: the compiled floor keeps rendering, but a warm
          // failure is a real defect — one console scream (first failure)
          // plus a structured capture (deduped) per attempt, then retryable.
          const message = `component-registry warm load failed (compiled bootstrap still serving): ${
            error instanceof Error ? error.message : String(error)
          }`;
          if (!this.warmFailureLogged) {
            this.warmFailureLogged = true;
            console.error(`[content-ir] ${message}`);
          }
          captureError({
            source: "content-ir",
            message,
            name: error instanceof Error ? error.name : undefined,
            stack: error instanceof Error ? error.stack : undefined,
            raw: error,
          });
          this.warmPromise = null;
        });
    }
    return this.warmPromise;
  }
}

export const componentRegistry = new ComponentRegistry(
  getSystemComponentEntries,
);

/**
 * The seam-facing resolver (ruling R1): which component renders `kind` on
 * `platform` in `role`? Synchronous; answers from the DB override once warm,
 * else the compiled floor, else null (unknown kind).
 */
export function resolveComponent(
  kind: string,
  platform: string,
  role: ComponentRole,
): ComponentResolution | null {
  return componentRegistry.resolve(kind, platform, role);
}

/**
 * Refresh-on-view for `source='db'` components (module-level convenience over
 * the singleton): re-fetches `kind_component`, replaces the db tier, notifies
 * `subscribeKindComponents` listeners. Rate-limited + deduped — safe to call
 * on every preview/authoring-surface mount. Server-side edits never push to
 * open clients; call this (or wait for a fresh session) to see them.
 */
export function refreshKindComponents(maxAgeMs?: number): Promise<void> {
  return componentRegistry.refreshKindComponents(maxAgeMs);
}

/** Subscribe to resolver db-tier replacements. Returns the unsubscribe. */
export function subscribeKindComponents(listener: () => void): () => void {
  return componentRegistry.subscribe(listener);
}
