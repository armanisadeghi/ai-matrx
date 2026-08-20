/**
 * CRM constants shared across the feature.
 *
 * The Mandate is the ONLY way this client creates a CRM record from a
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
 * That last sentence was aspirational until 2026-08-19: `service.ts` shipped a
 * `createParty` doing exactly the forbidden insert, and three surfaces used it.
 * The client now has ONE non-agent create path — `resolveParty` in `service.ts`,
 * onto aidream `/crm/parties/resolve`, which runs the SAME resolver this Mandate
 * reaches through `resolve_contact`. Two doors, one resolver, zero raw inserts.
 * See RULE 3 in `features/crm/FEATURE.md`.
 *
 * Declared server-side in aidream `services/mandates/client_mandates.py`.
 */
export const CRM_SAVE_CONTACT_AGENT_MANDATE = "crm.save_contact";
