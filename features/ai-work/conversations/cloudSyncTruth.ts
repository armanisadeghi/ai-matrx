// features/ai-work/conversations/cloudSyncTruth.ts
//
// THE CLOUD HALF OF THE SYNC TRUTH — what AI Matrx itself can honestly say
// about one coding session, and the one sentence it is NOT allowed to say.
//
// Why this exists (Arman, 2026-09-17): "I have a chat in Claude Code that
// simply doesn't match what I see in AI Matrx. I cannot figure out what is
// wrong. A normal DB system would show me that it can't sync, or when it was
// synced — this thing is a dead fish." On his Mac, 741 conversations have a
// cloud conversation row with ZERO delivered entries, and 655 more are
// hook-lane partial BY DESIGN — and the old screen said, for all of them,
// "AI Matrx holds this conversation".
//
// WHERE THE WORDS COME FROM. Every verdict sentence on this screen is the
// server's `cloud_sentence`, rendered verbatim. The aidream bridge's typed
// `diagnose` action is the ONE door (CS-25 contract §4) and therefore the ONE
// wording source: the desktop app's own sync-truth view embeds the same
// `BridgeDiagnosis` block, so web and desktop cannot drift into two different
// English answers about the same session. This module composes exactly ONE
// sentence itself — the §2 `unknown` sentence — because that is the only one
// the server cannot produce: it is the sentence for "the server did not
// answer".
//
// WHY NOT A DIRECT SUPABASE READ. The repo data rule is React → Supabase for
// plain reads, and this deliberately is not one. The counts here are over
// `chat.coding_session_entry`, whose rows this repo has never read from the
// browser (raw provider entries stay server-side — see
// `features/agent-connections/coding-sessions/service.ts`), and the verdict is
// a computation whose OUTPUT IS ENGLISH that two other programs render. A
// second implementation of that computation in the browser is the defect this
// whole task exists to kill, one layer up.
//
// 🚨 THE ONE RULE HERE: `in_sync` NEVER REACHES THE SCREEN FROM THE SERVER.
// The server cannot see this Mac's transcript, its delivery queue, or its
// local mirror (contract §4), so a cloud half that reports `in_sync` is
// claiming agreement about layers it never read — the dead fish wearing a
// green light. Such a verdict is downgraded to `unknown`, here, before any
// component can render it.

import { apiPost } from "@/lib/api/typed-client";

/** The CLOSED verdict set (contract §1). Anything else is not a verdict. */
export const SYNC_VERDICT_CODES = [
  "in_sync",
  "partial_by_design",
  "behind_local",
  "behind_cloud",
  "mirror_stale",
  "diverged",
  "quarantined",
  "not_in_cloud",
  "unknown",
] as const;

export type SyncVerdictCode = (typeof SYNC_VERDICT_CODES)[number];

function isVerdictCode(value: unknown): value is SyncVerdictCode {
  return (
    typeof value === "string" &&
    (SYNC_VERDICT_CODES as readonly string[]).includes(value)
  );
}

/** Contract §2, `unknown` row — the only sentence this module composes. */
export function unknownVerdictSentence(
  unreadableLayer: string,
  reason: string,
): string {
  return `Cannot tell whether this conversation is in sync: ${unreadableLayer} could not be read (${reason}).`;
}

/** Contract §2, `unknown` row, remedy column — verbatim. */
export const UNKNOWN_VERDICT_REMEDY =
  "Try again in a moment; if it keeps failing, check that AI Matrx is reachable and you are signed in.";

/** Contract §4: what the server admits it cannot see, in its own words. */
const THIS_MACS_TRANSCRIPT = "this Mac's transcript";
const NOT_VISIBLE_FROM_THE_SERVER = "not visible from the server";
/** The layer named when the server's own answer is missing or unusable. */
const AI_MATRX_RECORD = "AI Matrx's record of this session";

export interface CloudProjectionErrorGroup {
  code: string;
  detail: string | null;
  count: number;
}

/**
 * `BridgeDiagnosis` (contract §4), validated at run time.
 *
 * It is NOT derived from `types/python-generated/api-types.ts` because the
 * aidream half of the contract is landing in parallel and the generated file is
 * never hand-edited. So nothing here is asserted: every field is read with a
 * type check and a missing one makes the whole diagnosis unreadable rather than
 * zero. The day `pnpm sync-types` carries `BridgeDiagnosis`, this interface
 * becomes `components["schemas"]["BridgeDiagnosis"]` and `readDiagnosis` keeps
 * only its null check.
 */
export interface CloudDiagnosis {
  provider_session_id: string;
  session_present: boolean;
  conversation_id: string | null;
  fidelity: string | null;
  status: string | null;
  last_seen_at: string | null;
  entries: number;
  projected_entries: number;
  skipped_entries: number;
  pending_entries: number;
  error_entries: number;
  projection_errors: CloudProjectionErrorGroup[];
  last_entry_at: string | null;
  last_entry_id: string | null;
  messages: number;
  last_position: number | null;
  last_message_at: string | null;
  cloud_verdict: string;
  cloud_sentence: string;
  cloud_remedy: string | null;
}

export interface SyncVerdict {
  code: SyncVerdictCode;
  sentence: string;
  remedy: string | null;
}

export interface CloudSyncTruth {
  /**
   * `null` means AI Matrx's own record could not be read. Every count then
   * renders as unknown — never as 0, which is a claim.
   */
  diagnosis: CloudDiagnosis | null;
  verdict: SyncVerdict;
}

