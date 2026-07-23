/**
 * Route → DB surface name mapping.
 *
 * Given `window.location.pathname`, returns the matching `ui_surface.name`
 * row that the server's resolver in
 * `aidream/api/utils/surface_resolver.py` knows about. The DB has 76
 * surfaces; this mapping covers the matrx-user routes the chat / agent
 * flows hit today. Add a row to `SURFACE_BY_ROUTE_PREFIX` when a new
 * route ships AND the corresponding surface exists in `ui.ui_surface`.
 *
 * Mapping discipline: prefer specific over general. The longest matching
 * prefix wins — `/agents/{id}/run` should resolve to
 * `matrx-user/agent-run` even though `/agents` would match
 * `matrx-user/agents`. The list is iterated in declared order so put
 * specific prefixes BEFORE their general ancestors.
 *
 * Returns null when no mapping matches; the request then omits
 * `client.surface` and the server resolves tools from
 * capabilities / agent definition only.
 */

export interface SurfaceRouteMapping {
  prefix: string;
  surface: string;
}

/** Route prefixes used at runtime and to derive default `ui_surface.url_pattern`. */
export const SURFACE_ROUTE_MAPPINGS: readonly SurfaceRouteMapping[] = [
  // Specific agent flows — placed BEFORE the broader /agents prefix.
  { prefix: "/agents/builder", surface: "matrx-user/agent-builder" },
  { prefix: "/agents/run-history", surface: "matrx-user/agent-run-history" },
  { prefix: "/agents/run", surface: "matrx-user/agent-run" },
  { prefix: "/agents/edit", surface: "matrx-user/agent-advanced-editor" },
  { prefix: "/agents/settings", surface: "matrx-user/agent-settings" },
  { prefix: "/agents/gate", surface: "matrx-user/agent-gate" },
  { prefix: "/agents/connections", surface: "matrx-user/agent-connections" },
  { prefix: "/agents/apps", surface: "matrx-user/agent-apps" },
  { prefix: "/agents/shortcuts", surface: "matrx-user/agent-shortcuts" },
  { prefix: "/agents", surface: "matrx-user/agents" },

  // Standalone top-level pages.
  { prefix: "/chat/a/", surface: "matrx-user/chat" },
  { prefix: "/chat", surface: "matrx-user/chat" },
  { prefix: "/code-editor", surface: "matrx-user/code-editor" },
  { prefix: "/code", surface: "matrx-user/code-editor" },
  { prefix: "/smart-code-editor", surface: "matrx-user/smart-code-editor" },
  { prefix: "/markdown-editor", surface: "matrx-user/markdown-editor" },
  { prefix: "/notes", surface: "matrx-user/notes" },
  { prefix: "/messages", surface: "matrx-user/messages" },
  { prefix: "/tasks", surface: "matrx-user/tasks" },
  { prefix: "/files", surface: "matrx-user/files" },
  { prefix: "/projects", surface: "matrx-user/projects" },
  { prefix: "/lists", surface: "matrx-user/lists" },
  { prefix: "/tools/pdf-extractor", surface: "matrx-user/pdf-extractor" },
  { prefix: "/tools/scanner", surface: "matrx-user/scanner" },
  { prefix: "/tools", surface: "matrx-user/tools" },
  { prefix: "/documents", surface: "matrx-user/documents" },
  { prefix: "/settings", surface: "matrx-user/settings" },
  { prefix: "/data-tables", surface: "matrx-user/data-tables" },
  { prefix: "/organizations", surface: "matrx-user/organizations" },
  { prefix: "/canvas", surface: "matrx-user/canvas" },
  { prefix: "/ai-results", surface: "matrx-user/ai-results" },
  { prefix: "/research", surface: "matrx-user/research" },
  { prefix: "/sandboxes", surface: "matrx-user/sandboxes" },
  { prefix: "/transcripts/cleanup", surface: "matrx-user/transcripts-cleanup" },
  { prefix: "/transcripts/scribe", surface: "matrx-user/transcript-scribe" },
  { prefix: "/transcripts", surface: "matrx-user/transcripts" },
  { prefix: "/transcript-studio", surface: "matrx-user/transcript-studio" },
  { prefix: "/dashboard", surface: "matrx-user/dashboard" },
  {
    prefix: "/observational-memory",
    surface: "matrx-user/observational-memory",
  },
  { prefix: "/scraper", surface: "matrx-user/scraper" },
  { prefix: "/gallery", surface: "matrx-user/gallery" },
  { prefix: "/feedback", surface: "matrx-user/feedback" },
  { prefix: "/voice-pad", surface: "matrx-user/voice-pad" },
  { prefix: "/share", surface: "matrx-user/share" },
  // Legacy path aliases (old surface names / bookmarks)
  { prefix: "/content-extractor", surface: "matrx-user/extractor-chunker" },
  { prefix: "/pdf-widgets", surface: "matrx-user/pdf-extractor" },
  { prefix: "/custom-apps", surface: "matrx-user/custom-apps" },

  // Admin routes — prefer matrx-admin/* when on the admin section.
  { prefix: "/administration", surface: "matrx-admin/system-agents" },
  { prefix: "/admin", surface: "matrx-admin/system-agents" },
] as const;

