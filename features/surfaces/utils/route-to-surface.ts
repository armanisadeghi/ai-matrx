/**
 * Route → DB surface name mapping.
 *
 * Given `window.location.pathname`, returns the matching `ui_surface.name`
 * row that the server's resolver in
 * `aidream/api/utils/surface_resolver.py` knows about. The DB has 76
 * surfaces; this mapping covers the matrx-user routes the chat / agent
 * flows hit today. Add a row to `SURFACE_BY_ROUTE_PREFIX` when a new
 * route ships AND the corresponding surface exists in `public.ui_surface`.
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

interface RouteMapping {
  prefix: string;
  surface: string;
}

const SURFACE_BY_ROUTE_PREFIX: readonly RouteMapping[] = [
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
  { prefix: "/transcripts", surface: "matrx-user/transcripts" },
  { prefix: "/transcript-studio", surface: "matrx-user/transcript-studio" },
  { prefix: "/dashboard", surface: "matrx-user/dashboard" },
  { prefix: "/observational-memory", surface: "matrx-user/observational-memory" },
  { prefix: "/scraper", surface: "matrx-user/scraper" },
  { prefix: "/gallery", surface: "matrx-user/gallery" },
  { prefix: "/feedback", surface: "matrx-user/feedback" },
  { prefix: "/voice-pad", surface: "matrx-user/voice-pad" },
  { prefix: "/share", surface: "matrx-user/share" },
  { prefix: "/content-extractor", surface: "matrx-user/content-extractor" },
  { prefix: "/pdf-widgets", surface: "matrx-user/pdf-widgets" },
  { prefix: "/custom-apps", surface: "matrx-user/custom-apps" },

  // Admin routes — prefer matrx-admin/* when on the admin section.
  { prefix: "/administration", surface: "matrx-admin/system-agents" },
  { prefix: "/admin", surface: "matrx-admin/system-agents" },
] as const;

/**
 * Resolve the active surface name from a pathname. Returns null when no
 * mapping matches — callers omit `client.surface` in that case and the
 * server resolves tools without DB surface inheritance.
 */
export function surfaceFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  // Strip the (authenticated) route group prefix Next.js doesn't include in the
  // URL but TS App Router sometimes reports.
  const stripped = pathname.replace(/^\/?\(authenticated\)/, "");
  for (const { prefix, surface } of SURFACE_BY_ROUTE_PREFIX) {
    if (stripped === prefix || stripped.startsWith(prefix + "/") || stripped === prefix.replace(/\/$/, "")) {
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
