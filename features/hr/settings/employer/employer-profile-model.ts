// features/hr/settings/employer/employer-profile-model.ts
//
// The pure half of route 68 (`/hr/settings/employer`): the entity-form choices, the
// primary-address shape, the applicability flags with their derivation, the parsers an
// agent's write goes through before the approval card, and the surface scope the page
// publishes. No React, no fetch — every function here is unit-tested.
//
// ── THE WRITE DOOR ─────────────────────────────────────────────────────────
// Every save on this page goes through `hr_employer_profile_update(p_payload)`. Until
// 2026-09-27 the panel sent `hr_structure_upsert('employer_profile' | '…applicability')`,
// which refuses every kind but department/location/job_title — so Save and every
// Declare button raised 22023 and nothing had ever been saved (no employer profile
// carried an address, an entity form or a declaration).
//
// ── DECLARATIONS ───────────────────────────────────────────────────────────
// The door records `applicability_override` verbatim as `applicability_basis.declared`
// (plus the latest `declared_by` / `declared_at` / `reason` at the top level), and
// `jsonb ||` REPLACES `declared` on every call. So each save sends the WHOLE declared
// map — every earlier declaration carried forward — and each entry keeps its own reason
// and time: `{ is_fmla_covered: { applies, reason, declared_at } }`.

import type {
  HrApplicabilityFlag,
  HrEmployerProfileRead,
  HrEstablishment,
} from "../types";
import { xmlElement, xmlList, xmlText } from "@/features/surfaces/runtime/context-bundle";

// ── Entity form ─────────────────────────────────────────────────────────────

export const HR_ENTITY_FORMS = [
  { value: "llc", label: "LLC" },
  { value: "c_corp", label: "C corporation" },
  { value: "s_corp", label: "S corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "sole_proprietorship", label: "Sole proprietorship" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "government", label: "Government entity" },
] as const;

export type HrEntityForm = (typeof HR_ENTITY_FORMS)[number]["value"];

export function entityFormLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return HR_ENTITY_FORMS.find((form) => form.value === value)?.label ?? value;
}

// ── Primary address ─────────────────────────────────────────────────────────

/** The shape the activation wizard writes and this page edits. */
export type HrEmployerAddress = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
};

export const EMPTY_ADDRESS: HrEmployerAddress = {
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "US",
};

const ADDRESS_KEYS = ["line1", "line2", "city", "region", "postal_code", "country"] as const;

/** Whatever the column holds → the six editable fields. Unknown keys are dropped. */
export function readAddress(raw: unknown): HrEmployerAddress {
  const bag = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const text = (key: string) => (typeof bag[key] === "string" ? (bag[key] as string) : "");
  return {
    line1: text("line1"),
    line2: text("line2"),
    city: text("city"),
    region: text("region") || text("state"),
    postal_code: text("postal_code") || text("zip"),
    country: text("country") || "US",
  };
}

/** The six fields → what the column stores (blank → null). */
export function writeAddress(address: HrEmployerAddress): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of ADDRESS_KEYS) {
    const value = address[key].trim();
    out[key] = key === "region" || key === "country" ? value.toUpperCase() || null : value || null;
  }
  return out;
}

