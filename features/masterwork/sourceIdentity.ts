// features/masterwork/sourceIdentity.ts
//
// WHICH SOURCE is this, whichever door named it.
//
// ## The screen this closes (cold walk 13, N4 — 2026-09-20)
//
// A first-time Expert did one interview, attached five files, ran "Turn this
// into rules" and ran Shadow-the-inbox. Her Rulebook home then read:
//
//     Interviews  1   Pressure-First Irrigation Triage · 505 words · 11 rules
//     Resources  12   7 sources are already here — besides the 5 attached below
//
// and four of the "7 already here" were four of the five files listed directly
// underneath. Two captures and five files had become twelve.
//
// The arithmetic was `attached + kept`, two counts from two stores added
// without ever asking whether they were counting the same things. They were:
// live rows for that Rulebook (2fba365b-…) are five `file:<id>` kept sources —
// the SAME five uploads that carry `distillation_source` edges — plus the
// interview and the email thread. Seven distinct sources; five counted twice.
//
// The interview was the other half: it is one `masterwork_source` row
// (`interview:<conversation_id>`, 1,056 words — the whole sitting, both
// speakers) AND one `chat.conversation` under Interviews (505 words — her own
// turns). The same capture, under two headings, with two different numbers.
//
// 🚨 THE IDENTITIES HERE MIRROR `aidream/services/distillation/source_identity.py`
// EXACTLY, because that module is where the platform already decided what one
// source IS — it is the module that stops a file dumped as an entity and the
// same file uploaded directly from becoming two sources. A second, cosmetic
// identity invented on this side would be the same defect one layer up.
//
//     file      -> `file:<file_id>`        (entity_source_key collapses "file")
//     entity    -> `entity:<token>:<id>`
//     url       -> `url:<url>`             (scheme+host lowered, one trailing /)

/** `aidream` `url_source_key`: only the two differences that never mean anything. */
export function urlIdentity(url: string): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  let normalized = raw;
  const scheme = normalized.indexOf("://");
  if (scheme > -1) {
    const head = normalized.slice(0, scheme).toLowerCase();
    const rest = normalized.slice(scheme + 3);
    const slash = rest.indexOf("/");
    normalized =
      slash > -1
        ? `${head}://${rest.slice(0, slash).toLowerCase()}${rest.slice(slash)}`
        : `${head}://${rest.toLowerCase()}`;
  }
  if (normalized.endsWith("/") && (normalized.match(/\//g)?.length ?? 0) > 2) {
    normalized = normalized.slice(0, -1);
  }
  return `url:${normalized}`;
}

/**
 * `aidream` `entity_source_key`: an uploaded file is the SAME source whether it
 * arrives as an entity reference or as the file lane's own file id.
 */
export function entityIdentity(token: string, id: string): string {
  const name = String(token ?? "").trim().toLowerCase();
  const resourceId = String(id ?? "").trim();
  if (name === "file") return `file:${resourceId}`;
  return `entity:${name}:${resourceId}`;
}

/**
 * `aidream` `interview_source_key`: an interview is identified by the
 * conversation it happened in, NEVER as `entity:conversation:<id>`.
 *
 * It matters because the same sitting is reachable two ways — the
 * `conversation --(role 'interview')--> rulebook` edge written the moment the
 * interview starts, and the `platform.masterwork_source` row written when its
 * turns are kept. Keyed differently, one interview would count as two.
 */
export function interviewIdentity(conversationId: string): string {
  return `interview:${String(conversationId ?? "").trim()}`;
}

/** A kept row already carries its identity — it IS `source_key`. */
export function keptIdentity(row: { source_key: string }): string {
  return String(row.source_key ?? "").trim();
}

/**
 * Is this kept row the raw material of an INTERVIEW?
 *
 * An interview is listed, named and counted by the Interviews block from
 * `chat.conversation`. Its kept row is the same capture's other half, and
 * showing it again under Resources is what printed one sitting twice with two
 * word counts. The Approach that captured it is the authority, never the shape
 * of the key.
 */
export function isInterviewMaterial(row: { approach_key?: string | null }): boolean {
  return String(row.approach_key ?? "").trim().toLowerCase() === "interview";
}
