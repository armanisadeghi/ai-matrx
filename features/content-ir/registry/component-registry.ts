/**
 * THE MATRIX ADAPTER around the shared component resolver.
 *
 * The resolver itself — the (kind, platform, role) tiers, the compiled floor,
 * the DB override, the granular per-kind repaint counters, the cold-fetch
 * dedupe, the warm/refresh lifecycle with loud recovery — now lives in
 * `@ai-matrx/content-ir-react` (`ComponentResolver`), because every UI that
 * renders a kind has to make exactly those decisions and a second copy of them
 * is a guaranteed divergence.
 *
 * What stays here is what is genuinely OURS: the Supabase-backed loaders, the
 * Error Inspector sink, the compiled bootstrap derived from `system-kinds`, the
 * `refreshKindComponents` name our call sites use, and the invalidation
 * registration at the bottom of this file.
 *
 * Semantics (rulings R1 + R6) are documented on the package class; read that
 * before changing behavior here — behavior does not belong here.
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
import {
  ComponentResolver,
  type ComponentResolution,
  type ComponentRole,
  type KindComponentRow,
} from "@ai-matrx/content-ir-react";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  INVALIDATION_KEYS,
  registerInvalidationCallback,
} from "@/lib/invalidation/invalidation-registry";
import {
  getKindComponentBySlug,
  listKindComponentsFromTables,
  type KindComponentProjection,
} from "./schema-source-kind-components";
import {
  getSystemComponentEntries,
  type SystemComponentEntry,
} from "./system-components";

export type { ComponentResolution, ComponentRole };

/**
 * Roles the shared resolver dispatches on. `loading` rows are the kind's
 * LOADING face and live under their own resolver key — never the output key.
 * The 0.2.0 shared package widened ComponentRole for this exact contract.
 * Unknown future roles are still dropped rather than coerced, because
 * registering a kind's LOADING component as its OUTPUT component would show
 * the reader the skeleton where the finished shape belongs, permanently.
 *
 * 🚨 THE DROP MUST HAPPEN BEFORE ANY NARROWING, AND ON EVERY INGRESS.
 * There is deliberately no `asComponentRole`-style coercion in this file. A
 * coercion that rewrote an unknown role to `"output"` is not a lenient
 * fallback, it is a data-destroying merge: the resolver keys rows by
 * `(kind, platform, role)` and keeps the FIRST row per key, so two
 * semantically different rows land on one key and FETCH ORDER alone decides
 * which one renders (`is_default DESC, sort_order ASC, created_at ASC`).
 *
 * Proven live 2026-08-25: `study_plan` and `kit_title` each had a `loading`
 * row with the SAME `is_default` and `sort_order` as that kind's real output
 * row — only `created_at` separated them, and the output rows happened to be
 * authored 27 and 29 seconds earlier. Author the loading component first and
 * the skeleton becomes the kind's output component everywhere, forever.
 *
 * The earlier repair filtered on `role` but ran AFTER a map that had already
 * rewritten `loading` to `output`, so every row it meant to drop had already
 * become an output row and passed the filter. Both DB loaders below therefore
 * funnel through this function, which is the only place a role is narrowed.
 */
const RESOLVER_ROLES: ReadonlySet<string> = new Set<ComponentRole>([
  "output",
  "input",
  "loading",
]);

function isRoutableRole(role: string): role is ComponentRole {
  return RESOLVER_ROLES.has(role);
}

function dispatchableRows(
  rows: readonly (KindComponentProjection | KindComponentRow)[],
): KindComponentRow[] {
  const dispatchable: KindComponentRow[] = [];
  for (const row of rows) {
    if (isRoutableRole(row.role)) {
      dispatchable.push({ ...row, role: row.role });
      continue;
    }
    reportUnroutableRole(row);
  }
  return dispatchable;
}

/** One report per (kind, role) per session — a warm sweep re-reports nothing. */
const reportedUnroutableRoles = new Set<string>();

/** Test seam — resets the once-per-(kind, role) dedupe. */
export function resetUnroutableRoleReports(): void {
  reportedUnroutableRoles.clear();
}