export function formatAddress(address: HrEmployerAddress): string {
  const cityLine = [address.city, [address.region, address.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [address.line1, address.line2, cityLine, address.country === "US" ? "" : address.country]
    .filter((part) => part.trim())
    .join(", ");
}

// ── The identity form ───────────────────────────────────────────────────────

export type HrEmployerIdentityForm = {
  legal_name: string;
  dba_name: string;
  entity_form: string;
  formation_state: string;
  primary_address: HrEmployerAddress;
};

export function identityFromProfile(profile: HrEmployerProfileRead): HrEmployerIdentityForm {
  return {
    legal_name: profile.legal_name,
    dba_name: profile.dba_name ?? "",
    entity_form: profile.entity_form ?? "",
    formation_state: profile.formation_state ?? "",
    primary_address: readAddress(profile.primary_address),
  };
}

export function identityEquals(a: HrEmployerIdentityForm, b: HrEmployerIdentityForm): boolean {
  return (
    a.legal_name.trim() === b.legal_name.trim() &&
    a.dba_name.trim() === b.dba_name.trim() &&
    a.entity_form === b.entity_form &&
    a.formation_state.trim().toUpperCase() === b.formation_state.trim().toUpperCase() &&
    ADDRESS_KEYS.every(
      (key) =>
        a.primary_address[key].trim().toUpperCase() ===
        b.primary_address[key].trim().toUpperCase(),
    )
  );
}

/** Every reason the form cannot be saved, in the words the page shows. */
export function identityProblems(form: HrEmployerIdentityForm): string[] {
  const problems: string[] = [];
  if (!form.legal_name.trim()) problems.push("The legal name cannot be blank.");
  const state = form.formation_state.trim();
  if (state && !/^[A-Za-z]{2}$/.test(state)) {
    problems.push("The formation state is two letters, like DE or CA.");
  }
  const region = form.primary_address.region.trim();
  if (region && !/^[A-Za-z]{2}$/.test(region)) {
    problems.push("The address state is two letters, like CA or TX.");
  }
  const country = form.primary_address.country.trim();
  if (country && !/^[A-Za-z]{2}$/.test(country)) {
    problems.push("The country is a two-letter code, like US.");
  }
  if (
    form.entity_form &&
    !HR_ENTITY_FORMS.some((option) => option.value === form.entity_form)
  ) {
    problems.push(
      `The entity form must be one of: ${HR_ENTITY_FORMS.map((f) => f.value).join(", ")}.`,
    );
  }
  return problems;
}

/** The form → the door's payload fields (the caller adds `organization_id` and `ein`). */
export function identityPayload(form: HrEmployerIdentityForm): Record<string, unknown> {
  return {
    legal_name: form.legal_name.trim(),
    dba_name: form.dba_name.trim() || null,
    entity_form: form.entity_form || null,
    formation_state: form.formation_state.trim().toUpperCase() || null,
    primary_address: writeAddress(form.primary_address),
  };
}

/**
 * An agent's `employer_identity_draft` value → the next form, merged onto the current
 * one. Only the keys sent change. Throws ONE sentence naming every problem, so the
 * agent can fix them all in one retry.
 */
export function mergeIdentityDraft(
  current: HrEmployerIdentityForm,
  value: unknown,
): HrEmployerIdentityForm {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "Send an object: { legal_name?, dba_name?, entity_form?, formation_state?, primary_address? }.",
    );
  }
  const bag = value as Record<string, unknown>;
  const problems: string[] = [];
  const known = new Set([
    "legal_name",
    "dba_name",
    "entity_form",
    "formation_state",
    "primary_address",
  ]);
  for (const key of Object.keys(bag)) {
    if (key === "ein") {
      problems.push(
        "The EIN cannot be set by an agent — the person types it into the EIN box themselves.",
      );
    } else if (!known.has(key)) {
      problems.push(`"${key}" is not a field on this form.`);
    }
  }

  const next: HrEmployerIdentityForm = {
    ...current,
    primary_address: { ...current.primary_address },
  };
  const textField = (key: "legal_name" | "dba_name" | "formation_state") => {
    if (!(key in bag)) return;
    const raw = bag[key];
    if (raw === null) next[key] = "";
    else if (typeof raw === "string") next[key] = raw;
    else problems.push(`${key} must be a string or null.`);
  };
  textField("legal_name");
  textField("dba_name");
  textField("formation_state");

  if ("entity_form" in bag) {
    const raw = bag.entity_form;
    if (raw === null || raw === "") next.entity_form = "";
    else if (typeof raw === "string") next.entity_form = raw.trim().toLowerCase();
    else problems.push("entity_form must be a string or null.");
  }

  if ("primary_address" in bag) {
    const raw = bag.primary_address;
    if (raw === null) {
      next.primary_address = { ...EMPTY_ADDRESS };
    } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [key, part] of Object.entries(raw as Record<string, unknown>)) {
        if (!(ADDRESS_KEYS as readonly string[]).includes(key)) {
          problems.push(
            `primary_address.${key} is not an address field (use ${ADDRESS_KEYS.join(", ")}).`,
          );
        } else if (part === null) {
          next.primary_address[key as keyof HrEmployerAddress] = "";
        } else if (typeof part === "string") {
          next.primary_address[key as keyof HrEmployerAddress] = part;
        } else {
          problems.push(`primary_address.${key} must be a string or null.`);
        }
      }
    } else {
      problems.push("primary_address must be an object or null.");
    }
  }

  problems.push(...identityProblems(next));
  if (problems.length > 0) {
    throw new Error(`${problems.join(" ")} Nothing was changed.`);
  }
  return next;
}

