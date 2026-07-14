// features/education/tutor/turnTrust.ts
//
// The PER-TURN structured-trust channel for the conversational tutor.
//
// The tutor is a streaming markdown-text agent, so — unlike the one-shot JSON
// lanes (lanes/helpLive.ts) — it can't return a `trust` field on a JSON object.
// Instead, the (re-authored) tutor agent emits its markdown answer AND, on its
// own final line, a single machine-readable HTML comment carrying the
// TrustEnvelope for THAT turn:
//
//   <!--MATRX_TRUST_V1 {"confidence":"grounded","groundedIn":"…","citations":[…]}-->
//
// An HTML comment is invisible in the rendered markdown (the chat markdown
// renderer drops raw HTML), so it never pollutes the student's view — it rides
// ALONGSIDE the prose in the same stream. This module is the FE half: pull that
// envelope out of an assistant message's raw text and coerce it through the ONE
// canonical trust contract (features/education/trust). Never throws; returns
// null when the turn carries no envelope (older messages, mid-stream before the
// closing `-->`, or a non-conforming answer) so the caller can fall back to the
// grounding-derived strip.

import {
  coerceTrustEnvelope,
  type TrustEnvelope,
} from "@/features/education/trust/types";

/** The sentinel that opens the per-turn trust comment. Keep in sync with the
 *  tutor agent's system prompt (see FEATURE.md → Trust). Versioned so the format
 *  can evolve without silently mis-reading an old transcript. */
export const TUTOR_TRUST_SENTINEL = "MATRX_TRUST_V1" as const;

// Matches `<!--MATRX_TRUST_V1 {…}-->`. Global + non-greedy so we can take the
// LAST envelope in the message (a turn emits exactly one, but be robust).
const TRUST_COMMENT_RE = new RegExp(
  `<!--\\s*${TUTOR_TRUST_SENTINEL}\\s*([\\s\\S]*?)-->`,
  "g",
);

/**
 * Flatten an assistant message's `content` to searchable answer text.
 *
 * The agents pipeline stores assistant content as a structured PARTS array
 * (`[{type:"thinking",text}, {type:"text",text}, …]`) — a `Json` value, NOT a
 * plain string — so the trust comment rides inside the `type:"text"` part, not
 * at the top level. We concatenate the text of the visible answer parts only
 * (never `thinking`/reasoning, which the student never sees and which must never
 * be a source of a "trust" envelope). Tolerant of the legacy plain-string shape
 * and of unknown part shapes.
 */
function contentToAnswerText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (part && typeof part === "object" && !Array.isArray(part)) {
        const p = part as { type?: unknown; text?: unknown };
        if (p.type === "text" && typeof p.text === "string") parts.push(p.text);
      }
    }
    return parts.join("\n");
  }
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const t = (content as { text?: unknown }).text;
    if (typeof t === "string") return t;
  }
  return "";
}

/**
 * Extract the per-turn TrustEnvelope embedded in an assistant message's content
 * (a structured parts array or a plain string). Returns null when there is no
 * (complete) envelope — including while the answer is still streaming and the
 * closing `-->` hasn't arrived yet.
 */
export function extractTurnTrust(content: unknown): TrustEnvelope | null {
  const text = contentToAnswerText(content);
  if (!text || text.indexOf(TUTOR_TRUST_SENTINEL) === -1) return null;
  let raw: string | null = null;
  // Take the last match (the turn's envelope is emitted at the very end).
  TRUST_COMMENT_RE.lastIndex = 0;
  for (let m = TRUST_COMMENT_RE.exec(text); m; m = TRUST_COMMENT_RE.exec(text)) {
    raw = m[1];
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null; // partial/garbled JSON (e.g. still streaming) — no envelope yet
  }
  return coerceTrustEnvelope(parsed);
}

/**
 * Remove the trust comment(s) from a message's text — a defensive strip for any
 * surface whose renderer does NOT drop raw HTML comments (the chat markdown
 * renderer does, so the transcript itself needs no strip). Pure; safe on text
 * with no sentinel.
 */
export function stripTurnTrust(content: string): string {
  if (content.indexOf(TUTOR_TRUST_SENTINEL) === -1) return content;
  return content.replace(TRUST_COMMENT_RE, "").trimEnd();
}
