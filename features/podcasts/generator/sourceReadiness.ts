// features/podcasts/generator/sourceReadiness.ts
//
// Client mirror of Podcast Generator GATE 1. Keep this deliberately narrow:
// it prevents requests the server will deterministically reject before any
// generation work, but does not pre-judge externally prepared topic or file
// sources.

export const MIN_PODCAST_CONTENT_CHARS = 1000;

export interface PodcastSourceReadiness {
  ready: boolean;
  message: string | null;
}

interface PodcastSourceRequest {
  input_data_type?: unknown;
  input_data?: unknown;
}

function hasNonemptyDialogueBlock(content: string): boolean {
  const blocks = content.matchAll(/<podcast_dialogue>([\s\S]*?)<\/podcast_dialogue>/g);
  return Array.from(blocks).some(([, block]) => block.trim().length > 0);
}

/**
 * Mirrors the server's deterministic content gate: pass-through content needs
 * at least 1,000 trimmed characters unless it is already a complete dialogue.
 * Topics and files are prepared elsewhere and therefore remain eligible here.
 */
export function getPodcastSourceReadiness(
  inputDataType: string | null | undefined,
  inputData: unknown,
): PodcastSourceReadiness {
  if (inputDataType !== "full_content" && inputDataType !== "partial_content") {
    return { ready: true, message: null };
  }

  const content = typeof inputData === "string" ? inputData.trim() : "";
  // Python's len() counts Unicode code points; JavaScript's string.length
  // counts UTF-16 code units and would incorrectly accept 500 emoji as 1,000
  // characters. Array.from follows the server's counting model.
  const characterCount = Array.from(content).length;
  if (
    hasNonemptyDialogueBlock(content) ||
    characterCount >= MIN_PODCAST_CONTENT_CHARS
  ) {
    return { ready: true, message: null };
  }

  const remaining = MIN_PODCAST_CONTENT_CHARS - characterCount;
  return {
    ready: false,
    message:
      characterCount === 0
        ? "Paste source content before generating."
        : `Add at least ${remaining} more characters of source content, or paste a complete formatted podcast script.`,
  };
}

/** Whether a saved request is eligible for a fresh run from its source. */
export function canRerunPodcastSource(
  request: PodcastSourceRequest | null | undefined,
): boolean {
  if (!request) return false;
  return getPodcastSourceReadiness(
    typeof request.input_data_type === "string"
      ? request.input_data_type
      : null,
    request.input_data,
  ).ready;
}
