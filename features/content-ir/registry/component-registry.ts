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
  isAccessRefusalError,
  listKindComponentsFromTables,
  type KindComponentProjection,
} from "./schema-source-kind-components";
import { installKindRegistryDebug } from "./registry-debug";
import { hasSession, whenSessionReady } from "./session-ready";
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
        let raw: KindComponentProjection[];
        try {
          raw = await listKindComponentsFromTables();
        } catch (error) {
          // DD-215b: a REFUSED warm load is not an answer. Both the package's
          // `ensureWarm` and its `refresh` swallow their own failure (one
          // retries on a timer, the other does not), and NEITHER re-opens the
          // per-kind demand — so a 42501 here used to leave every kind on the
          // page holding the compiled floor for the rest of the session. This
          // is the one seam both paths share, so the re-arm lives here.
          if (isAccessRefusalError(error)) this.rearmAfterRefusal(null);
          throw error;
        }
        const rows = dispatchableRows(raw);
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

  /** Test seam — re-arms the provisional demand AND every refusal verdict. */
  resetProvisionalDemand(): void {
    this.provisionalInFlight.clear();
    this.provisionalMisses.clear();
    this.refusedKinds.clear();
    this.refusalRetries.clear();
    this.warmRefused = false;
  }

  /**
   * Test seam — an empty db tier with the per-kind demand window RE-OPENED.
   *
   * `replaceDbRows([])` alone is not enough and `ensureWarm` must not be used:
   * the window these suites exercise is governed by `warmListLanded`, which
   * only `loadAll` sets, and the package's warm load is one-shot per session.
   */
  resetForTests(): void {
    this.replaceDbRows([]);
    this.resetProvisionalDemand();
    this.warmListLanded = false;
  }

  /** Whether a miss is recorded for this key — the forcing tests read it. */
  hasProvisionalMiss(kind: string, platform: string, role: ComponentRole): boolean {
    return this.provisionalMisses.has(`${kind} ${platform} ${role}`);
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
    const key = `${kind} ${platform}`;
    if (this.provisionalInFlight.has(key)) return;
    if (this.provisionalMisses.has(`${key} ${role}`)) return;
    this.provisionalInFlight.add(key);
    try {
      const rows = await getKindComponentBySlug(kind, platform);
      // First-row-per-key wins and nothing is overwritten: if the warm list
      // beat us to this key, its row stands and this is a no-op.
      this.ingestDbRows(rows);
      // 🚨 A MISS IS ONLY EVER RECORDED FROM AN ANSWER (DD-215b). This line is
      // inside the `try`, after a read that actually returned, on purpose: a
      // refusal goes to the `catch` and must NEVER land here, because a miss
      // closes this (kind, platform, role) for the whole session and is only
      // cleared by a wholesale `replaceDbRows`.
      if (this.resolve(kind, platform, role)?.resolvedBy !== "db") {
        this.provisionalMisses.add(`${key} ${role}`);
      }
    } catch (error) {
      const refused = isAccessRefusalError(error);
      captureError({
        source: "content-ir",
        message:
          `[content-ir] could not fetch the component rows for kind "${kind}" ` +
          `(${platform}/${role}): ${error instanceof Error ? error.message : String(error)}. ` +
          (refused
            ? `The read was REFUSED, not answered — this is a signed-in door and ` +
              `the request carried no session, so it says nothing about whether ` +
              `the rows exist. Readers see the platform's bundled component until ` +
              `a session attaches; this demand is queued to retry then (DD-215b), ` +
              `and the boot race itself is DD-237.`
            : `Until this read succeeds, an organization-authored component for this ` +
              `kind cannot render and readers see the platform's bundled component ` +
              `instead — retry the read or check this organization's access to ` +
              `content_ir.kind_component.`),
        relation: kind,
        callSite: "ComponentRegistry.demandDbTier",
        raw: { kind, platform, role, refused },
      });
      if (refused) {
        // Defensive: a miss must not survive a refusal even if one was
        // recorded by an earlier, genuinely-answered read.
        this.provisionalMisses.delete(`${key} ${role}`);
        this.reportRefusedRender(kind, platform, role, error);
        this.rearmAfterRefusal({ kind, platform, role });
      }
    } finally {
      this.provisionalInFlight.delete(key);
    }
  }

  /** Kinds whose db read was REFUSED and not yet answered. Read by the render seam. */
  private refusedKinds = new Map<string, number>();

  /**
   * Bounded so a door that is genuinely closed to this reader cannot become a
   * poll: three attempts is enough to cover a session that attaches late, a
   * token refresh, and one recovery after a transient outage.
   */
  private static readonly MAX_REFUSAL_RETRIES = 3;

  /** Set when the WARM list itself was refused — every kind is then unanswered. */
  private warmRefused = false;

  /**
   * True while this kind's component read stands REFUSED rather than answered —
   * either its own cold read was refused, or the warm list was and this kind
   * still has nothing but the compiled floor to show for it.
   */
  wasRefused(kind: string): boolean {
    if ((this.refusedKinds.get(kind) ?? 0) > 0) return true;
    if (!this.warmRefused) return false;
    return this.resolve(kind, "web", "output")?.resolvedBy !== "db";
  }

  /**
   * Re-run a refused read once a session exists. `target` null means the WARM
   * list was refused, so the whole db tier is re-fetched; otherwise just the
   * one kind's rows are demanded again.
   */
  private rearmAfterRefusal(
    target: { kind: string; platform: string; role: ComponentRole } | null,
  ): void {
    const key = target ? `${target.kind} ${target.platform}` : "*warm*";
    const attempts = this.refusalRetries.get(key) ?? 0;
    if (attempts >= ComponentRegistry.MAX_REFUSAL_RETRIES) return;
    this.refusalRetries.set(key, attempts + 1);
    if (target) {
      this.refusedKinds.set(target.kind, attempts + 1);
    } else {
      this.warmRefused = true;
    }
    // Already signed in? Then the refusal was not the boot race and an
    // immediate re-demand would just fail again — wait for the NEXT session
    // event (a refresh), which `whenSessionReady` gives us for free because it
    // only fires on a transition into "session present".
    const retry = () => {
      if (target) {
        this.provisionalMisses.delete(`${target.kind} ${target.platform} ${target.role}`);
        this.refusedKinds.delete(target.kind);
        void this.demandDbTier(target.kind, target.platform, target.role);
      } else {
        this.warmRefused = false;
        // 0 = ignore the rate limit; the previous attempt landed no rows.
        void this.refresh(0);
      }
    };
    if (hasSession()) {
      // A session exists and the read was still refused — give the client one
      // bounded tick to finish attaching the token to its PostgREST headers
      // rather than spinning.
      setTimeout(retry, 1_000);
      return;
    }
    whenSessionReady(retry);
  }

  private refusalRetries = new Map<string, number>();

  /**
   * THE INSTRUMENT (DD-215c) — what this resolver holds RIGHT NOW, for the
   * snapshot global installed by `registry-debug.ts`.
   *
   * READ-ONLY and total: it resolves, counts and copies. It never fetches,
   * ingests, clears a verdict or mutates anything, so reading it can never
   * change what a reader sees — the one property a debugging instrument on a
   * live surface must have. Component BODIES are reported as lengths; no body
   * text and no kind instance value ever leaves through here.
   */
  debugSnapshot(kind: string | null): Record<string, unknown> {
    const describe = (role: ComponentRole) => {
      if (!kind) return null;
      const resolution = this.resolve(kind, "web", role);
      if (!resolution) return null;
      return {
        componentKey: resolution.componentKey,
        resolvedBy: resolution.resolvedBy,
        source: resolution.source,
        isActive: resolution.isActive,
        hasComponentSource: resolution.hasComponentSource,
        bodyLength: resolution.componentSource?.length ?? 0,
        updatedAt: resolution.updatedAt,
      };
    };
    return {
      kind,
      at: new Date().toISOString(),
      output: describe("output"),
      input: describe("input"),
      loading: describe("loading"),
      compiledFloor: kind ? this.hasCompiled(kind, "web", "output") : null,
      version: this.getVersion(),
      kindVersion: kind ? this.getKindVersion(kind) : null,
      hasSettled: this.hasSettled(),
      warmListLanded: this.warmListLanded,
      hasBeenDemanded: this.hasBeenDemanded(),
      warmRefused: this.warmRefused,
      wasRefused: kind ? this.wasRefused(kind) : null,
      refusedKinds: [...this.refusedKinds.entries()],
      refusalRetries: [...this.refusalRetries.entries()],
      provisionalMisses: [...this.provisionalMisses],
      provisionalInFlight: [...this.provisionalInFlight],
    };
  }

  /**
   * A WRONG RENDER IS NEVER SILENT (DD-215b). The reader is about to be shown
   * the platform's compiled component although this kind has an
   * organization-authored one — we simply could not read it. File that on the
   * authoring queue, where someone who can fix it will see it.
   *
   * Lazy import on purpose: this module is the cycle entry for the registry
   * cluster (see the header), and the incident filer lives in the react layer.
   */
  private reportRefusedRender(
    kind: string,
    platform: string,
    role: ComponentRole,
    error: unknown,
  ): void {
    void (async () => {
      try {
        const { reportKindComponentIncident } = await import(
          "../react/db-component/kindComponentIncident"
        );
        reportKindComponentIncident({
          kind,
          errorType: "component_read_refused",
          platform,
          role,
          message:
            `The reader was shown the platform's bundled component for "${kind}" ` +
            `because this organization's component row could not be READ: ` +
            `${error instanceof Error ? error.message : String(error)}. ` +
            `This is a refusal, not a missing component — the row may well exist.`,
        });
      } catch {
        /* an alarm that throws is worse than one that misses */
      }
    })();
  }
}

export const componentRegistry = new ComponentRegistry(
  getSystemComponentEntries,
);

// THE INSTRUMENT (DD-215c). Off unless the tab asked for it with
// `?matrxKindDebug=1`; see registry-debug.ts for why this exists at all.
installKindRegistryDebug(componentRegistry);

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
