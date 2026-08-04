/**
 * Map a `ui_surface.name` (e.g. `matrx-user/notes`) to the conversation
 * `source_feature` product slug. Chrome hosts (ProTextarea, surface-agents
 * header) use this so they never invent intermediary feature names.
 */

import {
  isSourceFeature,
  type SourceFeature,
} from "@/types/python-generated/source-attribution";

const SURFACE_SLUG_TO_FEATURE: Record<string, SourceFeature> = {
  chat: "chat",
  "chat-voice": "voice-agent",
  notes: "notes",
  messages: "messages",
  tasks: "tasks",
  projects: "projects",
  files: "files",
  documents: "documents",
  lists: "files",
  cms: "cms",
  "cms-page": "cms",
  "cms-site": "cms",
  "cms-component": "cms",
  "html-page": "cms",
  research: "research",
  podcast: "podcasts",
  podcasts: "podcasts",
  "code-editor": "code-editor",
  "smart-code-editor": "code-editor",
  "markdown-editor": "notes",
  "markdown-studio": "notes",
  "pdf-extractor": "pdf-extractor",
  scanner: "scanner",
  "rag-search": "rag-search",
  "rag-library": "rag-search",
  "rag-data-stores": "rag-search",
  "rag-viewer": "rag-search",
  canvas: "canvas",
  "ai-results": "ai-results",
  dictionary: "dictionary",
  scraper: "scraper",
  transcripts: "transcription",
  "transcripts-cleanup": "transcription",
  "transcript-studio": "transcription",
  "transcript-scribe": "transcription",
  "agent-builder": "agent-builder",
  "agent-run": "agent-runner",
  "agent-run-history": "agent-run-history-window",
  "agent-advanced-editor": "agent-advanced-editor-window",
  agents: "agent-runner",
  "agent-apps": "agent-app",
  "education-tutor": "education-tutor",
  "education-flashcards": "education-flashcards",
  "education-fastfire": "education-fastfire",
  "education-planner": "education-planner",
  "education-mind-maps": "education-mindmap",
  "education-quizzes": "education-assessment",
  "education-practice-tests": "education-assessment",
  "data-tables": "udt",
  "working-document": "working-document",
  scratchpad: "scratchpad",
  "image-studio": "image-studio",
  images: "image-studio",
  "content-plan-setup": "marketing",
  "content-plan-entities": "marketing",
  warRoom: "agent-runner",
  "war-room": "agent-runner",
  "war-room-thread": "agent-runner",
};

/**
 * Resolve a product `source_feature` from a surface name.
 * Returns null when the surface has no registered mapping.
 */
export function sourceFeatureFromSurfaceName(
  surfaceName: string | null | undefined,
): SourceFeature | null {
  if (!surfaceName) return null;
  const slug = surfaceName.includes("/")
    ? surfaceName.slice(surfaceName.lastIndexOf("/") + 1)
    : surfaceName;
  const mapped = SURFACE_SLUG_TO_FEATURE[slug];
  if (mapped) return mapped;
  if (isSourceFeature(slug)) return slug;
  if (slug.startsWith("education-") && isSourceFeature(slug)) return slug;
  return null;
}
