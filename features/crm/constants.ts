/**
 * CRM constants shared across the feature.
 *
 * The agent slot is the ONLY way this client creates a CRM record from a
 * selection. It resolves (system default → the user's own binding) to an agent
 * carrying the `data_action` tool, which calls the governed `resolve_contact`
 * operation — the party resolver that canonicalizes, dedupes on
 * email/phone/domain/platform ids and follows merge lineage.
 *
 * There is deliberately NO client fallback. The raw `database` tool is blocked
 * from the `crm` schema server-side, and a direct `supabase.from("party")
 * .insert()` would skip the resolver and manufacture the duplicates the whole
 * dedup system exists to clean up. If the slot cannot resolve, the affordance
 * does not render — never a hardcoded agent id, never a raw insert.
 *
 * Declared server-side in aidream `services/agent_slots/client_slots.py`.
 */
export const CRM_SAVE_CONTACT_AGENT_SLOT = "crm.save_contact";
