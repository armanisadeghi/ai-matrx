/**
 * The crisis intake's pure half: the choices, the brand prefill and what is
 * still missing. The server owns every judgment (the gate, the counts, the
 * decay — aidream `services/media_desk`); this only shapes what the person types.
 */

import type { BusinessFact } from "@/features/marketing/types";
import {
  factText,
  isSpokesperson,
} from "@/features/marketing/monitor-setup/data";

import type { CrisisIntake } from "@/features/marketing/pr/media-desk/api";

export const INCIDENT_TYPES = [
  ["data_security", "Data security"],
  ["product_safety", "Product safety"],
  ["personnel_misconduct", "Personnel misconduct"],
  ["financial_irregularity", "Financial irregularity"],
  ["regulatory", "Regulatory"],
  ["outage", "Outage"],
  ["viral_social", "Viral social event"],
  ["executive_backlash", "Executive statement backlash"],
  ["third_party", "Third-party action"],
  ["landmine_newsjack", "A post that landed badly (landmine newsjack)"],
  ["other", "Other"],
] as const;

export const LEGAL_STATUSES = [
  ["no_counsel", "No counsel yet"],
  ["counsel_engaged", "Counsel engaged and reviewing"],
  ["counsel_approved", "Counsel approved the draft path"],
] as const;

export const MEDIA_TIMINGS = [
  ["none_yet", "No press contact yet"],
  ["within_24h", "Expect press within 24 hours"],
  ["within_4h", "Expect press within 4 hours"],
  ["within_1h", "Press inbound within the hour"],
  ["already_published", "Already published"],
] as const;

export const AUDIENCES = [
  "customers",
  "press",
  "employees",
  "investors",
  "regulators",
  "partners",
  "public social",
] as const;

export interface BrandPrefill {
  org_name: string;
  spokesperson: string;
  press_contact: string;
}

function factValue(fact: BusinessFact): string {
  const value = (fact.value ?? {}) as Record<string, unknown>;
  return String(value.text ?? value.url ?? value.name ?? "").trim();
}

/** Org name exactly as the brand holds it (legal name first), the spokesperson, the press contact. */
export function brandPrefill(
  brandName: string | null | undefined,
  facts: readonly BusinessFact[] | null | undefined,
): BrandPrefill {
  const live = (facts ?? []).filter((f) => !f.deleted_at);
  const legal = live.find((f) => f.kind === "legal_name");
  const spokes = live.find(isSpokesperson);
  const email = live.find((f) => f.kind === "email");
  const phone = live.find((f) => f.kind === "phone");
  return {
    org_name: (legal ? factValue(legal) : "") || (brandName ?? "").trim(),
    spokesperson: spokes ? factText(spokes) : "",
    press_contact: [email ? factValue(email) : "", phone ? factValue(phone) : ""].filter(Boolean).join(" · "),
  };
}

export interface IntakeForm extends Omit<CrisisIntake, "people_involved" | "audiences"> {
  audiences: string[];
  people_involved: Array<{ name: string; role: string; consented: boolean }>;
}

/** `datetime-local` wants local wall time without a zone. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function emptyIntake(prefill: BrandPrefill, now: Date): IntakeForm {
  return {
    incident_summary: "",
    incident_type: "data_security",
    first_known_at: toLocalInput(now),
    org_name: prefill.org_name,
    person_role: "",
    audiences: ["customers", "press"],
    known_facts: "",
    unknowns: "",
    actions_taken: "",
    actions_committed: "",
    people_involved: [],
    legal_status: "no_counsel",
    regulatory_exposure: "",
    media_timing: "none_yet",
    prior_statement: "",
    tone_constraints: "",
    spokesperson: prefill.spokesperson,
    press_contact: prefill.press_contact,
    prior_draft: "",
  };
}

const REQUIRED: Array<[keyof IntakeForm, string]> = [
  ["incident_summary", "what happened"],
  ["org_name", "the organization's name"],
  ["person_role", "your role"],
  ["known_facts", "what is confirmed"],
  ["unknowns", "what is not yet known"],
  ["actions_taken", "what has been done"],
];

/** The plain-English names of what is still empty. The Draft button says them. */
export function missingIntake(form: IntakeForm): string[] {
  const out = REQUIRED.filter(([key]) => !String(form[key] ?? "").trim()).map(([, label]) => label);
  if (form.audiences.length === 0) out.push("who needs to hear it");
  return out;
}

/** The wire shape: local time → ISO with offset, blanks dropped, people without a name dropped. */
export function toWire(form: IntakeForm): CrisisIntake {
  const known = new Date(form.first_known_at);
  const opt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    incident_summary: form.incident_summary.trim(),
    incident_type: form.incident_type,
    first_known_at: Number.isNaN(known.getTime()) ? new Date().toISOString() : known.toISOString(),
    org_name: form.org_name.trim(),
    person_role: form.person_role.trim(),
    audiences: form.audiences,
    known_facts: form.known_facts.trim(),
    unknowns: form.unknowns.trim(),
    actions_taken: form.actions_taken.trim(),
    actions_committed: opt(form.actions_committed),
    people_involved: form.people_involved
      .filter((p) => p.name.trim())
      .map((p) => ({ name: p.name.trim(), role: p.role.trim() || null, consented: p.consented })),
    legal_status: form.legal_status,
    regulatory_exposure: opt(form.regulatory_exposure),
    media_timing: form.media_timing,
    prior_statement: opt(form.prior_statement),
    tone_constraints: opt(form.tone_constraints),
    spokesperson: opt(form.spokesperson),
    press_contact: opt(form.press_contact),
    prior_draft: opt(form.prior_draft),
  };
}

/** "valid for 3h 58m" / "expired 12m ago — do not reuse this draft". */
export function validity(validUntilIso: string, nowMs: number): { expired: boolean; text: string } {
  const diff = new Date(validUntilIso).getTime() - nowMs;
  const mins = Math.round(Math.abs(diff) / 60000);
  const span = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  return diff > 0
    ? { expired: false, text: `valid for ${span} more` }
    : { expired: true, text: `expired ${span} ago. The situation has likely moved. Do not reuse this draft.` };
}