// ── Applicability ───────────────────────────────────────────────────────────

export type HrApplicabilityKey = HrApplicabilityFlag["key"];
export type HrDeclarableKey = Exclude<HrApplicabilityKey, "everify_required_states">;

export const HR_DECLARABLE_FLAGS: readonly HrDeclarableKey[] = [
  "is_fmla_covered",
  "is_aca_ale",
  "is_eeo1_filer",
  "is_federal_contractor",
];

/** One stored declaration, as this page writes it into `applicability_basis.declared`. */
export type HrApplicabilityDeclaration = {
  applies: boolean;
  reason: string;
  declared_at: string;
};

/** The declared map as stored — only well-formed entries survive the read. */
export function readDeclarations(
  basis: Record<string, unknown> | null | undefined,
): Partial<Record<HrDeclarableKey, HrApplicabilityDeclaration>> {
  const declared = basis?.declared;
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) return {};
  const out: Partial<Record<HrDeclarableKey, HrApplicabilityDeclaration>> = {};
  for (const key of HR_DECLARABLE_FLAGS) {
    const entry = (declared as Record<string, unknown>)[key];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const e = entry as Record<string, unknown>;
      if (typeof e.applies === "boolean") {
        out[key] = {
          applies: e.applies,
          reason: typeof e.reason === "string" ? e.reason : "",
          declared_at: typeof e.declared_at === "string" ? e.declared_at : "",
        };
      }
    } else if (typeof entry === "boolean") {
      // A bare boolean (an override written by another client) still counts as declared.
      out[key] = { applies: entry, reason: "", declared_at: "" };
    }
  }
  return out;
}

const FLAG_COPY: Record<HrApplicabilityKey, { label: string; test: string }> = {
  is_fmla_covered: {
    label: "FMLA covered employer",
    test: "50 or more employees for 20 or more workweeks this year or last.",
  },
  is_aca_ale: {
    label: "ACA applicable large employer",
    test: "50 or more full-time-equivalent employees last year.",
  },
  is_eeo1_filer: {
    label: "EEO-1 filer",
    test: "100 or more employees, or a federal contractor with 50 or more.",
  },
  is_federal_contractor: {
    label: "Federal contractor",
    test: "Holds a covered federal contract or subcontract. Declared, never counted.",
  },
  everify_required_states: {
    label: "E-Verify required",
    test: "States that require E-Verify enrollment for this employer.",
  },
};

export function flagLabel(key: HrApplicabilityKey): string {
  return FLAG_COPY[key].label;
}

/**
 * Each flag with its derivation. A flag nobody counted or declared says so — never a
 * confident "No": "we counted and you are under 50" and "nobody has counted" carry
 * different obligations.
 */
