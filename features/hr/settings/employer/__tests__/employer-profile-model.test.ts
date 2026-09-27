import type { HrEmployerProfileRead } from "../../types";
import {
  applicabilityFlags,
  buildHrEmployerScope,
  declarationPayload,
  identityFromProfile,
  identityPayload,
  mergeIdentityDraft,
  parseDeclarations,
  readAddress,
  readDeclarations,
} from "../employer-profile-model";

function profile(overrides: Partial<HrEmployerProfileRead> = {}): HrEmployerProfileRead {
  return {
    id: "p1",
    organization_id: "o1",
    legal_name: "Cedar Ridge Dental, PC",
    dba_name: null,
    entity_form: null,
    formation_state: null,
    primary_address: {},
    workers_comp_policy: {},
    careers_slug: null,
    applicability_basis: {},
    headcount_total: null,
    headcount_asof_date: null,
    is_fmla_covered: null,
    is_aca_ale: null,
    is_eeo1_filer: null,
    is_federal_contractor: null,
    everify_required_states: [],
    settings: {},
    version: 1,
    updated_at: "2026-09-27T00:00:00Z",
    ...overrides,
  };
}

describe("address", () => {
  it("reads the wizard's shape and defaults the country", () => {
    expect(readAddress({ line1: "1 Main", city: "Irvine", region: "CA", postal_code: "92618" }))
      .toEqual({ line1: "1 Main", line2: "", city: "Irvine", region: "CA", postal_code: "92618", country: "US" });
    expect(readAddress(null).country).toBe("US");
  });
});

describe("identity draft (agent write)", () => {
  const current = identityFromProfile(profile());

  it("changes only the keys sent, address parts included", () => {
    const next = mergeIdentityDraft(current, {
      dba_name: "Cedar Ridge",
      primary_address: { city: "Irvine", region: "ca" },
    });
    expect(next.legal_name).toBe("Cedar Ridge Dental, PC");
    expect(next.dba_name).toBe("Cedar Ridge");
    expect(next.primary_address.city).toBe("Irvine");
    expect(identityPayload(next).primary_address).toMatchObject({ region: "CA", country: "US" });
  });

  it("refuses the EIN, unknown fields and bad values — every problem at once", () => {
    expect(() =>
      mergeIdentityDraft(current, {
        ein: "12-3456789",
        color: "blue",
        legal_name: "",
        formation_state: "Delaware",
        entity_form: "corp",
      }),
    ).toThrow(
      /EIN cannot be set by an agent.*"color" is not a field.*legal name cannot be blank.*formation state is two letters.*entity form must be one of.*Nothing was changed\./,
    );
  });
});

describe("declarations", () => {
  it("parses a list and refuses duplicates, E-Verify and missing reasons together", () => {
    expect(parseDeclarations([{ flag: "is_fmla_covered", applies: true, reason: "Counsel advised." }]))
      .toEqual([{ flag: "is_fmla_covered", applies: true, reason: "Counsel advised." }]);
    expect(() =>
      parseDeclarations([
        { flag: "is_aca_ale", applies: true, reason: "Counted 60 FTEs." },
        { flag: "is_aca_ale", applies: false, reason: "Changed our mind." },
        { flag: "everify_required_states", applies: true, reason: "Arizona." },
        { flag: "is_eeo1_filer", applies: "yes", reason: "ok" },
      ]),
    ).toThrow(/Item 2: is_aca_ale appears twice.*Item 3: flag must be one of.*Item 4: applies must be true or false.*Item 4: reason must say why.*Nothing was changed\./);
    expect(() => parseDeclarations([])).toThrow(/JSON array/);
  });

  it("carries every earlier declaration forward and sets the flag column", () => {
    const earlier = profile({
      applicability_basis: {
        declared: { is_federal_contractor: { applies: true, reason: "GSA schedule.", declared_at: "2026-09-01" } },
      },
    });
    const payload = declarationPayload(
      earlier,
      [{ flag: "is_fmla_covered", applies: false, reason: "Under 50 all year." }],
      "2026-09-27T10:00:00Z",
    );
    expect(payload.is_fmla_covered).toBe(false);
    expect(payload.applicability_override).toEqual({
      is_federal_contractor: { applies: true, reason: "GSA schedule.", declared_at: "2026-09-01" },
      is_fmla_covered: { applies: false, reason: "Under 50 all year.", declared_at: "2026-09-27T10:00:00Z" },
    });
  });

  it("reads declarations back onto the flags", () => {
    const declared = profile({
      is_fmla_covered: true,
      applicability_basis: {
        declared: { is_fmla_covered: { applies: true, reason: "Counsel advised.", declared_at: "2026-09-27" } },
      },
    });
    expect(Object.keys(readDeclarations(declared.applicability_basis))).toEqual(["is_fmla_covered"]);
    const fmla = applicabilityFlags(declared).find((f) => f.key === "is_fmla_covered");
    expect(fmla).toMatchObject({ isDeclared: true, declaredReason: "Counsel advised.", value: true });
    const aca = applicabilityFlags(declared).find((f) => f.key === "is_aca_ale");
    expect(aca).toMatchObject({ isDeclared: false, value: null, derivation: null });
  });
});

describe("surface scope", () => {
  it("omits what has not loaded and reports empty lists as empty", () => {
    const loading = buildHrEmployerScope({
      organization: { id: "o1", name: "Cedar Ridge" },
      loadStatus: "loading",
      profile: null,
      form: null,
      establishments: null,
    });
    expect(loading).toEqual({ employer_load_status: "loading", employer_organization: { id: "o1", name: "Cedar Ridge" } });

    const p = profile();
    const form = { ...identityFromProfile(p), dba_name: "Cedar" };
    const loaded = buildHrEmployerScope({
      organization: { id: "o1", name: "Cedar Ridge" },
      loadStatus: "loaded",
      profile: p,
      form,
      establishments: [],
    });
    expect(loaded.establishments).toEqual([]);
    expect(loaded.establishment_count).toBe(0);
    expect(loaded.has_unsaved_identity_changes).toBe(true);
    expect(String(loaded.employer_overview)).toContain('legal_name="Cedar Ridge Dental, PC"');
    expect(String(loaded.employer_overview)).not.toMatch(/\d{2}-\d{7}/);
  });
});