/**
 * Marketing routes nest dynamic ids (`/marketing/brands/[brandId]/sites/
 * [siteId]/<vertical>/...`), so plain prefix matching can't tell the site
 * verticals apart. First path segment AFTER the site id → surface; the
 * page/crawl detail branches are special-cased because their children
 * (snapshots, reports, urls, logs) belong to the detail surface.
 */
const MARKETING_SITE_VERTICAL_SURFACES: Readonly<Record<string, string>> = {
  pages: "matrx-user/marketing-site-pages",
  crawls: "matrx-user/marketing-crawls",
  audit: "matrx-user/marketing-audit",
  analysis: "matrx-user/marketing-analysis",
  findings: "matrx-user/marketing-findings",
  links: "matrx-user/marketing-links",
  backlinks: "matrx-user/marketing-backlinks",
  coverage: "matrx-user/marketing-coverage",
  sitemaps: "matrx-user/marketing-sitemaps",
  discovery: "matrx-user/marketing-discovery",
  integrations: "matrx-user/marketing-integrations",
  // access / settings / cost stay on the site surface — they configure the
  // same entity and don't warrant their own agent bindings.
};

function resolveMarketingSurface(stripped: string): string | null {
  if (stripped !== "/marketing" && !stripped.startsWith("/marketing/")) {
    return null;
  }
  const segments = stripped.split("/").filter(Boolean); // ["marketing", ...]

  // /marketing/batches[...]
  if (segments[1] === "batches") return "matrx-user/marketing-batches";

  // /marketing/brands/[brandId][...]
  if (segments[1] === "brands" && segments.length >= 3) {
    // /marketing/brands/[brandId]/sites/[siteId][...]
    if (segments[3] === "sites" && segments.length >= 5) {
      const vertical = segments[5];
      if (!vertical) return "matrx-user/marketing-site";
      // Page detail (+ snapshots subtree) is the page workspace surface.
      if (vertical === "pages" && segments.length >= 7) {
        return "matrx-user/marketing-page";
      }
      // Crawl detail (+ urls/logs/snapshots/links/reports subtree).
      if (vertical === "crawls" && segments.length >= 7 && segments[6] !== "new") {
        return "matrx-user/marketing-crawl";
      }
      return (
        MARKETING_SITE_VERTICAL_SURFACES[vertical] ??
        "matrx-user/marketing-site"
      );
    }
    return "matrx-user/marketing-brand";
  }

  // Hub-level routes: /marketing, /brands list, /sites list + legacy shims,
  // /connections, /cost, /admin.
  return "matrx-user/marketing";
}

/**
 * Resolve the active surface name from a pathname. Returns null when no
 * mapping matches — callers omit `client.surface` in that case and the
 * server resolves tools without DB surface inheritance.
 */
export function surfaceFromPathname(
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;
  // Strip the (authenticated) route group prefix Next.js doesn't include in the
  // URL but TS App Router sometimes reports.
  const stripped = pathname.replace(/^\/?\(authenticated\)/, "");

  // Analysis Studio is `/files/f/[id]/studio` — must not steal plain file viewer
  // (which correctly resolves to `matrx-user/files` via the `/files` prefix).
  if (/^\/files\/f\/[^/]+\/studio(?:\/|$)/.test(stripped)) {
    return "matrx-user/analysis-studio";
  }

  const marketing = resolveMarketingSurface(stripped);
  if (marketing) return marketing;

  for (const { prefix, surface } of SURFACE_ROUTE_MAPPINGS) {
    if (
      stripped === prefix ||
      stripped.startsWith(prefix + "/") ||
      stripped === prefix.replace(/\/$/, "")
    ) {
      return surface;
    }
  }
  return null;
}

/**
 * Same as `surfaceFromPathname` but reads `window.location.pathname`
 * directly. Returns null on the server (no window) or when no mapping
 * matches.
 */
export function detectActiveSurface(): string | null {
  if (typeof window === "undefined") return null;
  return surfaceFromPathname(window.location.pathname);
}
