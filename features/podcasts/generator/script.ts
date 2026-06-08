// features/podcasts/generator/script.ts
//
// The pipeline's `script` (and the early `create_script` stage preview) is a
// STRUCTURED document, not a flat transcript:
//
//   ```json
//   { "author": "...", "title": "...", "description": "...", "slug_options": [...] }
//   ```
//   Episode Duration: ~6 minutes
//   <podcast_dialogue>
//   Alex: ...
//   Sarah: ...
//   </podcast_dialogue>
//   [END OF EPISODE]
//
// This parser pulls it apart by its known delimiters so the UI can render the
// real two-host dialogue (and tease it by speaker) instead of dumping the JSON
// header, the tags, and the end marker. It is deliberately tolerant of PARTIAL
// input — the live `scriptPreview` (~500 chars) and rolling `liveText` are often
// truncated mid-structure.

export interface DialogueTurn {
  speaker: string;
  text: string;
}

export interface ParsedScript {
  duration: string | null;
  turns: DialogueTurn[];
  /** Distinct speakers in order of first appearance. */
  speakers: string[];
  /** Clean plain-text fallback (speakers preserved, JSON/tags stripped). */
  plain: string;
}

// A dialogue turn opens with a short speaker label then a colon: "Alex: …".
const SPEAKER_RE = /^([A-Za-z][A-Za-z0-9.'’\- ]{0,20}?):\s+(.*)$/;

// Colon-led labels that are NOT speakers (only relevant when there are no
// <podcast_dialogue> tags to scope us).
const NON_SPEAKER = new Set([
  "episode duration",
  "duration",
  "title",
  "author",
  "description",
  "note",
  "summary",
]);

const OPEN_TAG = "<podcast_dialogue>";
const CLOSE_TAG = "</podcast_dialogue>";

function turnsFromDialogue(dialogue: string): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  let cur: DialogueTurn | null = null;
  for (const rawLine of dialogue.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(SPEAKER_RE);
    if (m && !NON_SPEAKER.has(m[1].trim().toLowerCase())) {
      if (cur) turns.push(cur);
      cur = { speaker: m[1].trim(), text: m[2].trim() };
    } else if (cur) {
      cur.text += " " + line;
    }
    // Leading text before the first speaker (e.g. a truncated turn tail) is
    // dropped — we only surface complete speaker-attributed turns.
  }
  if (cur) turns.push(cur);
  return turns;
}

export function parseScript(raw: string): ParsedScript {
  if (!raw || !raw.trim()) {
    return { duration: null, turns: [], speakers: [], plain: "" };
  }

  const durationMatch = raw.match(/Episode Duration:\s*([^\n]+)/i);
  const duration = durationMatch ? durationMatch[1].trim() : null;

  // Prefer the explicit dialogue region — this cleanly discards the JSON header,
  // the duration line, and anything before the conversation.
  let dialogue: string;
  const open = raw.indexOf(OPEN_TAG);
  if (open !== -1) {
    const close = raw.indexOf(CLOSE_TAG, open);
    dialogue = raw.slice(
      open + OPEN_TAG.length,
      close === -1 ? undefined : close,
    );
  } else {
    // No tags — strip fenced code blocks (```json … ```) and the end marker,
    // then parse whatever speaker lines remain.
    dialogue = raw.replace(/```[\s\S]*?```/g, "");
  }
  dialogue = dialogue
    .replace(/\[END OF EPISODE\]/gi, "")
    .replace(/<\/?podcast_dialogue>/gi, "")
    .replace(/^\s*Episode Duration:[^\n]*$/gim, "")
    .trim();

  const turns = turnsFromDialogue(dialogue);
  const speakers = [...new Set(turns.map((t) => t.speaker))];
  const plain = turns.length
    ? turns.map((t) => `${t.speaker}: ${t.text}`).join("\n\n")
    : dialogue;

  return { duration, turns, speakers, plain };
}

/**
 * Stable color slot for a speaker (by order of appearance) so the two hosts get
 * consistent, distinct accents across the transcript and the teaser.
 */
export function speakerSlot(speaker: string, speakers: string[]): 0 | 1 {
  return speakers.indexOf(speaker) % 2 === 0 ? 0 : 1;
}
