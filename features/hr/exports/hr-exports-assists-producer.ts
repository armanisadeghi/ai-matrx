/**
 * features/hr/exports/hr-exports-assists-producer.ts — the surface constant, and nothing else.
 *
 * WHY THIS FILE HAS NO PRODUCER IN IT, ON PURPOSE
 * -----------------------------------------------
 * The CRM producer this mirrors (`features/crm/crm-assists-producer.ts`) exports its surface
 * constant AND emits chips, because CRM has a deterministic duplicate scan to emit them from.
 * **L13 declares no Mandate and produces no chips this pass.** SPEC-AI's chip roster is exhaustive
 * over the 23 surface keys, and `matrx-user/hr-time-periods` is L12's to produce for, not this
 * lane's — the export lane owns the surface's data, not its assists.
 *
 * So the constant lives here, beside the code that mounts `<AssistStrip>`, exactly as every other
 * feature spells it, and the strip renders whatever L12 (or aidream) addresses to this surface. An
 * empty strip renders nothing at all, so mounting it early costs the user nothing and means the
 * day chips exist for this surface they simply appear.
 *
 * 🚨 DO NOT INVENT AN AI INTEGRATION TO SATISFY DISCLOSURE. A surface with no fixed AI worker
 * declares no `agentRole` and adds no visible agent content — the disclosure law forbids adding
 * chips, badges, cards or callouts to a surface to make it look AI-enabled.
 */

/** `/hr/time/periods` and `/hr/time/periods/[periodId]` — SPEC-UI-IA rows 32 and 33. */
export const HR_TIME_PERIODS_ASSIST_SURFACE = "matrx-user/hr-time-periods";
