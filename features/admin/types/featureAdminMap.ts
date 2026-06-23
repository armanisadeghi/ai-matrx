// features/admin/types/featureAdminMap.ts
//
// Type contracts for the per-feature admin map (`/[feature]/admin`).
// Each feature in the platform supplies a `FeatureAdminMap` config to
// `<FeatureAdminPage>` listing every resource that belongs to it —
// routes, window panels, overlays, components, API endpoints, Redux
// slices, demos, related features. This is the platform-level index
// admins use to see what's actually inside a feature, including the
// pieces (window panels, demo routes, official-candidate components)
// that aren't reachable from the primary sidebar route.
//
// Adding a new resource to a feature means appending one entry here.
// The pre-commit doctrine check (`pnpm check:doctrine:staged`) enforces
// that new routes / components under `features/[feature]/` are listed
// on the feature's admin map.

export type FeatureResourceStatus =
  | "Live"
  | "Beta"
  | "Coming soon"
  | "Deprecated"
  | "Demo only";

export interface FeatureAdminRoute {
  /** The URL — e.g. `/transcripts/studio`. */
  url: string;
  /** Short label — shown as the row title. */
  label: string;
  /** One-line description of what the route does. */
  description: string;
  /** Optional: path to the page file, for quick jump. */
  filePath?: string;
  /** Optional: status / lifecycle stage. */
  status?: FeatureResourceStatus;
  /**
   * Optional: a few CONCISE bullets surfaced on hover/expand. Avoid prose —
   * if you're tempted to write a paragraph, put it in FEATURE.md instead and
   * link it via the map's `docs` array.
   */
  notes?: string[];
}

export interface FeatureAdminApiRoute {
  /** HTTP path — e.g. `/api/audio/transcribe`. */
  url: string;
  /** Method or methods supported. */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "Multiple";
  /** One-line description. */
  description: string;
  /** Optional: handler file path. */
  filePath?: string;
}

export interface FeatureAdminComponent {
  /** Component display name. */
  name: string;
  /** Component file path (links to the canonical implementation). */
  filePath: string;
  /** One-line description of what the component renders or does. */
  description: string;
  /** Optional: status / lifecycle stage. */
  status?: FeatureResourceStatus;
  /**
   * Tier of the component. Drives visual treatment on the admin page so
   * "this is an officially-registered, registry-backed component" reads
   * differently from "this is an internal feature file".
   *
   * - `official` — listed in `components/official/` and registered in the
   *   official-components registry. Cards link to the registry page.
   * - `candidate` — under `components/official-candidate/`. Promoted-by-use
   *   building blocks not yet in the official registry.
   * - `internal` — feature-local. Just a path readout.
   *
   * Defaults to `internal` when omitted.
   */
  tier?: "official" | "candidate" | "internal";
  /** Optional concise bullets shown on expand (avoid prose). */
  notes?: string[];
}

export interface FeatureAdminWindowPanel {
  /** Matching overlayId from `features/window-panels/registry/overlay-ids.ts`. */
  overlayId: string;
  /** Optional override for the description — falls back to the registry label. */
  description?: string;
  /** Optional explicit status — most window panels are Live. */
  status?: FeatureResourceStatus;
}

export interface FeatureAdminOverlay {
  /** Matching overlayId from `features/overlays/catalogue.ts`. */
  overlayId: string;
  /** Optional override for the description. */
  description?: string;
  /** Optional status. */
  status?: FeatureResourceStatus;
}

export interface FeatureAdminReduxSlice {
  /** Slice name. */
  name: string;
  /** File path. */
  filePath: string;
  /** What this slice tracks. */
  description: string;
}

export interface FeatureAdminRelatedFeature {
  /** Feature display name. */
  name: string;
  /** Link to that feature's admin page (e.g. `/audio/admin`). */
  adminUrl?: string;
  /** Why these features touch each other. */
  description: string;
}

export interface FeatureAdminDocLink {
  label: string;
  /**
   * Either a repo-relative path to a `.md` file (rendered via
   * `/admin/docs/<path>`) or an absolute external URL. The admin page
   * detects which and routes accordingly. All doc links open in a new tab.
   */
  href: string;
}

export interface FeatureAdminMap {
  /** Display name — e.g. "Transcription". */
  name: string;
  /** Slug — e.g. "transcription". */
  slug: string;
  /** One-paragraph description of what this feature owns. */
  description: string;
  /** Links to FEATURE.md and any other internal docs for this feature. */
  docs?: FeatureAdminDocLink[];

  /**
   * If set, the admin page will also auto-discover top-level routes
   * under this directory (relative to the repo root) and report any
   * that aren't enumerated under `routes` — surfacing route drift.
   */
  routeScanPath?: string;

  /** Core routes — the ones users hit day-to-day. */
  routes: FeatureAdminRoute[];

  /** Registered window panels (registry-driven metadata). */
  windowPanels?: FeatureAdminWindowPanel[];

  /** Non-window overlays (modals / sheets / dialogs). */
  overlays?: FeatureAdminOverlay[];

  /** Reusable components / modules that belong to the feature. */
  components?: FeatureAdminComponent[];

  /** API endpoints. */
  apiRoutes?: FeatureAdminApiRoute[];

  /** Redux slices owned by the feature. */
  reduxSlices?: FeatureAdminReduxSlice[];

  /**
   * Demo / test / playground routes related to this feature, no matter
   * where they live in `app/`. The audit catches these scattered under
   * `(dev)`, `(ssr)`, etc.
   */
  demoRoutes?: FeatureAdminRoute[];

  /** Cross-feature touchpoints. */
  relatedFeatures?: FeatureAdminRelatedFeature[];
}