function reportUnroutableRole(
  row: KindComponentProjection | KindComponentRow,
): void {
  const seenKey = `${row.kind} ${row.role}`;
  if (reportedUnroutableRoles.has(seenKey)) return;
  reportedUnroutableRoles.add(seenKey);
  // NAME THE ROW. The previous message carried only the role string, so the
  // first question triage asks — which kind is affected? — could be answered
  // only by querying the database by hand.
  const message =
    `[content-ir] kind_component role "${row.role}" is not routable by this build — the row ` +
    `for kind "${row.kind}" (component_key "${row.componentKey}", platform "${row.platform}") ` +
    `is IGNORED. It is deliberately NOT treated as an "output" component: an unknown role ` +
    `coerced to "output" collides with the kind's real output row under one resolver key, and ` +
    `fetch order alone would decide which one renders. To make this role live, widen ` +
    `ComponentRole in @ai-matrx/content-ir-react AND implement its dispatch.`;
  console.error(message);
  try {
    captureError({
      source: "content-ir",
      message,
      relation: row.kind,
      callSite: "ComponentRegistry.dispatchableRows",
      hint: "content_ir.kind_component.role was widened ahead of the rendering consumer.",
      raw: {
        role: row.role,
        kind: row.kind,
        componentKey: row.componentKey,
        platform: row.platform,
      },
    });
  } catch {
    /* diagnostics must never break registry ingest */
  }
}

/**
 * The Matrix resolver: the shared class with our loaders and our error sink
 * bound, plus the `refreshKindComponents` alias every call site here uses.
 */
export class ComponentRegistry extends ComponentResolver {
  /** True once any fetch was demanded this session (THE ZERO-PREFETCH LAW). */
  private demanded = false;

  constructor(entries: () => SystemComponentEntry[]) {
    super({
      compiledEntries: entries,
      // Both loaders drop unroutable roles HERE, at the DB boundary — this is
      // the path the package's ensureWarm / refresh / requestComponent all
      // take, so a guard that only sat on the ingest overrides never saw a
      // `loading` row at all.
      loadAll: async () => {
        const rows = dispatchableRows(await listKindComponentsFromTables());
        // DD-215: the ONE honest "the db tier is complete" signal. The
        // package's `hasSettled()` also answers true the moment the map holds
        // ANY row — which the per-kind demand below would itself make true,
        // closing the window for every other kind on the page after the first
        // one succeeded.
        this.warmListLanded = true;
        return rows;
      },
      loadForKind: async (kind, platform) =>
        dispatchableRows(await getKindComponentBySlug(kind, platform)),
      reportError: captureError,
    });
  }

  /**
   * Ingest/replace accept the SUPABASE PROJECTION (whose `role` is the
   * column's free text) and narrow it here — the one place that mapping
   * belongs. Overridden rather than adapted at ~15 call sites.
   */
  override ingestDbRows(
    rows: readonly (KindComponentProjection | KindComponentRow)[],
  ): void {
    super.ingestDbRows(dispatchableRows(rows));
  }

  /** Historical name for the package's `refresh` — kept so call sites read the same. */
  refreshKindComponents(maxAgeMs?: number): Promise<void> {
    return this.refresh(maxAgeMs);
  }

  /** See kindRegistry.hasBeenDemanded — the auth watcher's gate. */
  hasBeenDemanded(): boolean {
    return this.demanded;
  }

  override ensureWarm(): Promise<void> {
    this.demanded = true;
    return super.ensureWarm();
  }

  override refresh(maxAgeMs?: number): Promise<void> {
    this.demanded = true;
    return super.refresh(maxAgeMs);
  }

  override requestComponent(
    kind: string,
    platform: string,
    role: ComponentRole,
  ): void {
    this.demanded = true;
    super.requestComponent(kind, platform, role);
    // DD-215. The package's own cold-fetch test asks "is the answer missing or
    // body-less?" — and a COMPILED answer is neither, so every kind that ships
    // a `legacyBlockType` was exempt from the eager per-kind fetch. Those are
    // exactly the kinds an organization can override, so which component a
    // reader saw came down to whether the warm list won a network race
    // (reproduced on production 2026-09-13: delay the warm list twelve seconds
    // and three identical `keyword_relationship_research` instances keep the
    // platform block instead of the organization's board, silently, forever).
    // A compiled answer is PROVISIONAL until the db tier has settled, so the
    // registry demands the kind's own rows here instead of pre-judging.
    void this.demandDbTier(kind, platform, role);
  }

