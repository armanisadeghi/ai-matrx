/**
 * errorSourceFeature.ts
 *
 * Which FEATURE a captured client error belongs to, from the route it happened on.
 *
 * `source_app` / `source_feature` are ONE two-level categorization: the app, then
 * the feature inside it (Arman, 2026-09-18). `matrx-frontend` is the app for every
 * row this repo writes, so the app half never varied and never told anyone
 * anything — until `ops.system_error` gained `source_feature` on 2026-09-20, an
 * error in the CMS and an error in the education tutor were the same row.
 *
 * THE FALLBACK IS LOUD, NOT SILENT. A route this table does not cover returns
 * `client-unmapped`, a registered slug that means exactly "a client app recorded
 * this error and could not map the failing surface to a feature". It is never
 * folded into `system`, because `system` is a real answer (platform chrome) and
 * "we do not know" is not. Every `client-unmapped` row in the error dashboard is
 * a request for one more line in the table below — that is the intended way this
 * map grows, and the reason it does not have to be complete today.
 *
 * Slugs come from the closed registry mirrored in
 * `types/python-generated/source-attribution.ts` (source of truth:
 * aidream `services/conversation_context/source_attribution.py`). The
 * `SourceFeature` return type means a slug that is not registered will not
 * compile.
 */

import {
  isSourceFeature,
  type SourceFeature,
} from "@/types/python-generated/source-attribution";

/** The registered sentinel for "this client could not name the feature". */
export const UNMAPPED_CLIENT_SOURCE_FEATURE: SourceFeature = "client-unmapped";

/**
 * First path segment → feature. Only unambiguous surfaces are here on purpose;
 * a guess that folds one product into another is worse than the sentinel,
 * because it is wrong in a way nobody can see (THE FOLD RULE).
 */
const BY_FIRST_SEGMENT: Readonly<Record<string, SourceFeature>> = {
  administration: "admin",
  "agent-apps": "agent-app",
  "agent-connections": "agents-other",
  agents: "agents-other",
  chat: "chat",
  cms: "cms",
  code: "code-editor",
  crm: "crm",
  dashboard: "system",
  data: "udt",
  "data-tables": "udt",
  "data-v2": "udt",
  dictionary: "dictionary",
  documents: "documents",
  drive: "files",
  exports: "files",
  files: "files",
  images: "image-studio",
  invitations: "system",
  legal: "legal",
  marketing: "marketing",
  masterwork: "masterwork",
  "markdown-studio": "documents",
  me: "system",
  messages: "messages",
  notes: "notes",
  organizations: "system",
  podcast: "podcasts",
  print: "print",
  projects: "projects",
  rag: "rag-search",
  research: "research",
  scraper: "scraper",
  search: "system",
  settings: "system",
  tasks: "tasks",
  "tool-call-visualization": "tool-call-visualization",
  tools: "tool-testing",
  transcripts: "transcription",
  trash: "files",
  "user-settings": "system",
  voice: "voice-agent",
  welcome: "system",
};

/**
 * Education is a family of separate products under one segment, and they must
 * filter apart: a FastFire grading failure and a study-planner failure have
 * different owners. An education route this does not name stays unmapped rather
 * than collapsing into a sibling.
 */
const EDUCATION_BY_SECOND_SEGMENT: Readonly<Record<string, SourceFeature>> = {
  analytics: "education-analytics",
  assessment: "education-assessment",
  "fast-fire": "education-fastfire",
  fastfire: "education-fastfire",
  flashcards: "education-flashcards",
  ingest: "education-ingest",
  mindmap: "education-mindmap",
  planner: "education-planner",
  tutor: "education-tutor",
};

function segments(route: string): string[] {
  // A captured route can be a pathname, a pathname with a query, or a full URL.
  const withoutQuery = route.split("?")[0]!.split("#")[0]!;
  const path = withoutQuery.includes("://")
    ? withoutQuery.replace(/^[a-z]+:\/\/[^/]*/i, "")
    : withoutQuery;
  return path.split("/").filter(Boolean);
}

/**
 * The feature a client error on `route` belongs to. Never throws, never returns
 * an unregistered slug, and never silently guesses: anything this map does not
 * cover comes back as `client-unmapped`.
 */
export function sourceFeatureForRoute(
  route: string | null | undefined,
): SourceFeature {
  if (!route) return UNMAPPED_CLIENT_SOURCE_FEATURE;
  const parts = segments(route);
  if (parts.length === 0) return "system"; // the app root IS platform chrome
  const first = parts[0]!.toLowerCase();
  if (first === "education") {
    const second = (parts[1] ?? "").toLowerCase();
    return EDUCATION_BY_SECOND_SEGMENT[second] ?? UNMAPPED_CLIENT_SOURCE_FEATURE;
  }
  const mapped = BY_FIRST_SEGMENT[first];
  // The registry is generated; a slug removed from it upstream must not become a
  // string this app keeps sending. Re-check rather than trust the table.
  if (mapped && isSourceFeature(mapped)) return mapped;
  return UNMAPPED_CLIENT_SOURCE_FEATURE;
}
