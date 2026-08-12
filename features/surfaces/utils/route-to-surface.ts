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
  { prefix: "/agents/shortcuts", surface: "matrx-user/agent-shortcuts" },
  { prefix: "/agents", surface: "matrx-user/agents" },
  // Real routes for the connections/apps hubs (old /agents/* paths were fiction).
  {
    prefix: "/agent-connections/skills",
    surface: "matrx-user/connections-skills",
  },
  { prefix: "/agent-connections", surface: "matrx-user/agent-connections" },
  { prefix: "/agent-apps", surface: "matrx-user/agent-apps" },

  // Standalone top-level pages.
  { prefix: "/chat/voice", surface: "matrx-user/chat-voice" },
  { prefix: "/chat/a/", surface: "matrx-user/chat" },
  { prefix: "/chat", surface: "matrx-user/chat" },
  { prefix: "/code-editor", surface: "matrx-user/code-editor" },
  { prefix: "/code", surface: "matrx-user/code-editor" },
  { prefix: "/smart-code-editor", surface: "matrx-user/smart-code-editor" },
  { prefix: "/markdown-editor", surface: "matrx-user/markdown-editor" },
  { prefix: "/markdown-studio", surface: "matrx-user/markdown-studio" },
  { prefix: "/knowledge", surface: "matrx-user/knowledge" },
  { prefix: "/suggestions", surface: "matrx-user/knowledge" },
  { prefix: "/shapes", surface: "matrx-user/shapes" },
  { prefix: "/notes", surface: "matrx-user/notes" },
  { prefix: "/messages", surface: "matrx-user/messages" },
  { prefix: "/tasks", surface: "matrx-user/tasks" },
  { prefix: "/crm", surface: "matrx-user/crm" },
  // Images family. The my-cloud tab is the library; the four studio tools
  // each carry their own surface. The static /images/studio landing maps to
  // the studio surface it fronts (/images/convert is the live tool); the
  // /images/ai-generate coming-soon hero maps to image-generate. The
  // remaining /images routes are static explainers/stubs and deliberately
  // map to nothing.
  { prefix: "/images/my-cloud", surface: "matrx-user/images" },
  { prefix: "/images/convert", surface: "matrx-user/image-studio" },
  { prefix: "/images/studio", surface: "matrx-user/image-studio" },
  { prefix: "/images/generate", surface: "matrx-user/image-generate" },
  { prefix: "/images/ai-generate", surface: "matrx-user/image-generate" },
  { prefix: "/images/edit", surface: "matrx-user/image-edit" },
  { prefix: "/images/annotate", surface: "matrx-user/image-annotate" },
  { prefix: "/files", surface: "matrx-user/files" },
  { prefix: "/projects", surface: "matrx-user/projects" },
  { prefix: "/lists", surface: "matrx-user/lists" },
  { prefix: "/tools/pdf-extractor", surface: "matrx-user/pdf-extractor" },
  { prefix: "/tools/scanner", surface: "matrx-user/scanner" },
  { prefix: "/documents", surface: "matrx-user/documents" },
  { prefix: "/settings", surface: "matrx-user/settings" },
  { prefix: "/user-settings", surface: "matrx-user/settings" },
  { prefix: "/data-tables", surface: "matrx-user/data-tables" },
  { prefix: "/data", surface: "matrx-user/data-tables" },
  // CMS: /cms and /cms/html-pages are plain prefixes; the site workspace
  // nests a dynamic [siteId] and is resolved by resolveCmsSurface below.
  { prefix: "/cms/html-pages", surface: "matrx-user/html-page" },
  { prefix: "/cms", surface: "matrx-user/cms" },
  { prefix: "/war-room/all", surface: "matrx-user/war-room" },
  { prefix: "/war-room", surface: "matrx-user/war-room-thread" },
  { prefix: "/organizations", surface: "matrx-user/organizations" },
  { prefix: "/context-items", surface: "matrx-user/context-items" },
  { prefix: "/scopes", surface: "matrx-user/scopes" },
  { prefix: "/canvas", surface: "matrx-user/canvas" },
  { prefix: "/ai-results", surface: "matrx-user/ai-results" },
  { prefix: "/rag/search", surface: "matrx-user/rag-search" },
  { prefix: "/rag/library-catalog", surface: "matrx-user/rag-library" },
  { prefix: "/rag/library", surface: "matrx-user/rag-library" },
  { prefix: "/rag/data-stores", surface: "matrx-user/rag-data-stores" },
  { prefix: "/rag/viewer", surface: "matrx-user/rag-viewer" },
  { prefix: "/rag", surface: "matrx-user/rag-library" },
  { prefix: "/research", surface: "matrx-user/research" },
  { prefix: "/sandbox", surface: "matrx-user/sandboxes" },
  { prefix: "/transcripts/cleanup", surface: "matrx-user/transcripts-cleanup" },
  { prefix: "/transcripts/scribe", surface: "matrx-user/transcript-scribe" },
  // More specific than "/transcripts", so it MUST stay above it. The studio
  // route is `/transcripts/studio`; the old "/transcript-studio" prefix
  // matched no route in the app, so the studio silently resolved to the
  // parent `matrx-user/transcripts` surface.
  { prefix: "/transcripts/studio", surface: "matrx-user/transcript-studio" },
  { prefix: "/transcripts", surface: "matrx-user/transcripts" },
  // Education: specific tools BEFORE the hub prefix.
  { prefix: "/education/tutor", surface: "matrx-user/education-tutor" },
  {
    prefix: "/education/flashcards",
    surface: "matrx-user/education-flashcards",
  },
  { prefix: "/education/fastfire", surface: "matrx-user/education-fastfire" },
  { prefix: "/education/quizzes", surface: "matrx-user/education-assessment" },
  {
    prefix: "/education/practice-tests",
    surface: "matrx-user/education-assessment",
  },
  {
    prefix: "/education/grade-work",
    surface: "matrx-user/education-grade-work",
  },
  { prefix: "/education/mind-maps", surface: "matrx-user/education-mind-maps" },
  { prefix: "/education/memory", surface: "matrx-user/education-memory" },
  { prefix: "/education/planner", surface: "matrx-user/education-planner" },
  {
    prefix: "/education/practice-oral",
    surface: "matrx-user/education-practice-oral",
  },
  { prefix: "/education/progress", surface: "matrx-user/education-progress" },
  { prefix: "/education/learn", surface: "matrx-user/education-learn" },
  {
    prefix: "/education/audio-study",
    surface: "matrx-user/education-audio-study",
  },
  { prefix: "/education/game", surface: "matrx-user/education-game" },
  { prefix: "/education", surface: "matrx-user/education" },
  { prefix: "/dashboard", surface: "matrx-user/dashboard" },
  // Podcast: run + create studios BEFORE the hub prefix.
  { prefix: "/podcast/studio/run", surface: "matrx-user/podcast-run" },
  {
    prefix: "/podcast/studio/create",
    surface: "matrx-user/podcast-studio",
  },
  { prefix: "/podcast", surface: "matrx-user/podcast" },
  { prefix: "/schedules", surface: "matrx-user/schedules" },
  { prefix: "/workbooks", surface: "matrx-user/workbooks" },
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

  // Admin routes — prefer matrx-admin/* when on the admin section.
  // Specific admin surfaces BEFORE the /administration catch-all.
  {
    prefix: "/administration/agents/mcp-tools",
    surface: "matrx-admin/tool-registry",
  },
  {
    prefix: "/administration/ai/ai-models",
    surface: "matrx-admin/ai-models",
  },
  { prefix: "/administration/database", surface: "matrx-admin/database" },
  {
    prefix: "/administration/agents/system-agents",
    surface: "matrx-admin/system-agents",
  },
  {
    prefix: "/administration/agents/agent-apps",
    surface: "matrx-admin/agent-apps",
  },
  { prefix: "/administration/agents/bundles", surface: "matrx-admin/bundles" },
  {
    prefix: "/administration/agents/mcp-servers",
    surface: "matrx-admin/mcp-servers",
  },
  { prefix: "/administration/agents/lookups", surface: "matrx-admin/lookups" },
  {
    prefix: "/administration/agents/slots",
    surface: "matrx-admin/agent-slots",
  },
  // users family: specific children BEFORE the /administration/users hub.
  {
    prefix: "/administration/users/feedback",
    surface: "matrx-admin/feedback",
  },
  { prefix: "/administration/users/email", surface: "matrx-admin/email" },
  {
    prefix: "/administration/users/agent-review",
    surface: "matrx-admin/agent-review",
  },
  { prefix: "/administration/users", surface: "matrx-admin/users" },
  {
    prefix: "/administration/chat/cx-dashboard",
    surface: "matrx-admin/cx-dashboard",
  },
  {
    prefix: "/administration/compute/server-logs",
    surface: "matrx-admin/server-logs",
  },
  {
    prefix: "/administration/compute/sandbox",
    surface: "matrx-admin/sandbox",
  },
  {
    prefix: "/administration/ui/official-components",
    surface: "matrx-admin/official-components",
  },
  {
    prefix: "/administration/applications",
    surface: "matrx-admin/applications",
  },
  {
    prefix: "/administration/automation/scheduling",
    surface: "matrx-admin/scheduling",
  },
  // NO /administration catch-all: an unmapped admin route resolves to null
  // (caller omits client.surface) rather than lying that it is system-agents.
  // Register a manifest + a specific prefix here when an admin family gets
  // its surface. The old catch-all mis-attributed every admin route.
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
  reputation: "matrx-user/marketing-reputation",
  ranks: "matrx-user/marketing-ranks",
  coverage: "matrx-user/marketing-coverage",
  sitemaps: "matrx-user/marketing-sitemaps",
  discovery: "matrx-user/marketing-discovery",
  integrations: "matrx-user/marketing-integrations",
  settings: "matrx-user/marketing-site-settings",
  keywords: "matrx-user/marketing-site-keywords",
  media: "matrx-user/marketing-site-media",
  // access / cost / structure stay on the site surface — they re-project the
  // same entity and don't warrant their own agent bindings. Settings left that
  // list on 2026-08-11: it is agent-WRITABLE (crawl policy), which is a
  // capability the parent surface cannot carry.
};

