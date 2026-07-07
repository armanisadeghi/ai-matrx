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
}

function keyOf(kind: string, platform: string, role: string): string {
  return `${kind}\u0001${platform}\u0001${role}`;
}

export class ComponentRegistry {
  private compiled: Map<string, SystemComponentEntry> | null = null;
  private readonly db = new Map<string, KindComponentProjection>();
  private warmPromise: Promise<void> | null = null;
  private warmFailureLogged = false;

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
    for (const row of rows) {
      const key = keyOf(row.kind, row.platform, row.role);
      if (!this.db.has(key)) this.db.set(key, row);
    }
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