export function applicabilityFlags(profile: HrEmployerProfileRead): HrApplicabilityFlag[] {
  const basis = (profile.applicability_basis ?? {}) as Record<string, unknown>;
  const declarations = readDeclarations(basis);
  const headcountLine =
    profile.headcount_total !== null && profile.headcount_asof_date
      ? `Counted: ${profile.headcount_total} employees as of ${profile.headcount_asof_date}.`
      : null;

  const derivedFor = (key: HrApplicabilityKey, fallback: string | null) => {
    const entry = basis[key];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const e = entry as { as_of?: unknown; count?: unknown };
      if (typeof e.as_of === "string" && typeof e.count === "number") {
        return `Counted: ${e.count} employees as of ${e.as_of}.`;
      }
    }
    return fallback;
  };

  const build = (
    key: HrApplicabilityKey,
    value: boolean | string[] | null,
    derived: string | null,
  ): HrApplicabilityFlag => {
    const declaration =
      key === "everify_required_states" ? undefined : declarations[key as HrDeclarableKey];
    return {
      key,
      label: FLAG_COPY[key].label,
      test: FLAG_COPY[key].test,
      value,
      derivation: derivedFor(key, derived),
      isDeclared: Boolean(declaration),
      declaredBy: null,
      declaredReason: declaration?.reason || null,
      declaredAt: declaration?.declared_at || null,
    };
  };

  return [
    build("is_fmla_covered", profile.is_fmla_covered, headcountLine),
    build("is_aca_ale", profile.is_aca_ale, headcountLine),
    build("is_eeo1_filer", profile.is_eeo1_filer, headcountLine),
    build("is_federal_contractor", profile.is_federal_contractor, null),
    build("everify_required_states", profile.everify_required_states ?? [], null),
  ];
}

export function flagValueText(value: HrApplicabilityFlag["value"]): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not established";
}

export type HrDeclarationRequest = {
  flag: HrDeclarableKey;
  applies: boolean;
  reason: string;
};

/**
 * An agent's `applicability_declarations` value (or the page's own Declare click) →
 * checked requests. Reports EVERY problem at once and ends "Nothing was changed."
 */
