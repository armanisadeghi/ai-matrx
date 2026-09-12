/**
 * WHY A DOOR WOULD NOT ANSWER — in words the reader can act on.
 *
 * 🚨 THE CLASS THIS CLOSES (FIX-Q8, 2026-09-11). Two surfaces, one defect,
 * three weeks apart:
 *
 *   · the Masterwork run box printed *"Bad request. Please check your input."*
 *     at a reader who had typed nothing (closed 2026-09-11 by
 *     `run-form-refusal.ts`);
 *   · the one-binding workspace printed *"The job's inputs could not be read:
 *     HTTP 400"* — a raw transport code interpolated into a half-sentence,
 *     with no cause and no remedy (V-PARITY/UX F4, and still live after F4
 *     closed the run-form half).
 *
 * Both are the SAME rule broken in two places: a transport default is not an
 * explanation, and a screen that prints one is a screen wearing a false
 * sentence (the fourth law). So the rule lives HERE, once, and every door
 * reader in the repo is built on it — `describeRunFormFailure` for the served
 * run form, `describeInputSurfaceFailure` for the mandate input surface.
 *
 * It never invents a reason. When the server explains itself, the server's
 * words win; when it does not, the missing explanation is named AS the defect
 * rather than papered over.
 */

/** The error shape `callApi` hands back on a failed request. */
export interface DoorApiError {
  status?: number | undefined;
  message?: string | undefined;
  serverDetail?: unknown;
}

export interface DoorRefusal {
  /** The sentence to print. Never a sentence that blames the reader, and never
   * a bare transport code. Already a complete, self-contained sentence — a
   * consumer PRINTS it, never interpolates it into a prefix of its own. */
  message: string;
  /** One line per problem the server named, ready to render as a list. */
  issues: string[];
  /** The server sent a real reason (as opposed to a bare status). */
  serverExplained: boolean;
  /** The unwrapped server body, for readers with their own discriminators. */
  detail: Record<string, unknown> | null;
}

/**
 * Sentences that blame the reader for the server's own refusal. A transport
 * default that says "check your input" is worse than silence when the reader
 * has typed nothing, so it is never printed — the server's real words, or the
 * caller's honest fallback, take its place.
 */
const BLAMES_THE_READER = /check your input/i;

/**
 * 🚨 A BARE TRANSPORT CODE IS NOT AN EXPLANATION. `HTTP 400`, `400`,
 * `Status 500.` — every shape a normalizer has ever produced when the server
 * sent no readable body. This is the exact string that reached a person's
 * screen on `/administration/mandates/{key}`, twice on one page.
 */
const BARE_TRANSPORT_CODE =
  /^\s*(?:HTTP|HTTP\s*Error|Status(?:\s*Code)?)?\s*[:\-]?\s*\d{3}\s*[.:!]?\s*$/i;

/** True when a candidate sentence is really just the status line wearing words. */
export function isBareTransportCode(text: string | null | undefined): boolean {
  if (!text) return false;
  return BARE_TRANSPORT_CODE.test(text);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Unwrap FastAPI's `{detail: …}` and aidream's own envelope alike. */
export function doorBody(
  serverDetail: unknown,
): Record<string, unknown> | null {
  if (!isRecord(serverDetail)) return null;
  return isRecord(serverDetail.detail) ? serverDetail.detail : serverDetail;
}

/**
 * One readable line per issue: where it is about, then what is wrong.
 *
 * `field` is the server's own path (`nodes[manip_open].type`). It is kept
 * verbatim — it is how the reader finds the thing — and only joined to the
 * message.
 */
export function doorIssues(
  detail: Record<string, unknown> | null,
): string[] {
  if (!detail || !Array.isArray(detail.details)) return [];
  return detail.details
    .filter(isRecord)
    .map((raw) => {
      const message = str(raw.message);
      if (!message) return "";
      const where = str(raw.field) || str(raw.node_id);
      return where ? `${where} — ${message}` : message;
    })
    .filter((line) => line.length > 0);
}

/**
 * The server's own words, or the caller's honest fallback — never a transport
 * default and never a sentence that blames the reader.
 *
 * `fallback` is the CALLER's sentence for "the server refused and said
 * nothing": it must name what could not be read and what the person can do,
 * because that is the only thing left to print.
 */
export function describeDoorRefusal(
  error: DoorApiError | null | undefined,
  options: { fallback: string },
): DoorRefusal {
  const detail = doorBody(error?.serverDetail);
  const issues = doorIssues(detail);

  // Preference order, same as `callApi`'s own reader: the server's
  // purpose-written sentence, then a plain `message`, then a FastAPI string
  // `detail`, then whatever `callApi` already resolved.
  const served =
    str(detail?.user_message) ||
    str(detail?.message) ||
    (typeof (error?.serverDetail as { detail?: unknown } | undefined)
      ?.detail === "string"
      ? str((error?.serverDetail as { detail?: unknown }).detail)
      : "") ||
    str(error?.message);

  const explained =
    served.length > 0 &&
    !BLAMES_THE_READER.test(served) &&
    !isBareTransportCode(served);

  return {
    message: explained ? served : options.fallback,
    issues,
    serverExplained: explained,
    detail,
  };
}
