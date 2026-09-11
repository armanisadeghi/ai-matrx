/**
 * WHY A RUN FORM WOULD NOT LOAD — in words the reader can act on.
 *
 * 🚨 THE DEFECT THIS CLOSES (Masterwork "Verification Desk", 2026-09-11).
 * Six nodes of the workflow failed the server's compile gate, so
 * `GET /workflows/{id}/run-form` answered 400 — and the run box printed
 *
 *     Could not read what this asks for
 *     Bad request. Please check your input.
 *
 * The reader had typed nothing. The sentence blamed them for a workflow that
 * does not compile, and the server's six named, node-addressed reasons were
 * shown nowhere. A screen is absent or honest, never wearing a false
 * sentence (the fourth law).
 *
 * This module is the SHARED answer, not the Masterwork box's: every surface
 * built on `useServedRunForm` — the Masterwork try box, the canonical run
 * form, the trigger default-inputs editor, the bake-off commission page —
 * reads its refusal through here, so none of them can go back to a generic
 * sentence on its own.
 *
 * It never invents a reason. When the server explains itself, the server's
 * words win; when it does not, the missing explanation is named AS the defect
 * rather than papered over.
 */

/** The error shape `callApi` hands back on a failed request. */
export interface RunFormApiError {
  status?: number | undefined;
  message?: string | undefined;
  serverDetail?: unknown;
}

export interface RunFormFailure {
  /** The sentence to print. Never a sentence that blames the reader. */
  message: string;
  /** One line per problem the server named, ready to render as a list. */
  issues: string[];
  /** The server sent a real reason (as opposed to a bare status). */
  serverExplained: boolean;
  /** This workflow does not compile — the fix is in the workflow, not here. */
  doesNotCompile: boolean;
}

/**
 * Printed ONLY when the server refused without saying why. It names the
 * missing reason as the defect, because that is what it is — a server that
 * answers an error with no readable message is itself a bug worth reporting.
 */
export const GENERIC_REFUSAL_FALLBACK =
  "The server would not serve this workflow's inputs and sent no reason " +
  "with it — the missing reason is itself a defect worth reporting. Reload " +
  "and try once more; if it repeats, report it.";

/** The `error` discriminator the run-form endpoint uses for a compile refusal. */
const DOES_NOT_COMPILE = "definition_does_not_compile";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Sentences that blame the reader for the server's own refusal. A transport
 * default that says "check your input" is worse than silence when the reader
 * has typed nothing, so it is never printed — the server's real words, or the
 * honest fallback above, take its place.
 */
const BLAMES_THE_READER = /check your input/i;

/** Unwrap FastAPI's `{detail: …}` and aidream's own envelope alike. */
function body(serverDetail: unknown): Record<string, unknown> | null {
  if (!isRecord(serverDetail)) return null;
  return isRecord(serverDetail.detail) ? serverDetail.detail : serverDetail;
}

/**
 * One readable line per issue: the node it is about, then what is wrong.
 *
 * `field` is the compile gate's own path (`nodes[manip_open].type`). It is
 * kept verbatim — it is how the reader finds the step in Studio — and only
 * joined to the message.
 */
function readIssues(detail: Record<string, unknown> | null): string[] {
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

export function describeRunFormFailure(
  error: RunFormApiError | null | undefined,
): RunFormFailure {
  const detail = body(error?.serverDetail);
  const issues = readIssues(detail);
  const doesNotCompile = str(detail?.error) === DOES_NOT_COMPILE;

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

  // A transport default that blames the reader is not an explanation.
  const explained = served.length > 0 && !BLAMES_THE_READER.test(served);

  return {
    message: explained ? served : GENERIC_REFUSAL_FALLBACK,
    issues,
    serverExplained: explained,
    doesNotCompile,
  };
}

/**
 * The `<ServedFormScream>` props for a failed run-form fetch — ONE place, so
 * the Masterwork try box, the canonical run form, the trigger editor and the
 * commission page cannot say four different things about the same refusal.
 *
 * `surfaceNote` is the surface's own technical tail ("the run form is SERVED
 * (GET …) — without it there is nothing honest to render"). It is appended
 * only when the refusal is NOT a compile failure: when the workflow does not
 * compile, the reader needs the workflow's problems, and a note about which
 * endpoint serves the form — or worse, about the fields below being a
 * fallback pair — is noise at best and a false accusation at worst. That is
 * the exact sentence that greeted the "Verification Desk" reader on
 * 2026-09-11 while they had typed nothing at all.
 */
export function runFormScreamProps(
  failure: RunFormFailure,
  options: { title: string; surfaceNote?: string },
): { title: string; body: string; issues: string[] } {
  if (failure.doesNotCompile) {
    return {
      title: "This workflow cannot run yet",
      body: failure.message,
      issues: failure.issues,
    };
  }
  const note = options.surfaceNote ? ` ${options.surfaceNote}` : "";
  return {
    title: options.title,
    body: `${failure.message}${note}`,
    issues: failure.issues,
  };
}
