import {
  activateProposedRecipe,
  activationRefusal,
  type RecipeActivationStore,
  type ReviewRecipe,
} from "./activation";

const harborDentalProposal = {
  id: "harbor-dental-intake",
  normalized_origin: "https://portal.harbordental.test",
  match_pattern: "/new-patient-intake",
  provider_key: "harbor_dental",
  recipe_version: 3,
  field_map: [
    {
      step: 0,
      selector: "#patient-email",
      field_key: "username",
      literal_key: null,
      clear_first: true,
    },
    {
      step: 0,
      selector: "#patient-password",
      field_key: "password",
      literal_key: null,
      clear_first: true,
    },
  ],
  submit: { kind: "click", selector: "button[type=submit]" },
  success_signals: [
    {
      kind: "url_prefix",
      value: "https://portal.harbordental.test/welcome",
      direction: "authenticated",
      weight: 0.9,
      label: "Patient home",
    },
  ],
  failure_signals: [
    {
      kind: "text_present",
      value: "Please check your password",
      direction: "rejected",
      weight: 0.8,
      label: "Password message",
    },
  ],
  challenge_signals: [
    {
      kind: "selector_present",
      value: "#verification-code",
      direction: "challenged",
      weight: 0.9,
      label: "Verification code",
    },
  ],
  notes: "Harbor Dental new-patient intake login.",
  provenance: "hindsight_proposal",
  source_finding_id: "harbor-dental-review-finding",
  status: "proposed",
  confidence_floor: 0.75,
  version: 8,
  deleted_at: null,
} satisfies ReviewRecipe;

function store(
  overrides: Partial<RecipeActivationStore> = {},
): RecipeActivationStore {
  return {
    findExistingActive: jest.fn().mockResolvedValue({ data: [], error: null }),
    writeActivation: jest.fn().mockResolvedValue({
      data: { id: harborDentalProposal.id, version: 9 },
      error: null,
    }),
    readRecipe: jest.fn().mockResolvedValue({
      data: { ...harborDentalProposal, status: "active", version: 9 },
      error: null,
    }),
    ...overrides,
  };
}

describe("login recipe activation", () => {
  it("refuses malformed recipe data before reaching the persistence boundary", async () => {
    const persistence = store();
    const result = await activateProposedRecipe(
      {
        ...harborDentalProposal,
        field_map: [{ selector: "#patient-email", unexpected: true }],
      },
      persistence,
    );

    expect(result).toMatchObject({
      kind: "refused",
      reason: "This recipe has an invalid structural shape.",
    });
    expect(persistence.findExistingActive).not.toHaveBeenCalled();
    expect(persistence.writeActivation).not.toHaveBeenCalled();
  });

  it("refuses a deleted or stale proposal before any write", async () => {
    const persistence = store();

    expect(
      activationRefusal({
        ...harborDentalProposal,
        deleted_at: "2026-09-21T18:40:00Z",
      }),
    ).toMatch(/deleted/);
    expect(
      activationRefusal({ ...harborDentalProposal, status: "retired" }),
    ).toMatch(/no longer proposed/);
    await activateProposedRecipe(
      { ...harborDentalProposal, status: "retired" },
      persistence,
    );

    expect(persistence.writeActivation).not.toHaveBeenCalled();
  });

  it("fails closed when checking for an existing active recipe fails", async () => {
    const persistence = store({
      findExistingActive: jest.fn().mockResolvedValue({
        data: null,
        error: new Error("database unavailable"),
      }),
    });

    const result = await activateProposedRecipe(
      harborDentalProposal,
      persistence,
    );

    expect(result).toMatchObject({
      kind: "refused",
      reason: expect.stringMatching(/could not be checked/),
    });
    expect(persistence.writeActivation).not.toHaveBeenCalled();
  });

  it("refuses when another active recipe covers the same origin and path", async () => {
    const persistence = store({
      findExistingActive: jest.fn().mockResolvedValue({
        data: [{ id: "harbor-dental-current" }],
        error: null,
      }),
    });

    const result = await activateProposedRecipe(
      harborDentalProposal,
      persistence,
    );

    expect(result).toMatchObject({
      kind: "refused",
      reason: expect.stringMatching(/already exists/),
    });
    expect(persistence.writeActivation).not.toHaveBeenCalled();
  });

  it("re-reads and refuses a concurrent CAS miss instead of retrying a newer proposal", async () => {
    const persistence = store({
      writeActivation: jest.fn().mockResolvedValue({ data: null, error: null }),
      readRecipe: jest.fn().mockResolvedValue({
        data: {
          ...harborDentalProposal,
          version: 9,
          notes: "Changed by another reviewer.",
        },
        error: null,
      }),
    });

    const result = await activateProposedRecipe(
      harborDentalProposal,
      persistence,
    );

    expect(result).toMatchObject({
      kind: "refused",
      reason: expect.stringMatching(/changed before activation/),
    });
    expect(persistence.writeActivation).toHaveBeenCalledTimes(1);
    expect(persistence.readRecipe).toHaveBeenCalledWith(
      harborDentalProposal.id,
    );
  });

  it("activates once only after the authoritative reread is active", async () => {
    const persistence = store();
    const first = await activateProposedRecipe(
      harborDentalProposal,
      persistence,
    );

    expect(first).toMatchObject({
      kind: "activated",
      row: { status: "active", version: 9 },
    });
    expect(persistence.writeActivation).toHaveBeenCalledTimes(1);

    if (first.kind !== "activated")
      throw new Error("Expected the first activation to be confirmed.");
    const second = await activateProposedRecipe(first.row, persistence);
    expect(second).toMatchObject({
      kind: "already_active",
      row: { status: "active", version: 9 },
    });
    expect(persistence.writeActivation).toHaveBeenCalledTimes(1);
  });
});
