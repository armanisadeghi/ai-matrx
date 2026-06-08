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
  /** The URL — e.g. `/transcription/studio`. */
  url: string;
  /** Short label — shown as the row title. */
  label: string;
  /** One-line description of what the route does. */
  description: string;
  /** Optional: path to the page file, for quick jump. */
  filePath?: string;
  /** Optional: status / lifecycle stage. */
  status?: FeatureResourceStatus;
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
  /** Repo-relative path or external URL. */
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
   * `(dev)`, `(public-demos)`, `(ssr)`, etc.
   */
  demoRoutes?: FeatureAdminRoute[];

  /** Cross-feature touchpoints. */
  relatedFeatures?: FeatureAdminRelatedFeature[];
}
