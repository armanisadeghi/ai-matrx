// features/bindings/system-rung.ts
//
// THE SYSTEM RUNG'S OWN RULES, in one place, as pure functions.
//
// Arman, 2026-09-08: *"this is the Admin panel so it should never show ANYTHING
// related to a user or an org. Just like the system agents management, the ONLY
// thing it should ever show is the things we assign from the system."* The
// admin route stands on ONE rung — the system rung — so the words that describe
// it and the refusal that protects it are shared by every component that draws
// it, rather than being re-said (and drifting) in each.
//
// The holder rule is Arman's from 2026-08-31, restated as a HARD refusal rather
// than a warning: *"why would anything allow me to connect anything other than
// system agents?"* Before this the picker was restricted and the save was not —
// an agent arriving from an older draft, from the API, or from the guard dialog
// could still be written as the answer every user on the platform gets.

/**
 * The bar's own statement of the rung, where a rung SELECTOR must not exist.
 *
 * 🔶 A DECLARED DEVIATION FROM THE BRIEF'S WORDING, and why. FIX-R4 was written
 * to say "System — decides for every user"; FIX-R3 landed the mandate's OWN
 * default holder as a fourth rung in the same files, correctly labelled "System
 * default". Two rungs called "System" on one screen is the very confusion this
 * lane exists to remove, so the word survives and the noun is made specific:
 * "decides for every user" is verbatim, and nothing can now be mistaken for the
 * job's own default. Recorded on the register as FIX-R4's deviation.
 */
export const SYSTEM_RUNG_TITLE =
  "System-wide binding — decides for every user";

/** What the system rung covers, said once. */
export const SYSTEM_RUNG_COVERS =
  "Everybody on the platform runs this, unless their organization or they themselves override it. Unlike the job's own default, it can also carry the mapping, the settings and the auto-run promise.";

/** Why only a system agent may hold it — printed beside the picker. */
export const SYSTEM_RUNG_HOLDER_RULE =
  "The system rung runs for every user on the platform, so only system agents can be bound here.";

/**
 * The refusal, with the remedy in the same sentence. Shown next to Save, which
 * is disabled while it stands — never a toast after the click.
 */
export const SYSTEM_RUNG_PERSONAL_HOLDER_REFUSAL =
  "This is a personal agent, and the system answer runs for every user on the platform. Duplicate it into a system agent in the system-agents admin, then bind the copy.";

/**
 * Is the drafted holder a personal agent standing at the system rung?
 *
 * 🚨 SILENT UNTIL THE CATALOGUE IS READ. `builtinAgentIds` empty means "the
 * system catalogue has not loaded", never "this agent is not a system agent" —
 * a refusal printed against an unread list is a lie, and it would refuse every
 * legitimate save for as long as the fetch takes.
 */
export function systemRungHolderIsPersonal(
  agentId: string | null,
  builtinAgentIds: readonly string[],
): boolean {
  if (!agentId) return false;
  if (builtinAgentIds.length === 0) return false;
  return !builtinAgentIds.includes(agentId);
}