  /** True once the WARM list has actually come back — see `loadAll` above. */
  private warmListLanded = false;

  /** In-flight / known-miss dedupe for {@link demandDbTier}. */
  private provisionalInFlight = new Set<string>();
  private provisionalMisses = new Set<string>();

  /** Test seam — re-arms the provisional demand. */
  resetProvisionalDemand(): void {
    this.provisionalInFlight.clear();
    this.provisionalMisses.clear();
  }

  override replaceDbRows(
    rows: readonly (KindComponentProjection | KindComponentRow)[],
  ): void {
    // A wholesale replacement re-opens every verdict, the same way the package
    // clears its own cold misses.
    this.provisionalMisses.clear();
    super.replaceDbRows(dispatchableRows(rows));
  }

  /**
   * Pull ONE kind's resolver rows — bodies included — while the db tier is
   * still unsettled and the only answer is the compiled floor. The cold
   * projection is the authoritative heavy form, so ingesting it lands the
   * component AND its body in one step and repaints the kind.
   *
   * Never silent: a failure is a real sentence in the Error Inspector naming
   * the kind and what the reader will see until it is fixed.
   */
  private async demandDbTier(
    kind: string,
    platform: string,
    role: ComponentRole,
  ): Promise<void> {
    if (this.warmListLanded) return;
    const resolution = this.resolve(kind, platform, role);
    if (resolution?.resolvedBy !== "compiled") return;
    const key = `${kind} ${platform}`;
    if (this.provisionalInFlight.has(key)) return;
    if (this.provisionalMisses.has(`${key} ${role}`)) return;
    this.provisionalInFlight.add(key);
    try {
      const rows = await getKindComponentBySlug(kind, platform);
      // First-row-per-key wins and nothing is overwritten: if the warm list
      // beat us to this key, its row stands and this is a no-op.
      this.ingestDbRows(rows);
      if (this.resolve(kind, platform, role)?.resolvedBy !== "db") {
        this.provisionalMisses.add(`${key} ${role}`);
      }
    } catch (error) {
      captureError({
        source: "content-ir",
        message:
          `[content-ir] could not fetch the component rows for kind "${kind}" ` +
          `(${platform}/${role}): ${error instanceof Error ? error.message : String(error)}. ` +
          `Until this read succeeds, an organization-authored component for this ` +
          `kind cannot render and readers see the platform's bundled component ` +
          `instead — retry the read or check this organization's access to ` +
          `content_ir.kind_component.`,
        relation: kind,
        callSite: "ComponentRegistry.demandDbTier",
        raw: { kind, platform, role },
      });
    } finally {
      this.provisionalInFlight.delete(key);
    }
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
 * `subscribeKindComponents` listeners. Rate-limited + deduped — safe to call on
 * every preview/authoring-surface mount. Server-side edits never push to open
 * clients; call this (or wait for a fresh session) to see them.
 */
export function refreshKindComponents(maxAgeMs?: number): Promise<void> {
  return componentRegistry.refreshKindComponents(maxAgeMs);
}

/** Subscribe to resolver db-tier replacements. Returns the unsubscribe. */
export function subscribeKindComponents(listener: () => void): () => void {
  return componentRegistry.subscribe(listener);
}

// The D115 inversion: this cluster registers its own invalidation at module
// init (it is initialized wherever a `__kind` block can render); the
// ubiquitous `toolStateEffects` fires it by NAME when an agent's `kindcomp_*`
// write completes — ZERO import edge from the stream-processing chunk into
// this registry cluster (the `await import()` edge that OOM-killed 12 builds).
// The force refresh (maxAgeMs 0) replaces the db tier and notifies; the
// per-kind repaint machinery + the `updated_at`-keyed compile cache do the
// rest, so mounted blocks recompile the edited component without a refresh.
registerInvalidationCallback(INVALIDATION_KEYS.kindComponents, () => {
  void refreshKindComponents(0);
});
