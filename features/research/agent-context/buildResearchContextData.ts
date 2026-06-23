import type { PlacementMode } from "@/features/context-menu-v2/UnifiedAgentContextMenu";
import { createResearchScope } from "@/features/surfaces/manifests/research.manifest";
import type {
  ResearchTopic,
  ResearchProgress,
  ResearchKeyword,
} from "@/features/research/types";

/**
 * Placement visibility for the research surface menu.
 *
 * Research surfaces are a mix of editable inputs (the new-topic query / subject)
 * and read-only output the user reads (the assembled document, the syntheses).
 * The editor-only `content-block` placement (insert a template at the cursor)
 * makes sense on the editable query field but not on the presentational output;
 * the per-region `isEditable` flag already gates the text-mutating items, so we
 * leave every placement visible here and let each mount pass `isEditable`.
 * Modeled as `placementMode` (the modern API) so org/user tools stay visible.
 */
export const RESEARCH_CONTEXT_MENU_PLACEMENT_MODE: PlacementMode = {
  "ai-action": "show",
  "bound-agent": "show",
  "content-block": "show",
  "organization-tool": "show",
  "user-tool": "show",
  "quick-action": "show",
};

/** Shared menu props for `matrx-user/research` (editable + presentational). */
export const RESEARCH_CONTEXT_MENU_PROPS = {
  sourceFeature: "research" as const,
  surfaceName: "matrx-user/research" as const,
  placementMode: RESEARCH_CONTEXT_MENU_PLACEMENT_MODE,
};

/** A string with real (non-whitespace) content. */
function hasText(s: string | null | undefined): s is string {
  return !!s && s.trim().length > 0;
}

/** One generated research document, for the `synthesis_documents` value. */
export interface ResearchDocumentSummary {
  id: string;
  title: string;
  created_at?: string;
}

export interface BuildResearchContextDataArgs {
  /** Active topic, or null when none is loaded (e.g. the new-topic wizard). */
  topic?: ResearchTopic | null;
  /** Topic-level progress counters, when loaded. */
  progress?: ResearchProgress | null;
  /**
   * Keywords driving the topic's searches. Pass the loaded `ResearchKeyword[]`
   * or a plain `string[]` (the new-topic wizard has only the draft strings).
   */
  keywords?: ResearchKeyword[] | string[];
  /**
   * The primary body the user is reading/acting on — the assembled research
   * document, the displayed synthesis, OR (in the wizard) the typed query.
   * Becomes the baseline `content` and, when no topic is open, also seeds the
   * synthesis value so an agent always has the acting text.
   */
  primaryText?: string | null;
  /** Body of the most recent project-level synthesis, when shown separately. */
  synthesisText?: string | null;
  /** The generated documents for the topic (id + title + created_at). */
  documents?: ResearchDocumentSummary[];
  /**
   * Title of the document/synthesis currently on screen. Falls back to the
   * topic name. Surfaced inside `context` (no dedicated manifest value).
   */
  displayTitle?: string | null;
  /** Browser text selection scoped to the surface. Empty when none. */
  selectionText?: string;
  /**
   * Wizard-only: the in-progress topic name / description the user is typing
   * before a topic row exists. Lets the menu emit `topic_name` /
   * `topic_description` even on the creation surface.
   */
  draftTopicName?: string | null;
  draftTopicDescription?: string | null;
}

function normalizeKeywords(
  keywords: BuildResearchContextDataArgs["keywords"],
): string[] {
  if (!keywords || keywords.length === 0) return [];
  if (typeof keywords[0] === "string") {
    return (keywords as string[]).filter(hasText);
  }
  return (keywords as ResearchKeyword[])
    .map((k) => k.keyword)
    .filter(hasText);
}

/**
 * Canonical `contextData` for `matrx-user/research`.
 *
 * Pure mapping of live research state → `createResearchScope(...)`, so every
 * mount (the new-topic wizard query input, the DocumentViewer, the
 * SynthesisList) and any demo share one shape. Emits the auto-injected
 * baselines with real values where the surface has them (`content` = the
 * assembled document / synthesis / typed query, `selection` = the browser
 * selection, `context` = a small surface blob) plus every custom value the
 * manifest declares that the surface can source.
 */
export function buildResearchContextData(
  args: BuildResearchContextDataArgs,
): Record<string, unknown> {
  const {
    topic = null,
    progress = null,
    keywords,
    primaryText,
    synthesisText,
    documents,
    displayTitle,
    selectionText = "",
    draftTopicName,
    draftTopicDescription,
  } = args;

  const topicOpen = topic != null;
  const hasSelection = selectionText.length > 0;

  const keywordList = normalizeKeywords(keywords);

  // The body the agent acts on: the displayed document/synthesis/query.
  const bodyText = hasText(primaryText) ? primaryText : "";
  // The "current synthesis": an explicit synthesis body, else — when no topic
  // is open (the wizard) — the typed query, so the value is never empty just
  // because the user hasn't run the pipeline yet.
  const synthesis = hasText(synthesisText)
    ? synthesisText
    : !topicOpen && bodyText
      ? bodyText
      : "";

  const name = topic?.name || draftTopicName || "";
  const description = topic?.description || draftTopicDescription || "";
  const title = displayTitle || name || undefined;

  const activeScopeKind: "selection" | "synthesis" | "topic" | "empty" =
    !topicOpen && !bodyText
      ? "empty"
      : hasSelection
        ? "selection"
        : bodyText
          ? "synthesis"
          : "topic";

  const surround: Record<string, unknown> = {
    active_scope_kind: activeScopeKind,
    topic_open: topicOpen,
    topic_status: topic?.status ?? undefined,
    keyword_count: keywordList.length,
    source_count: progress?.total_sources ?? undefined,
    analysis_count: progress?.total_analyses ?? undefined,
    document_title: title,
  };

  const scope = createResearchScope({
    // Baselines + selection
    selection: hasSelection ? selectionText : undefined,
    content: bodyText || undefined,
    context: surround,

    // Topic identity & state
    topic_id: topic?.id || undefined,
    topic_name: name || undefined,
    topic_description: description || undefined,
    topic_status: topic?.status || undefined,
    autonomy_level: topic?.autonomy_level || undefined,

    // Material counts
    keyword_list: keywordList.length > 0 ? keywordList : undefined,
    source_count: progress?.total_sources,
    included_source_count: progress?.included_sources,
    analysis_count: progress?.total_analyses,

    // Synthesis / documents the user reads
    current_synthesis_text: synthesis || undefined,
    synthesis_documents:
      documents && documents.length > 0 ? documents : undefined,
  });

  return scope as Record<string, unknown>;
}
