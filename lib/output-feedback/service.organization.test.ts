// Law: common-docs/policies/access-ladder.md rule 4 — every save carries an
// explicit organization_id; the database never picks one.
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      rpc: (...a: unknown[]) => ({ returns: () => rpc(...a) }),
    }),
  },
}));
const ensureOrgId = jest.fn();
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: (...a: unknown[]) => ensureOrgId(...a) }));
jest.mock("@ai-matrx/data/db", () => ({ readAllRows: jest.fn() }));

import { saveOutputFeedback } from "./service";

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({
    data: { id: "f1", subject_type: "message", subject_id: "263550e7-eb60-4e8e-97ee-e19297126ebe", user_id: "u1", created_at: "x", updated_at: "x" },
    error: null,
  });
  ensureOrgId.mockReset();
});

it("sends the working organization when the caller names none", async () => {
  ensureOrgId.mockResolvedValue("org-active");
  await saveOutputFeedback({ subjectType: "message", subjectId: "263550e7-eb60-4e8e-97ee-e19297126ebe", verdict: "up" } as never).catch(() => undefined);
  expect(ensureOrgId).toHaveBeenCalledWith(undefined);
  expect(rpc).toHaveBeenCalledWith("upsert_output_feedback", expect.objectContaining({ p_organization_id: "org-active" }));
});

it("sends the subject's own organization when the caller names it", async () => {
  ensureOrgId.mockImplementation(async (id?: string) => id);
  await saveOutputFeedback({
    subjectType: "message",
    subjectId: "263550e7-eb60-4e8e-97ee-e19297126ebe",
    verdict: "up",
    organizationId: "org-record",
  } as never).catch(() => undefined);
  expect(rpc).toHaveBeenCalledWith("upsert_output_feedback", expect.objectContaining({ p_organization_id: "org-record" }));
});
