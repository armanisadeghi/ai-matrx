/**
 * Surface manifest — HR Employer (`matrx-user/hr-employer`), route 68
 * `/hr/settings/employer`.
 *
 * One employer's profile of record: legal identity and address, the employment laws
 * that apply to it (each with how that was established), the establishments it
 * reports on, and the (not yet readable) tax registrations. Its own surface rather
 * than a shared "HR settings" one: every `/hr/settings/*` tab holds a different record
 * type with different rules, and no HR surface existed to hang it under (2026-09-27).
 *
 * Emitter: `SurfaceRuntimeProvider` in `HrEmployerPanel` (scope built by the pure
 * `buildHrEmployerScope` in `features/hr/settings/employer/employer-profile-model.ts`).
 *
 * Write targets:
 *   - `employer_identity_draft` fills the Identity form; nothing saves until the
 *     person presses Save changes.
 *   - `applicability_declarations` records declarations; saved on approval, through
 *     the same `hr_employer_profile_update` door the page's Declare button uses.
 * NOT writable, on purpose: the EIN (a tax identifier — the person types it), the
 * counted headcount and the derived flags (evidence), and establishments — this page
 * lists them but has no create/edit of its own yet (listed in the readiness note).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const HR_EMPLOYER_SURFACE_NAME = "matrx-user/hr-employer";

const groups: SurfaceValueGroup[] = [
  {
    key: "employer",
    label: "Employer",
    sortOrder: 100,
    description: "The employer of record as saved, and the Identity form as edited.",
  },
  {
    key: "applicability",
    label: "Which laws apply",
    sortOrder: 200,
    description: "FMLA, ACA, EEO-1, federal contractor and E-Verify, each with its basis.",
  },
  {
    key: "establishments",
    label: "Establishments",
    sortOrder: 300,
    description: "The sites this employer reports on, and the tax registration status.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "employer_load_status",
    label: "Load status",
    description:
      '"loading" while the profile loads, "loaded" when it is on screen, "failed" when the read failed (the page shows the error and a retry), "no_profile" when HR is set up but no profile row came back.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 10,
    group: "employer",
  },
  {
    name: "employer_organization",
    label: "Organization",
    description: "The organization this employer profile belongs to: { id, name }.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 20,
    group: "employer",
  },
  {
    name: "employer_overview",
    label: "Employer overview",
    description:
      "Everything on the page in one XML bundle: identity (legal name, DBA, entity form, formation state; the EIN only as \"on file\"), the primary address, every applicability flag with its value and basis or declaration reason, the establishments (first 25) and the tax registration status.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1800,
    inlineUpTo: 4000,
    sortOrder: 30,
    group: "employer",
  },
  {
    name: "employer_identity",
    label: "Saved identity",
    description:
      "The identity as saved: { legal_name, dba_name, entity_form (llc | c_corp | s_corp | partnership | sole_proprietorship | nonprofit | government, or \"\"), formation_state (two letters), primary_address { line1, line2, city, region, postal_code, country }, ein_on_file (a sentence — the EIN itself is never sent to a browser), version, updated_at }.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 450,
    sortOrder: 40,
    group: "employer",
  },
  {
    name: "employer_identity_draft",
    label: "Identity form as edited",
    description:
      "The Identity form as it stands on screen, including edits not saved yet — same fields as employer_identity without the EIN.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 50,
    group: "employer",
  },
  {
    name: "has_unsaved_identity_changes",
    label: "Unsaved changes",
    description: "True when the Identity form differs from what is saved.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 60,
    group: "employer",
  },
  {
    name: "identity_problems",
    label: "What stops Save",
    description:
      "Every reason the Identity form cannot be saved yet, in the words the page shows. Empty when it can be saved.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 70,
    group: "employer",
  },
  {
    name: "applicability_flags",
    label: "Applicability flags",
    description:
      "One row per law: { key (is_fmla_covered | is_aca_ale | is_eeo1_filer | is_federal_contractor | everify_required_states), label, test (what the law asks), value (true/false/null, or a list of states for E-Verify — null means nobody has counted or declared it, which is NOT \"no\"), declared, declared_reason, declared_at, derivation }.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 100,
    group: "applicability",
  },
  {
    name: "establishments",
    label: "Establishments",
    description:
      "The physical sites this employer reports on for EEO-1 and OSHA, as loaded (the table's own search does not narrow this list): { id, name, is_headquarters, naics_code, eeo1_establishment_id, osha_establishment_name, annual_average_employees }.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 200,
    group: "establishments",
  },
  {
    name: "establishment_count",
    label: "Establishment count",
    description: "How many establishments this employer has.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 210,
    group: "establishments",
  },
  {
    name: "tax_registrations_status",
    label: "Tax registrations",
    description:
      "Why no tax registrations are listed: they cannot be read from a browser yet. Never read this as \"the employer has none\".",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 110,
    sortOrder: 220,
    group: "establishments",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "employer_identity_draft",
    label: "Fill the Identity form",
    description:
      'Fill the Identity form for the person to review. NOTHING is saved — the person presses Save changes. Value is a JSON object with any of: { "legal_name": string, "dba_name": string | null, "entity_form": "llc" | "c_corp" | "s_corp" | "partnership" | "sole_proprietorship" | "nonprofit" | "government" | null, "formation_state": two-letter state like "DE" | null, "primary_address": { "line1"?, "line2"?, "city"?, "region" (two-letter state)?, "postal_code"?, "country" (two-letter, default "US")? } | null }. Only the keys you send change; within primary_address only the parts you send change. Refused (nothing changes): an "ein" key (the person types the EIN), an unknown field, a blank legal name, a state or country that is not two letters.',
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    updatesValue: "employer_identity_draft",
    group: "employer",
    sortOrder: 100,
  },
  {
    name: "applicability_declarations",
    label: "Declare which laws apply",
    description:
      'Record that a law does or does not apply to this employer, overriding what was counted. SAVED immediately after the person approves, with the reason on the audit record. Value is a JSON ARRAY of 1-4 objects: [{ "flag": "is_fmla_covered" | "is_aca_ale" | "is_eeo1_filer" | "is_federal_contractor", "applies": true | false, "reason": "one sentence — who advised it or what fact it rests on" }]. Refused (nothing saved): a flag named twice, E-Verify states (not declared here), a missing or one-word reason.',
    valueType: "array",
    mode: "entity",
    applyPolicy: "ask",
    updatesValue: "applicability_flags",
    group: "applicability",
    sortOrder: 200,
  },
];

export const hrEmployerManifest: SurfaceManifest = {
  surfaceName: HR_EMPLOYER_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "HR employer of record: legal identity and address, which employment laws apply and why, establishments (/hr/settings/employer).",
  label: "HR Employer",
  urlPattern: "/hr/settings/employer",
  readiness: "partial",
  readinessNote:
    "Surface built 2026-09-27 (page-pass). Not proven yet: the live agent write test for both targets, and no outside-helper binding test. Establishments are listed but not agent-writable — the page has no create/edit for them yet (the hr_establishment_upsert door exists and nothing in the browser calls it). Tax registrations have no read door.",
  intro: `<surface_intro>
You are on the HR Employer page of one organization: the employer of record, the employment laws that apply to it, and the sites it reports on. employer_overview has all of it in one bundle.

- To fill in or correct the legal name, DBA, entity form, formation state or address, use employer_identity_draft. It fills the form; the person presses Save changes.
- To record that FMLA, ACA, EEO-1 or federal-contractor status does or does not apply, use applicability_declarations with a one-sentence reason each. It saves after approval.
- Never set the EIN: the person types it into the EIN box. The EIN is never shown to anyone in a browser.
- A flag whose value is null means nobody has counted or declared it — say that, never "no".
Do not change this employer through generic scope or context tools; they skip the audit record.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

/** Type-safe payload for the panel's provider. */
export function createHrEmployerScope(values: Record<string, unknown>): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
