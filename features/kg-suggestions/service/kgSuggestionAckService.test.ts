import { ackSuggestions } from "./kgSuggestionAckService";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { requireUserId } from "@/utils/auth/getUserId";

const insert = jest.fn();
const from = jest.fn(() => ({ insert }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(() => ({ from })) },
}));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: jest.fn() }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: jest.fn() }));

describe("ackSuggestions with the live-row acknowledgement identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireUserId).mockReturnValue("member-7");
    jest.mocked(ensureOrgId).mockResolvedValue("org-42");
  });

  it("treats only the partial unique-index race as an already-live dismissal", async () => {
    insert.mockResolvedValue({ error: { code: "23505" } });

    await expect(ackSuggestions("member-7", ["suggestion-a"])).resolves.toBeUndefined();

    expect(insert).toHaveBeenCalledWith({
      created_by: "member-7",
      suggestion_id: "suggestion-a",
      organization_id: "org-42",
    });
  });

  it("does not turn a real write failure into a false acknowledgement", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "RLS denied" } });

    await expect(ackSuggestions("member-7", ["suggestion-a"])).rejects.toThrow();
  });
});
