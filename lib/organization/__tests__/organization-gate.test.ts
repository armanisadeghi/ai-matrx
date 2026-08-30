/**
 * The organization gate — "no organization selected" must be a question, not a
 * dead end, and never a guess.
 *
 * THE INCIDENT (2026-08-30). With no organization selected, an attachment was
 * uploaded and silently filed in the person's PERSONAL workspace, while the
 * send was refused with "Select an organization before sending this message."
 * They selected their team organization and re-sent — and the file and the
 * conversation now lived in different workspaces. The guess and the refusal
 * between them manufactured the mismatch.
 *
 * Every test here holds one of the three behaviours that fix it: ASK when we
 * must, CONTINUE with the answer, and NEVER guess.
 */

import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
  OrganizationSelectionCancelled,
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "../organization-gate";

const TEAM_ORG = "f9cb3e35-2a65-4f2a-8525-088d6551071c";
const PERSONAL_ORG = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";

let selectedOrganizationId: string | null = null;

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({ appContext: { organization_id: selectedOrganizationId } }),
  }),
}));

beforeEach(() => {
  selectedOrganizationId = null;
  registerOrganizationPicker(null);
  settleOrganizationSelection(null);
});

afterEach(() => {
  registerOrganizationPicker(null);
});

/** Stand in for the dialog: opening it answers on the next microtask. */
function mountPicker(answer: string | null, onOpen?: () => void) {
  registerOrganizationPicker(() => {
    onOpen?.();
    queueMicrotask(() => settleOrganizationSelection(answer));
  });
}

describe("ensureOrganizationContext", () => {
  test("uses the selected organization without asking", async () => {
    selectedOrganizationId = TEAM_ORG;
    const open = jest.fn();
    mountPicker(PERSONAL_ORG, open);

    await expect(ensureOrganizationContext()).resolves.toBe(TEAM_ORG);
    expect(open).not.toHaveBeenCalled();
  });

  test("an explicitly supplied organization is never questioned", async () => {
    // An entity-bound launcher, or a conversation that already owns a durable
    // organization, has decided already. Asking would be asking the person
    // about something that is not theirs to change in this moment.
    const open = jest.fn();
    mountPicker(PERSONAL_ORG, open);

    await expect(
      ensureOrganizationContext({ organizationId: TEAM_ORG }),
    ).resolves.toBe(TEAM_ORG);
    expect(open).not.toHaveBeenCalled();
  });

  test("asks when nothing is selected and continues with the answer", async () => {
    // THE fix. The action is not abandoned and not guessed at — it waits.
    const open = jest.fn();
    mountPicker(TEAM_ORG, () => {
      open();
      // The dialog commits the choice globally before settling, exactly as the
      // real component does.
      selectedOrganizationId = TEAM_ORG;
    });

    await expect(ensureOrganizationContext()).resolves.toBe(TEAM_ORG);
    expect(open).toHaveBeenCalledTimes(1);
  });

  test("cancelling throws the cancellation marker, never an organization", async () => {
    // "Not now" is an answer. Callers translate this into "nothing happened".
    mountPicker(null);

    await expect(ensureOrganizationContext()).rejects.toBeInstanceOf(
      OrganizationSelectionCancelled,
    );
  });

  test("NEVER falls back to an organization on the person's behalf", async () => {
    // The planted bad case: no picker mounted, nothing selected. A gate that
    // "helpfully" resolved to personal here would reintroduce the entire bug.
    // It must re-throw the original fail-closed error instead.
    await expect(ensureOrganizationContext()).rejects.toMatchObject({
      code: "organization_context_required",
    });
  });

  test("non-interactive callers keep the plain fail-closed behaviour", async () => {
    // Background work (prefetch, polling, telemetry) must never raise a dialog
    // with no visible action behind it to explain why.
    const open = jest.fn();
    mountPicker(TEAM_ORG, open);

    await expect(
      ensureOrganizationContext({ interactive: false }),
    ).rejects.toMatchObject({ code: "organization_context_required" });
    expect(open).not.toHaveBeenCalled();
  });

  test("two blocked actions share ONE question and both continue", async () => {
    // Racing actions must not stack dialogs. One question, one answer, both
    // callers resume on it.
    const open = jest.fn();
    mountPicker(TEAM_ORG, () => {
      open();
      selectedOrganizationId = TEAM_ORG;
    });

    const [a, b] = await Promise.all([
      ensureOrganizationContext(),
      ensureOrganizationContext(),
    ]);

    expect(a).toBe(TEAM_ORG);
    expect(b).toBe(TEAM_ORG);
    expect(open).toHaveBeenCalledTimes(1);
  });

  test("a picker that throws on open settles as cancelled, never hangs", async () => {
    // An action wedged forever on an unsettled promise is worse than a refusal.
    registerOrganizationPicker(() => {
      throw new Error("picker blew up");
    });

    await expect(ensureOrganizationContext()).rejects.toBeInstanceOf(
      OrganizationSelectionCancelled,
    );
  });

  test("an answer that does not survive validation is refused, not trusted", async () => {
    // The picker's payload is re-validated through the same kernel every other
    // organization passes through, so it can never introduce a shape the
    // transport would reject.
    mountPicker("not-a-uuid");

    await expect(ensureOrganizationContext()).rejects.toMatchObject({
      code: "organization_context_invalid",
    });
  });
});

describe("isOrganizationSelectionCancelled", () => {
  test("recognises the marker and nothing else", () => {
    expect(
      isOrganizationSelectionCancelled(new OrganizationSelectionCancelled()),
    ).toBe(true);
    expect(isOrganizationSelectionCancelled(new Error("boom"))).toBe(false);
    expect(isOrganizationSelectionCancelled(null)).toBe(false);
  });
});