export function parseDeclarations(value: unknown): HrDeclarationRequest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      'Send a JSON array of 1-4 objects: [{ "flag": "is_fmla_covered", "applies": true, "reason": "…" }]. Nothing was changed.',
    );
  }
  const problems: string[] = [];
  const seen = new Set<string>();
  const out: HrDeclarationRequest[] = [];
  value.forEach((item, index) => {
    const at = `Item ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      problems.push(`${at} is not an object.`);
      return;
    }
    const bag = item as Record<string, unknown>;
    const flag = bag.flag;
    if (typeof flag !== "string" || !(HR_DECLARABLE_FLAGS as readonly string[]).includes(flag)) {
      problems.push(
        `${at}: flag must be one of ${HR_DECLARABLE_FLAGS.join(", ")} (E-Verify states are not declared here).`,
      );
    } else if (seen.has(flag)) {
      problems.push(`${at}: ${flag} appears twice.`);
    } else {
      seen.add(flag);
    }
    if (typeof bag.applies !== "boolean") problems.push(`${at}: applies must be true or false.`);
    const reason = typeof bag.reason === "string" ? bag.reason.trim() : "";
    if (reason.length < 4) {
      problems.push(`${at}: reason must say why in a sentence — an undocumented override is an audit finding.`);
    }
    if (
      typeof flag === "string" &&
      (HR_DECLARABLE_FLAGS as readonly string[]).includes(flag) &&
      typeof bag.applies === "boolean" &&
      reason.length >= 4
    ) {
      out.push({ flag: flag as HrDeclarableKey, applies: bag.applies, reason });
    }
  });
  if (problems.length > 0) throw new Error(`${problems.join(" ")} Nothing was changed.`);
  return out;
}

/**
 * Requests → the door's payload: every flag column that changes, plus the WHOLE
 * declared map (earlier declarations carried forward — see the file header).
 */
export function declarationPayload(
  profile: HrEmployerProfileRead,
  requests: HrDeclarationRequest[],
  now: string,
): Record<string, unknown> {
  const declared: Record<string, HrApplicabilityDeclaration> = {
    ...readDeclarations(profile.applicability_basis),
  };
  const payload: Record<string, unknown> = {};
  for (const request of requests) {
    declared[request.flag] = {
      applies: request.applies,
      reason: request.reason,
      declared_at: now,
    };
    payload[request.flag] = request.applies;
  }
  payload.applicability_override = declared;
  payload.applicability_override_reason = requests
    .map((r) => `${flagLabel(r.flag)}: ${r.reason}`)
    .join(" · ");
  return payload;
}

// ── The surface scope ───────────────────────────────────────────────────────

export type HrEmployerScopeInput = {
  organization: { id: string; name: string | null } | null;
  loadStatus: "loading" | "loaded" | "failed" | "no_profile";
  profile: HrEmployerProfileRead | null;
  form: HrEmployerIdentityForm | null;
  establishments: HrEstablishment[] | null;
};

/** The one XML bundle an agent reads up front. */
export function employerBundle(input: HrEmployerScopeInput): string {
  const { profile, form, establishments } = input;
  if (!profile) return "";
  const saved = identityFromProfile(profile);
  const flags = applicabilityFlags(profile);
  return xmlElement(
    "employer",
    {
      organization: input.organization?.name ?? null,
      organization_id: profile.organization_id,
      unsaved_changes: form ? !identityEquals(form, saved) : false,
    },
    [
      xmlElement("identity", {
        legal_name: saved.legal_name,
        dba_name: saved.dba_name || null,
        entity_form: saved.entity_form || null,
        formation_state: saved.formation_state || null,
        ein: "on file, never shown",
      }),
      xmlText("primary_address", formatAddress(saved.primary_address) || "not set"),
      xmlList(
        "applicability",
        flags,
        (flag) =>
          xmlElement("flag", {
            key: flag.key,
            label: flag.label,
            value: flagValueText(flag.value),
            declared: flag.isDeclared || null,
            reason: flag.declaredReason,
            basis: flag.isDeclared ? null : flag.derivation ?? "nobody has counted or declared this",
          }),
      ),
      establishments
        ? xmlList(
            "establishments",
            establishments,
            (row) =>
              xmlElement("establishment", {
                id: row.id,
                name: row.name,
                headquarters: row.is_headquarters || null,
                naics: row.naics_code,
                eeo1_id: row.eeo1_establishment_id,
                annual_average_employees: row.annual_average_employees,
              }),
            { maxRows: 25 },
          )
        : null,
      xmlElement("tax_registrations", {
        status: "not readable from the browser yet",
      }),
    ],
  );
}

/** Loaded-only values: a key is omitted until its source has loaded. */
export function buildHrEmployerScope(input: HrEmployerScopeInput): Record<string, unknown> {
  const scope: Record<string, unknown> = { employer_load_status: input.loadStatus };
  if (input.organization) {
    scope.employer_organization = {
      id: input.organization.id,
      name: input.organization.name,
    };
  }
  const { profile, form } = input;
  if (profile) {
    const saved = identityFromProfile(profile);
    scope.employer_overview = employerBundle(input);
    scope.employer_identity = {
      ...saved,
      primary_address: writeAddress(saved.primary_address),
      ein_on_file: "The EIN is stored server-side and never sent to a browser.",
      version: profile.version,
      updated_at: profile.updated_at || null,
    };
    scope.applicability_flags = applicabilityFlags(profile).map((flag) => ({
      key: flag.key,
      label: flag.label,
      test: flag.test,
      value: flag.value,
      declared: flag.isDeclared,
      declared_reason: flag.declaredReason,
      declared_at: flag.declaredAt ?? null,
      derivation: flag.derivation,
    }));
    if (form) {
      scope.employer_identity_draft = {
        ...form,
        primary_address: writeAddress(form.primary_address),
      };
      scope.has_unsaved_identity_changes = !identityEquals(form, saved);
      scope.identity_problems = identityProblems(form);
    }
  }
  if (input.establishments) {
    scope.establishments = input.establishments.map((row) => ({
      id: row.id,
      name: row.name,
      is_headquarters: row.is_headquarters,
      naics_code: row.naics_code,
      eeo1_establishment_id: row.eeo1_establishment_id,
      osha_establishment_name: row.osha_establishment_name,
      annual_average_employees: row.annual_average_employees,
    }));
    scope.establishment_count = input.establishments.length;
  }
  if (input.loadStatus === "loaded") {
    scope.tax_registrations_status =
      "Tax registrations cannot be read from the browser yet; this page shows none rather than an empty list.";
  }
  return scope;
}
