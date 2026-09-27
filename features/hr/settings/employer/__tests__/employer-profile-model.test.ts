import type { HrEmployerProfileRead } from "../../types";
import {
  applicabilityFlags,
  buildHrEmployerScope,
  declarationPayload,
  establishmentPayload,
  flagValueText,
  identityFromProfile,
  identityPayload,
  mergeIdentityDraft,
  parseCreateEstablishments,
  parseDeclarations,
  parseUpdateEstablishments,
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

  it("stores an empty address as {} — never a row of nulls", () => {
    const form = identityFromProfile(profile());
    expect(identityPayload(form).primary_address).toEqual({});
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
        { flag: "everify_required_states", states: ["Arizona"], reason: "State law." },
        { flag: "is_eeo1_filer", applies: "yes", reason: "ok" },
      ]),
    ).toThrow(/Item 2: is_aca_ale appears twice.*Item 3: states must be a list of two-letter.*Item 4: reason must say why.*Item 4: applies must be true or false.*Nothing was changed\./);
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

describe("E-Verify declarations", () => {
  it("declares a list of states and 'none required', and reads them back", () => {
    const [req] = parseDeclarations([
      { flag: "everify_required_states", states: ["ms", "AZ", "AZ"], reason: "State law for our sites." },
    ]);
    expect(req).toEqual({ flag: "everify_required_states", applies: true, states: ["AZ", "MS"], reason: "State law for our sites." });
    const payload = declarationPayload(profile(), [req], "2026-09-27");
    expect(payload.everify_required_states).toEqual(["AZ", "MS"]);

    const none = profile({
      applicability_basis: {
        declared: { everify_required_states: { applies: false, states: [], reason: "No E-Verify states.", declared_at: "2026-09-27" } },
      },
    });
    const flag = applicabilityFlags(none).find((f) => f.key === "everify_required_states")!;
    expect(flag.isDeclared).toBe(true);
    expect(flagValueText(flag)).toBe("None required");
    const open = applicabilityFlags(profile()).find((f) => f.key === "everify_required_states")!;
    expect(flagValueText(open)).toBe("Not established");
  });
});

describe("establishment archive via update", () => {
  const row = {
    id: "e1", name: "Irvine HQ", address: {}, jurisdiction_id: "j-ca", naics_code: null,
    eeo1_establishment_id: null, is_headquarters: false, osha_establishment_name: null,
    annual_average_employees: null, total_hours_worked: null,
  };
  const J = [{ id: "j-ca", name: "California", jurisdiction_key: "US-CA" }];
  it("archives alone, and refuses a restore it cannot see", () => {
    const [plan] = parseUpdateEstablishments([{ id: "e1", archived: true }], [row], J);
    expect(plan).toMatchObject({ archive: true, changed: ["archived"] });
    expect(() => parseUpdateEstablishments([{ id: "e1", archived: false }], [row], J)).toThrow(/archived can only be true/);
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

describe("establishments (agent writes)", () => {
  const J = [
    { id: "j-ca", name: "California", jurisdiction_key: "us-ca" },
    { id: "j-tx", name: "Texas", jurisdiction_key: "us-tx" },
  ];
  const existing = [
    {
      id: "e1",
      name: "Irvine HQ",
      address: {},
      jurisdiction_id: "j-ca",
      naics_code: null,
      eeo1_establishment_id: null,
      is_headquarters: true,
      osha_establishment_name: null,
      annual_average_employees: 12,
      total_hours_worked: null,
    },
  ];

  it("creates with a jurisdiction named by key or name and builds the door payload", () => {
    const [a, b] = parseCreateEstablishments(
      [
        { name: "Austin Yard", jurisdiction: "texas", naics_code: "562111" },
        { name: "Fresno Route", jurisdiction: "us-ca", address: { city: "Fresno", region: "ca" } },
      ],
      existing,
      J,
    );
    expect(establishmentPayload(a)).toMatchObject({ name: "Austin Yard", jurisdiction_id: "j-tx", naics_code: "562111", address: {} });
    expect(establishmentPayload(b).address).toMatchObject({ city: "Fresno", region: "CA" });
  });

  it("refuses duplicates, unknown jurisdictions, ids and bad codes — all at once", () => {
    expect(() =>
      parseCreateEstablishments(
        [
          { name: "irvine hq", jurisdiction: "California" },
          { name: "Moon Base", jurisdiction: "Luna" },
          { id: "x", name: "Z", jurisdiction: "Texas" },
          { name: "Bad", jurisdiction: "Texas", naics_code: "abc" },
        ],
        existing,
        J,
      ),
    ).toThrow(/Item 1: An establishment named "irvine hq" already exists.*Item 2: jurisdiction "Luna".*Item 3: a new establishment has no id.*Item 4: A NAICS code.*Nothing was changed\./);
  });

  it("updates only the fields sent and refuses unknown ids and empty changes", () => {
    const [plan] = parseUpdateEstablishments([{ id: "e1", annual_average_employees: 14 }], existing, J);
    expect(plan.changed).toEqual(["annual_average_employees"]);
    expect(establishmentPayload(plan.input)).toMatchObject({ name: "Irvine HQ", jurisdiction_id: "j-ca", is_headquarters: true, annual_average_employees: "14" });
    expect(() => parseUpdateEstablishments([{ id: "nope" }, { id: "e1" }], existing, J)).toThrow(
      /Item 1: id must be.*Item 2: nothing to change on Irvine HQ.*Nothing was changed\./,
    );
  });
});