// ── Runtime readers ─────────────────────────────────────────────────────────

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function errorGroups(value: unknown): CloudProjectionErrorGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: CloudProjectionErrorGroup[] = [];
  for (const entry of value) {
    const row = record(entry);
    const code = str(row?.code);
    if (code === null) continue;
    groups.push({
      code,
      detail: str(row?.detail),
      count: int(row?.count) ?? 0,
    });
  }
  return groups;
}

/**
 * The server's diagnosis, or `null` when the payload is not one. Every count is
 * required: a diagnosis missing `entries` cannot be rendered as "0 delivered",
 * because that reads as a fact about the session instead of a gap in the
 * answer.
 */
export function readDiagnosis(payload: unknown): CloudDiagnosis | null {
  const row = record(payload);
  if (row === null) return null;
  const providerSessionId = str(row.provider_session_id);
  const entries = int(row.entries);
  const messages = int(row.messages);
  const verdict = str(row.cloud_verdict);
  if (providerSessionId === null || entries === null || messages === null) {
    return null;
  }
  if (verdict === null) return null;
  return {
    provider_session_id: providerSessionId,
    session_present: row.session_present === true,
    conversation_id: str(row.conversation_id),
    fidelity: str(row.fidelity),
    status: str(row.status),
    last_seen_at: str(row.last_seen_at),
    entries,
    projected_entries: int(row.projected_entries) ?? 0,
    skipped_entries: int(row.skipped_entries) ?? 0,
    pending_entries: int(row.pending_entries) ?? 0,
    error_entries: int(row.error_entries) ?? 0,
    projection_errors: errorGroups(row.projection_errors),
    last_entry_at: str(row.last_entry_at),
    last_entry_id: str(row.last_entry_id),
    messages,
    last_position: int(row.last_position),
    last_message_at: str(row.last_message_at),
    cloud_verdict: verdict,
    cloud_sentence: typeof row.cloud_sentence === "string" ? row.cloud_sentence : "",
    cloud_remedy: str(row.cloud_remedy),
  };
}

/** The `unknown` verdict, assembled from the §2 row. */
export function unknownVerdict(
  unreadableLayer: string,
  reason: string,
): SyncVerdict {
  return {
    code: "unknown",
    sentence: unknownVerdictSentence(unreadableLayer, reason),
    remedy: UNKNOWN_VERDICT_REMEDY,
  };
}

/**
 * The verdict this screen may render for a diagnosis the server answered with.
 *
 * The server's sentence is used VERBATIM — this function never re-words it. It
 * only refuses three things, each of which would put an unearned claim on the
 * screen:
 *
 *  1. `in_sync` — forbidden for the cloud half (contract §4): the server never
 *     read the transcript, the delivery queue, or this Mac's mirror.
 *  2. a code outside the §1 closed set — a verdict this app cannot honour.
 *  3. a known code with no sentence — nothing to say, so it says that.
 */
export function cloudVerdictOf(diagnosis: CloudDiagnosis): SyncVerdict {
  if (diagnosis.cloud_verdict === "in_sync") {
    return unknownVerdict(THIS_MACS_TRANSCRIPT, NOT_VISIBLE_FROM_THE_SERVER);
  }
  if (!isVerdictCode(diagnosis.cloud_verdict)) {
    return unknownVerdict(
      AI_MATRX_RECORD,
      `the server sent a verdict this app does not know: "${diagnosis.cloud_verdict}"`,
    );
  }
  if (diagnosis.cloud_sentence.trim() === "") {
    return unknownVerdict(
      AI_MATRX_RECORD,
      `the server sent the verdict "${diagnosis.cloud_verdict}" with no sentence`,
    );
  }
  return {
    code: diagnosis.cloud_verdict,
    sentence: diagnosis.cloud_sentence,
    remedy: diagnosis.cloud_remedy,
  };
}

// ── The one door ────────────────────────────────────────────────────────────

/**
 * Ask the aidream bridge to diagnose one provider session's cloud half.
 *
 * Never throws: every failure becomes an `unknown` verdict naming the layer and
 * the reason, because a thrown error at this seam is how a screen ends up with
 * an empty panel and no sentence. A refusal (the server on a build without the
 * `diagnose` action) is a readable answer and is reported as one.
 */
export async function readCloudSyncTruth(
  providerSessionId: string,
  provider = "claude_code",
): Promise<CloudSyncTruth> {
  let payload: unknown;
  try {
    const { data } = await apiPost("/coding-sessions/bridge", {
      schema_version: 1,
      // `CodingSessionBridgeRestRequest.action` is `BridgeAction | string`, so
      // this type-checks against the CURRENT contract while the server half of
      // §4 lands; a build without the action answers with a refusal, below.
      action: "diagnose",
      provider,
      provider_session_id: providerSessionId,
    });
    payload = data;
  } catch (error) {
    return {
      diagnosis: null,
      verdict: unknownVerdict(
        AI_MATRX_RECORD,
        error instanceof Error ? error.message : "the request to AI Matrx failed",
      ),
    };
  }

  const response = record(payload);
  const refusal = record(response?.refusal);
  if (refusal !== null) {
    const code = str(refusal.code);
    const message = str(refusal.message) ?? str(refusal.detail);
    return {
      diagnosis: null,
      verdict: unknownVerdict(
        AI_MATRX_RECORD,
        message ??
          (code !== null
            ? `AI Matrx refused the request: ${code}`
            : "AI Matrx refused the request"),
      ),
    };
  }

  const diagnosis = readDiagnosis(response?.diagnosis);
  if (diagnosis === null) {
    return {
      diagnosis: null,
      verdict: unknownVerdict(
        AI_MATRX_RECORD,
        "AI Matrx answered without a diagnosis",
      ),
    };
  }
  return { diagnosis, verdict: cloudVerdictOf(diagnosis) };
}
