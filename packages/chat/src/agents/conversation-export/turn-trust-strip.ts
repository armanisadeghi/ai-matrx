/**
 * The tutor's per-turn trust comment rides at the end of a streamed answer as an HTML comment
 * (`<!--MATRX_TRUST_V1 {...}-->`). It is storage plumbing: every export/copy of a message strips it.
 * The sentinel is versioned so the format can evolve without mis-reading an old transcript; the
 * host's tutor parser (features/education/tutor/turnTrust) reads the same sentinel.
 */
export const TUTOR_TRUST_SENTINEL = "MATRX_TRUST_V1" as const;

const TRUST_COMMENT_RE = new RegExp(`<!--\\s*${TUTOR_TRUST_SENTINEL}\\s*([\\s\\S]*?)-->`, "g");

/** Remove the trust comment from a message's text. Pure; safe on text with no sentinel. */
export function stripTurnTrust(content: string): string {
  if (content.indexOf(TUTOR_TRUST_SENTINEL) === -1) return content;
  return content.replace(TRUST_COMMENT_RE, "").trimEnd();
}
