/**
 * THE REPO-DIFF PROPOSAL — the client half of Hindsight's reviewable change
 * path for repo-owned artifacts (disease D8 in
 * `common-docs/operations/agent-failure-diseases.md`).
 *
 * **Arman's ruling, 2026-08-19:** *"Have a way to make changes to skills, but it
 * has to be via a DIFF system that requires review or something like that. All
 * tracked."*
 *
 * Hindsight can rewrite DATABASE-owned things (an agent's prompt) because they
 * have an apply button and a version ladder. It had no path at all to REPO-owned
 * things — skills, tool notes, docs — which are exactly the artifacts that go
 * silently stale and then teach our own agents to fail. This is that path: the
 * proposal is filed as an ordinary `users.user_feedback` row, and the machine
 * half rides `metadata.repo_diff` so this console can RENDER it as a diff and
 * hand a self-contained prompt to a coding session.
 *
 * 🚨 **Nothing on either side of the wire may apply one automatically.** The
 * server writes no repo file (guarded in `aidream/services/hindsight/
 * repo_proposals.py` + its tests), and this client offers no apply button. The
 * payload carries `auto_apply: false` so that constraint travels in the DATA and
 * a future surface cannot decide on its own that a one-click apply would help.
 *
 * The key and field names are the server's, byte for byte — producer:
 * `aidream/services/hindsight/repo_proposals.py::repo_diff_metadata`.
 */

/** The ONE `users.user_feedback.metadata` key that carries a proposal. */
export const REPO_DIFF_METADATA_KEY = "repo_diff";

export type RepoDiffProposal = {
  /** Workspace repo directory, e.g. "aidream", "matrx-frontend". */
  repo: string;
  /** Path relative to that repo's root. */
  file_path: string;
  /** `diff -u` shaped. EMPTY means "this is wrong and no fix was certain". */
  unified_diff: string;
  title: string;
  rationale: string;
  evidence: string[];
  /** Which producer found it — a guard name, or "hindsight_reviewer". */
  source: string;
  dedupe_key: string;
  /** Self-contained prompt for the coding session that will apply it. */
  coding_session_prompt: string;
  has_diff: boolean;
  /** Always false. Present so the constraint is in the data, not just in docs. */
  auto_apply: boolean;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Read a proposal off a feedback row's metadata, or null.
 *
 * Deliberately strict on the fields the UI cannot render without, and tolerant
 * on the rest: a proposal filed by an older server build should still show its
 * diff rather than vanish from the console, because a proposal nobody sees is
 * indistinguishable from a proposal that was never filed.
 */
export function readRepoDiffProposal(
  metadata: unknown,
): RepoDiffProposal | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const raw = (metadata as Record<string, unknown>)[REPO_DIFF_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.repo !== "string" || typeof p.file_path !== "string") return null;

  const unified_diff = typeof p.unified_diff === "string" ? p.unified_diff : "";
  return {
    repo: p.repo,
    file_path: p.file_path,
    unified_diff,
    title: typeof p.title === "string" ? p.title : p.file_path,
    rationale: typeof p.rationale === "string" ? p.rationale : "",
    evidence: isStringArray(p.evidence) ? p.evidence : [],
    source: typeof p.source === "string" ? p.source : "hindsight",
    dedupe_key: typeof p.dedupe_key === "string" ? p.dedupe_key : "",
    coding_session_prompt:
      typeof p.coding_session_prompt === "string" ? p.coding_session_prompt : "",
    has_diff:
      typeof p.has_diff === "boolean" ? p.has_diff : unified_diff.length > 0,
    // Absent means false. There is no shape of this payload that means "yes".
    auto_apply: false,
  };
}
