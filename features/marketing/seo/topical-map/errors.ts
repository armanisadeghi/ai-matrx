// features/marketing/seo/topical-map/errors.ts
//
// U1 — "error surfacing of RPC messages VERBATIM (they are written for humans
// and agents)".
//
// THE TENSION THIS FILE RESOLVES. This repo's standing rule is that a raw
// PostgREST `error.message` never reaches a person (`utils/errors.ts`,
// `pnpm check:access-errors`) — because for most tables it is an RLS code and
// schema prose nobody can act on. The 26 `seo.*` map functions are the stated
// exception: their refusals were WRITTEN as sentences for the person making the
// change ("Cannot retire topics with attachments: …", "merge needs exactly one
// of into_page_id / into_node_id"), and rewording one destroys the only
// explanation the user will ever get.
//
// So both are kept, separately and honestly:
//
//   `error.message`  — the calm generic sentence `makeAssertData` already
//                      produced inside `data.ts`. Safe anywhere.
//   `rpcMessage`     — the function's OWN words, unaltered, un-truncated.
//   `code`/`detail`/`hint` — everything else Postgres said.
//
// A screen renders `rpcMessage` when there is one and falls back to `message`.
// Nothing is swallowed: every failure is also pushed through `captureError` so
// it reaches the Error Inspector and — at red tier — `public.system_error`.

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

/**
 * SQLSTATEs the map functions raise on purpose, each with a sentence meant for
 * the caller. Kept as documentation of intent, not as a filter: EVERY message
 * is preserved, whatever the code.
 *
 *   22023  a bad argument — names the argument and what it must be
 *   23514  a policy refused — lists every blocking topic and its attachments
 *   42501  <fn>_denied — access before existence, so a foreign id and an
 *          invented one are deliberately indistinguishable
 *   P0002  a slug that is not in this map (or is retired / rejected)
 */
export const TOPICAL_MAP_RAISED_CODES = ["22023", "23514", "42501", "P0002"] as const;

export interface TopicalMapRpcErrorFields {
  /** The Postgres message, byte for byte. */
  rpcMessage: string | null;
  code: string | null;
  detail: string | null;
  hint: string | null;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Pulls the function's own words out of whatever was thrown.
 *
 * `data.ts` wraps every failure with `operationFailed(action, cause)`, so the
 * PostgrestError travels as `cause`. A direct throw (or a nested cause chain)
 * is walked too.
 */
export function readRpcErrorFields(error: unknown): TopicalMapRpcErrorFields {
  let cursor: unknown = error;
  for (let depth = 0; depth < 5 && cursor; depth += 1) {
    if (typeof cursor === "object") {
      const record = cursor as Record<string, unknown>;
      const code = readString(record, "code");
      const message = readString(record, "message");
      // A PostgrestError always carries `code`; a plain Error does not. That is
      // the discriminator — not the presence of `message`, which both have.
      if (code) {
        return {
          rpcMessage: message,
          code,
          detail: readString(record, "details") ?? readString(record, "detail"),
          hint: readString(record, "hint"),
        };
      }
      cursor = record.cause;
      continue;
    }
    break;
  }
  return { rpcMessage: null, code: null, detail: null, hint: null };
}

/** A failed topical-map operation, carrying both audiences' text. */
export class TopicalMapError extends Error {
  readonly rpcMessage: string | null;
  readonly code: string | null;
  readonly detail: string | null;
  readonly hint: string | null;
  /** The RPC or table operation that failed, e.g. `seo.retire_map_topics`. */
  readonly relation: string;

  constructor(relation: string, cause: unknown) {
    const fields = readRpcErrorFields(cause);
    const generic =
      cause instanceof Error ? cause.message : `We couldn't complete ${relation}.`;
    super(generic, { cause });
    this.name = "TopicalMapError";
    this.relation = relation;
    this.rpcMessage = fields.rpcMessage;
    this.code = fields.code;
    this.detail = fields.detail;
    this.hint = fields.hint;
  }

  /**
   * What a screen shows. The function's own sentence when it wrote one — never
   * reworded, never truncated — otherwise the calm generic one.
   */
  get displayMessage(): string {
    return this.rpcMessage ?? this.message;
  }
}

/**
 * Wraps a topical-map call: captures the failure once, then rethrows it as a
 * `TopicalMapError` so every caller — query hook, mutation hook, or a direct
 * await — gets the same two-audience shape.
 *
 * Capture NEVER breaks the caller (error-capture's first non-negotiable), so
 * the capture itself is swallowed and only the original failure propagates.
 */
export async function withTopicalMapErrors<T>(
  relation: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    const wrapped = new TopicalMapError(relation, cause);
    try {
      captureError({
        source: "topical-map-rpc",
        relation,
        message: wrapped.rpcMessage ?? wrapped.message,
        userMessage: wrapped.displayMessage,
        code: wrapped.code ?? undefined,
        details: wrapped.detail ?? undefined,
        hint: wrapped.hint ?? undefined,
        name: wrapped.name,
        stack: wrapped.stack,
        callSite: "features/marketing/seo/topical-map/errors.ts",
      });
    } catch {
      // Capture is best-effort; the real failure below is what matters.
    }
    throw wrapped;
  }
}

/**
 * The sentence to render for any thrown value, without ever handing a caller
 * `[object Object]` or an empty string.
 */
export function topicalMapErrorText(error: unknown): string {
  if (error instanceof TopicalMapError) return error.displayMessage;
  const fields = readRpcErrorFields(error);
  if (fields.rpcMessage) return fields.rpcMessage;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong reading the topical map.";
}
