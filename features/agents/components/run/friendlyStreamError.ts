// features/agents/components/run/friendlyStreamError.ts
//
// WHAT A FAILED TURN IS ALLOWED TO SAY TO THE PERSON IN THE ROOM.
//
// 🚨 THE DEFECT (Masterwork cold walk 5, finding 7, 2026-09-16). A raw backend
// exception rendered inside a live Vision Interview thread, between the Sounding
// Board's reply and the composer, with the Expert's just-typed turn still
// unsent below it:
//
//   ⚠ Conversation already exists: A conversation with
//     id='40dd2c57-6b43-47c4-b81c-1f40efedc977' already exists and has already
//     been used. Pass is_new=false to continue it, or mint a new
//     conversation_id.
//
// A UUID, an internal parameter name, and an instruction addressed to a
// programmer, printed as if it were part of the interview. The race behind that
// particular 409 is fixed at its source (the room no longer claims a
// materialization it has not been told), but "we fixed the one that got out" is
// not a fix for the class: ANY server error whose payload carries no
// `user_message` reached the room verbatim.
//
// THE RULE: the bubble shows a DECLARED sentence — the server's own
// `user_message`, or ours for a code we recognise, or an honest generic one
// with the remedy — and the raw text goes under "Details", where it was always
// meant to live. A message that reads as machine talk never wins.
//
// It is not censorship and it is not a stand-in that hides a failure: the
// failure is stated, the remedy is stated, and every original byte is one click
// away.

/** A remedy is part of the sentence, never a separate hope. */
interface KnownFailure {
  message: string;
}

/**
 * Errors we have met and can say something true and useful about. Keyed by the
 * server's own `error_type` / `code`.
 */
const KNOWN: Record<string, KnownFailure> = {
  conversation_already_exists: {
    message:
      "We tried to start this conversation twice at once, so the second try was refused. Nothing you wrote was lost — press Retry and it will carry on the one that is already here.",
  },
  mandate_unfulfilled: {
    message:
      "No one is assigned to answer here yet, so this could not be sent. An administrator assigns it in Settings; nothing you wrote was lost.",
  },
};

/**
 * Does this read as a machine talking to itself rather than to a person?
 *
 * Deliberately blunt, and deliberately erring towards "yes": a parameter name,
 * a bare UUID, a quoted identifier or a code-shaped token all mean the same
 * thing — this sentence was written for whoever wrote the server.
 */
export function looksLikeDeveloperTalk(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  // is_new=false, conversation_id, status_code — a snake_case identifier.
  if (/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/.test(text)) return true;
  // A bare UUID, with or without quotes.
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)
  )
    return true;
  // id='…' / key="…" — an assignment, not a sentence.
  if (/\w+\s*=\s*['"]/.test(text)) return true;
  // A stack frame or a module path.
  if (/\bTraceback\b|\.py[:"]|\bat [A-Za-z0-9_$.]+ \(/.test(text)) return true;
  // JSON or a structural fragment.
  if (/^[[{]/.test(text) || /"[A-Za-z_][A-Za-z0-9_]*"\s*:/.test(text))
    return true;
  return false;
}

export const GENERIC_FAILURE =
  "That message could not be sent — something on our side refused it. Nothing you wrote was lost: press Retry, and the details are below if you want them.";

/**
 * The sentence the bubble shows, and the raw text that goes under Details.
 *
 * Order: the server's own person-facing message, then ours for a code we know,
 * then the raw message ONLY when it reads as something a person wrote, then the
 * honest generic one. The raw text is always preserved as `detail`, even when it
 * is the thing we refused to show.
 */
export function friendlyStreamError(input: {
  userMessage?: string | null;
  message?: string | null;
  errorType?: string | null;
  code?: string | number | null;
  recordError?: string | null;
}): { message: string; detail: string | null } {
  const raw = (input.message ?? "").trim() || null;
  const declared = (input.userMessage ?? "").trim();
  if (declared)
    return { message: declared, detail: raw && raw !== declared ? raw : null };

  const keys = [input.errorType, input.code].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  for (const key of keys) {
    const known = KNOWN[key];
    if (known) return { message: known.message, detail: raw };
  }

  if (raw && !looksLikeDeveloperTalk(raw)) {
    return { message: raw, detail: null };
  }

  const recorded = (input.recordError ?? "").trim();
  if (!raw && recorded && !looksLikeDeveloperTalk(recorded)) {
    return { message: recorded, detail: null };
  }

  return { message: GENERIC_FAILURE, detail: raw ?? recorded ?? null };
}

/**
 * A run REFUSED because a variable bound to the author's data had nothing to
 * give (aidream `ScopeBindingUnresolved` → `error_type: "binding_unresolved"`,
 * `details: {variable, table_id, table_name, reason, retryable: false}`).
 *
 * Retrying cannot help — the data, not the request, is missing — so this is an
 * actionable state, never "try again". The server's own `user_message` wins;
 * without one, the sentence names the variable and the table and says the two
 * ways out.
 */
export interface BindingUnresolvedFailure {
  message: string;
  variable: string | null;
  tableName: string | null;
}

export function bindingUnresolvedFailure(input: {
  errorType?: string | null;
  code?: string | number | null;
  userMessage?: string | null;
  message?: string | null;
  details?: unknown;
}): BindingUnresolvedFailure | null {
  const details =
    input.details && typeof input.details === "object"
      ? (input.details as Record<string, unknown>)
      : {};
  // Older servers classified nothing and wrapped it as "<Route> failed
  // unexpectedly (ScopeBindingUnresolved). Please try again…" — recognise that
  // too, and never repeat its "try again".
  const wrapped = /\bScopeBindingUnresolved\b/;
  const isIt =
    input.errorType === "binding_unresolved" ||
    input.code === "binding_unresolved" ||
    wrapped.test(input.userMessage ?? "") ||
    wrapped.test(input.message ?? "");
  if (!isIt) return null;
  const variable =
    typeof details.variable === "string" ? details.variable : null;
  const tableName =
    typeof details.table_name === "string" ? details.table_name : null;
  const offered = (input.userMessage ?? "").trim();
  const declared =
    offered && !wrapped.test(offered) && !/try again/i.test(offered)
      ? offered
      : "";
  const message =
    declared ||
    `This agent needs ${variable ? `“${variable}”` : "a value"}${
      tableName ? ` from ${tableName}` : " from your data"
    }, which has no value right now. Fill it in, or change what happens when that data is missing.`;
  return { message, variable, tableName };
}
