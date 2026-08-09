/**
 * Surface manifest — Create CRM Record window
 * (`matrx-user/crm-create-party`).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { PARTY_KINDS } from "@/features/crm/types";

export const CRM_CREATE_PARTY_SURFACE_NAME = "matrx-user/crm-create-party";

const groups: SurfaceValueGroup[] = [
  {
    key: "workspace",
    label: "Workspace",
    sortOrder: 100,
    description: "Where the new CRM record will be created.",
  },
  {
    key: "record_identity",
    label: "Record identity",
    sortOrder: 200,
    description: "The person or company identity currently drafted.",
  },
  {
    key: "contact_methods",
    label: "Contact methods",
    sortOrder: 300,
    description:
      "Optional contact values linked through the canonical medium model.",
  },
  {
    key: "form_state",
    label: "Form state",
    sortOrder: 400,
    description: "Composite draft and validation state for the capture form.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "organization_id",
    label: "Organization ID",
    description:
      "UUID of the user's workspace organization that will own the new CRM record. Empty while organization context is still resolving.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "workspace",
    sortOrder: 100,
  },
  {
    name: "party_kind",
    label: "Record kind",
    description:
      "Kind currently selected in the form: person or organization. Always populated.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    group: "record_identity",
    sortOrder: 200,
  },
  {
    name: "display_name",
    label: "Display name",
    description:
      "Computed display name that will be saved. Empty until the user enters a person or company name.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "record_identity",
    sortOrder: 210,
  },
  {
    name: "first_name",
    label: "First name",
    description:
      "Draft first name for a person. Empty for companies or before entry.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 30,
    group: "record_identity",
    sortOrder: 220,
  },
  {
    name: "last_name",
    label: "Last name",
    description:
      "Draft last name for a person. Empty for companies or before entry.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "record_identity",
    sortOrder: 230,
  },
  {
    name: "company_name",
    label: "Company name",
    description:
      "Draft company name for an organization record. Empty for people or before entry.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "record_identity",
    sortOrder: 240,
  },
  {
    name: "job_title",
    label: "Job title",
    description:
      "Optional draft job title for a person. Empty for companies or when unset.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    group: "record_identity",
    sortOrder: 250,
  },
  {
    name: "primary_domain",
    label: "Domain",
    description:
      "Optional primary web domain for a company. Empty for people or when unset.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "record_identity",
    sortOrder: 260,
  },
  {
    name: "email",
    label: "Email",
    description:
      "Optional email draft. It becomes a shared crm.contact_medium linked to the party, never a party column.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "contact_methods",
    sortOrder: 300,
  },
  {
    name: "phone",
    label: "Phone",
    description:
      "Optional phone draft. It becomes a normalized shared crm.contact_medium linked to the party, never a party column.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    group: "contact_methods",
    sortOrder: 310,
  },
  {
    name: "party_draft",
    label: "CRM record draft",
    description:
      "Composite of every live field in the create form. Always populated, including empty strings.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 700,
    group: "form_state",
    sortOrder: 400,
  },
  {
    name: "form_valid",
    label: "Form is valid",
    description:
      "True when an organization is resolved and the selected kind has a display name. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "form_state",
    sortOrder: 410,
  },
  {
    name: "is_saving",
    label: "Record is saving",
    description:
      "True while the create operation and optional contact-point links are being written. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "form_state",
    sortOrder: 420,
  },
];

/**
 * The write half of this surface (handlers in
 * `features/crm/components/PartyCreateForm.tsx`).
 *
 * ONE composite target, deliberately — not one per input. Every field here is
 * filled in during a single act of drafting (from an email signature, a chat
 * mention, a scraped page) and consumed by ONE save, so they are edited
 * together, which is exactly the case the skill reserves for an object target.
 * Splitting them would also make the form's cross-field rule unenforceable:
 * `party_kind` decides which inputs are even RENDERED, so a lone
 * `company_name` write against a person draft would land in state the user
 * cannot see. One target validates the whole shape at once, asks once, and
 * lands a coherent draft.
 *
 * Creating the record is NOT a target. Save is where deduplication, medium
 * linking, and ownership happen — the human presses Create record.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "party_draft",
    label: "CRM record draft",
    description: [
      "Stages a drafted person or company into the open create form — the same fields the user would type, staged the same way.",
      `Object with any of: party_kind (${PARTY_KINDS.join(" | ")}), first_name, last_name, job_title (person drafts only), company_name, primary_domain (company drafts only), email, phone — all strings.`,
      "Only the keys you send are changed; omit a key to leave the user's value alone, or pass an empty string to clear that one field. display_name is computed from the names and cannot be set.",
      "The fields must match the kind being drafted: a person takes first_name/last_name/job_title, a company takes company_name/primary_domain. This form has no field for a person's employer — capture that as job_title and create the company as its own record.",
      "email must be a real address and phone must be dialable (international form, e.g. +13105551234, is safest); a value that fails is rejected rather than corrected.",
      "Everything is staged only. Nothing is saved, deduplicated against existing parties, or linked to a contact medium until the user presses Create record.",
    ].join(" "),
    valueType: "object",
    updatesValue: "party_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "form_state",
    sortOrder: 400,
  },
];

export const crmCreatePartyManifest: SurfaceManifest = {
  surfaceName: CRM_CREATE_PARTY_SURFACE_NAME,
  readiness: "verified",
  overlayId: "crmCreatePartyWindow",
  label: "Create CRM Record",
  intro: `<surface_intro>
You are in the Create CRM Record window. The user is drafting either a person or a company inside one of their organization workspaces. Identity fields describe the live draft; contact methods are optional values that will be normalized into the shared CRM medium/contact-point model. Form state contains the complete draft and whether it is ready to save.
</surface_intro>`,
  groups,
  values,
  writeTargets,
  skipBaselineValues: true,
};

export interface CrmPartyDraftScope {
  party_kind: "person" | "organization";
  display_name: string;
  first_name: string;
  last_name: string;
  company_name: string;
  job_title: string;
  primary_domain: string;
  email: string;
  phone: string;
}

export function createCrmCreatePartyScope(values: {
  organization_id?: string;
  party_kind: "person" | "organization";
  display_name: string;
  first_name: string;
  last_name: string;
  company_name: string;
  job_title: string;
  primary_domain: string;
  email: string;
  phone: string;
  party_draft: CrmPartyDraftScope;
  form_valid: boolean;
  is_saving: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
