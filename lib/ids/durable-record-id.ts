/**
 * THE ONE SEAM between a client-side record id and the database.
 *
 * The live transcript holds records the database has never seen: an assistant
 * answer committed when no `cx_message` reservation arrived (every incognito
 * turn — the server writes nothing for `store:false` — and any backend
 * reservation gap), one per under-announced tool-loop iteration, and tool-call
 * rows seeded from a `tool_error`. They carry client-temp ids minted ONLY by
 * {@link mintClientTempId}. Those ids are not UUIDs, and every record table
 * keys on `uuid`, so one of them in a read 400s the whole query with `22P02`
 * (2026-10-01: output-feedback, comments, highlights and links on one answer).
 *
 * Every reader or writer that turns a rendered record into a database identity
 * asks {@link durableRecordId} first. `null` means "no durable id yet": the
 * feature is absent (no thumbs, no comments, no pin), nothing is queried and
 * nothing is cached under the temp id. Identities are derived from the
 * record's id on every render, so the moment the durable row replaces the
 * temp one (DB hydration on load/refetch) every feature lights up on the real
 * id with no re-keying step of its own.
 */

import { isUuidShape } from "@ai-matrx/kit/uuid";

/** Prefix every client-temp record id carries. Nothing else may start with it. */
export const CLIENT_TEMP_ID_PREFIX = "client-";

/** What a client-temp id stands in for. */
export type ClientTempIdKind = "assistant" | "tool-call";

/**
 * Mint a client-temp record id. The only producer — a hand-built
 * `client-…` template elsewhere is a second door into the same class.
 */
export function mintClientTempId(
  kind: ClientTempIdKind,
  ...parts: Array<string | number>
): string {
  return [`${CLIENT_TEMP_ID_PREFIX}${kind}`, ...parts.map(String)].join("-");
}

/** True for an id minted by {@link mintClientTempId}. */
export function isClientTempId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(CLIENT_TEMP_ID_PREFIX);
}

/**
 * The id to send to the database, or `null` when the record has no durable
 * row yet. Only a UUID-shaped id is durable; a client-temp id, an empty
 * string, or anything else malformed answers `null`.
 */
export function durableRecordId(id: string | null | undefined): string | null {
  return typeof id === "string" && isUuidShape(id) ? id : null;
}
