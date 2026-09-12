/**
 * The recency contract for the four surface MIRROR tables — ONE definition,
 * shared by the server guard that enforces it and the client that explains it.
 *
 * These two facts were previously stated twice: the window as `24` in
 * `manifest-sync.service.ts` and again as the prose "last 24h" in the drift
 * dialog, and the refusal prefix as a string literal in
 * `manifest-sync.service.ts` and a hand-copied twin in `surfaces.service.ts`.
 * A number the UI retypes is a number the UI eventually gets wrong, so the
 * window lives here, in a module with no Supabase or manifest-registry imports,
 * and both halves import it.
 */

/**
 * A row updated this recently is treated as probably-in-flight rather than
 * probably-dead.
 *
 * THE DECISION, and the reasoning, because this was an open question:
 * a fresh `updated_at` is good evidence a row belongs to work still running —
 * it is exactly the signal that separates "an agent synced this twenty minutes
 * ago" from "this has been dead since a refactor last month" — but it is
 * EVIDENCE, not proof, and it points both ways. The admin most likely to have
 * a legitimate reason to delete a row minutes old is the person who just
 * created it by mistake. So a recent row is WARNED ON, not BLOCKED: the first
 * attempt is refused with the row's actual age in the message, and the caller
 * may repeat it with `acknowledgeRecent: true`. That keeps the accident
 * expensive and the deliberate act possible, which a hard block does not.
 * 24h is chosen to cover a working session, not tuned to anything.
 */
export const RECENT_ROW_WINDOW_HOURS = 24;

/**
 * Stable prefix on the recency refusal so a caller can distinguish "you need
 * to confirm this one" from a genuine failure without parsing prose.
 */
export const RECENT_ROW_REFUSAL_PREFIX = "Recently updated:";