function resolveMarketingSurface(stripped: string): string | null {
  if (stripped !== "/marketing" && !stripped.startsWith("/marketing/")) {
    return null;
  }
  const segments = stripped.split("/").filter(Boolean); // ["marketing", ...]

  if (segments[1] === "keyword-research") return "matrx-user/keyword-research";
  // /marketing/content-plan (list) vs /marketing/content-plan/[siteId]
  // (workspace). The workspace's ?view= refinements (setup/entities/node)
  // are query/panel state the pathname cannot see — the page's live
  // SurfaceRuntimeProvider carries the precise surface; this mapping is the
  // pathname-only fallback.
  if (segments[1] === "content-plan") {
    return segments.length >= 3
      ? "matrx-user/content-plan"
      : "matrx-user/content-plan-list";
  }
  // /marketing/ranks — the CROSS-SITE hub (per-site ranks resolve via the
  // site-vertical map below).
  if (segments[1] === "ranks") return "matrx-user/marketing-ranks-hub";

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
      if (
        vertical === "crawls" &&
        segments.length >= 7 &&
        segments[6] !== "new"
      ) {
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
 * CMS nests a dynamic `[siteId]` (`/cms/[siteId]/pages/[pageId]`), so plain
 * prefix matching can't tell the site workspace from the hub — every
 * `/cms/<uuid>` route fell through to `matrx-user/cms`. First segment AFTER
 * the site id picks the surface; page/component detail routes belong to their
 * own editor surfaces.
 */
/**
 * Agent routes nest a dynamic `[id]` (`/agents/[id]/build`, `/agents/[id]/run`),
 * so the flat prefixes `/agents/builder` and `/agents/run` never matched the
 * real paths — every agent sub-route fell through to `matrx-user/agents`.
 * The segment AFTER the agent id picks the surface.
 */
const AGENT_SUBROUTE_SURFACES: Readonly<Record<string, string>> = {
  build: "matrx-user/agent-builder",
  run: "matrx-user/agent-run",
  shortcuts: "matrx-user/agent-shortcuts",
  apps: "matrx-user/agent-apps",
};

function resolveAgentsSurface(stripped: string): string | null {
  if (stripped !== "/agents" && !stripped.startsWith("/agents/")) return null;
  const segments = stripped.split("/").filter(Boolean); // ["agents", ...]
  if (segments.length < 3) return null; // /agents, /agents/all → flat prefixes

  // Non-id second segments (all, new, battle, sets, templates, admin) are
  // hub routes, not a specific agent.
  const HUB_SEGMENTS = new Set([
    "all",
    "new",
    "battle",
    "sets",
    "templates",
    "admin",
    "builder",
    "run",
    "run-history",
    "edit",
    "settings",
    "gate",
    "shortcuts",
  ]);
  if (HUB_SEGMENTS.has(segments[1])) return null; // fall through to prefixes

  // /agents/[id]/<section>
  return AGENT_SUBROUTE_SURFACES[segments[2]] ?? null;
}

function resolveCmsSurface(stripped: string): string | null {
  if (stripped !== "/cms" && !stripped.startsWith("/cms/")) return null;
  const segments = stripped.split("/").filter(Boolean); // ["cms", ...]

  // /cms/html-pages[...] and /cms/admin keep their own handling.
  if (segments[1] === "html-pages") return "matrx-user/html-page";
  if (segments[1] === "admin") return "matrx-user/cms";

  // /cms/[siteId][...]
  if (segments.length >= 2) {
    const section = segments[2];
    if (!section) return "matrx-user/cms-site";
    // Page detail / new-page editor is the page surface; the pages LIST is
    // part of the site workspace (it emits the site scope + tab extras).
    if (section === "pages") {
      return segments.length >= 4
        ? "matrx-user/cms-page"
        : "matrx-user/cms-site";
    }
    if (section === "components") return "matrx-user/cms-component";
    // collections / settings configure the same entity — stay on the site.
    return "matrx-user/cms-site";
  }

  return "matrx-user/cms";
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

  // The flashcard set EDITOR is `/education/flashcards/[setId]/edit` — a
  // dynamic segment mid-path, so the `/education/flashcards` prefix below
  // cannot tell it apart from the library list. It is its own surface (ONE set
  // and its cards, and agent-WRITABLE), so it must not fall through to the
  // list surface, whose vocabulary this page shares nothing with.
  if (/^\/education\/flashcards\/[^/]+\/edit(?:\/|$)/.test(stripped)) {
    return "matrx-user/education-flashcard-editor";
  }

  const marketing = resolveMarketingSurface(stripped);
  if (marketing) return marketing;

  const cms = resolveCmsSurface(stripped);
  if (cms) return cms;

  const agents = resolveAgentsSurface(stripped);
  if (agents) return agents;

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
