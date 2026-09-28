import { ackSuggestions, fetchAckedSuggestionIds } from "./kgSuggestionAckService";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { requireUserId } from "@/utils/auth/getUserId";

const upsert = jest.fn();
const eq = jest.fn();
const is = jest.fn(() => ({ eq }));
const select = jest.fn(() => ({ is }));
const from = jest.fn(() => ({ upsert, select }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(() => ({ from })) },
}));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: jest.fn() }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: jest.fn() }));

describe("ackSuggestions with the lifetime acknowledgement identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireUserId).mockReturnValue("member-7");
    jest.mocked(ensureOrgId).mockResolvedValue("org-42");
  });

  it("revives a deleted acknowledgement through the composite primary key", async () => {
    upsert.mockResolvedValue({ error: null });

    await expect(ackSuggestions("member-7", ["suggestion-a"])).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledWith({
      user_id: "member-7",
      created_by: "member-7",
      suggestion_id: "suggestion-a",
      organization_id: "org-42",
      deleted_at: null,
    }, { onConflict: "user_id,suggestion_id" });
  });

  it("keeps simultaneous dismissals on the same lifetime identity", async () => {
    const releases: Array<() => void> = [];
    upsert.mockImplementation(
      () => new Promise<{ error: null }>((resolve) => releases.push(() => resolve({ error: null }))),
    );

    const writes = Promise.all([
      ackSuggestions("member-7", ["suggestion-a"]),
      ackSuggestions("member-7", ["suggestion-a"]),
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(releases).toHaveLength(2);
    expect(upsert.mock.calls.every(([, options]) => options.onConflict === "user_id,suggestion_id")).toBe(true);

    releases.forEach((release) => release());
    await expect(writes).resolves.toEqual([undefined, undefined]);
  });

  it("makes a deleted acknowledgement live again after an explicit dismissal", async () => {
    const rows = [{ user_id: "member-7", suggestion_id: "suggestion-a", deleted_at: "2026-09-27T00:00:00Z" }];
    upsert.mockImplementation(async (row) => {
      const existing = rows.find((candidate) => candidate.user_id === row.user_id && candidate.suggestion_id === row.suggestion_id);
      if (existing) existing.deleted_at = row.deleted_at;
      return { error: null };
    });
    eq.mockImplementation(async (_column, userId) => ({
      data: rows
        .filter((row) => row.user_id === userId && row.deleted_at === null)
        .map((row) => ({ suggestion_id: row.suggestion_id })),
      error: null,
    }));

    expect(await fetchAckedSuggestionIds("member-7")).toEqual(new Set());
    await ackSuggestions("member-7", ["suggestion-a"]);
    await expect(fetchAckedSuggestionIds("member-7")).resolves.toEqual(new Set(["suggestion-a"]));
  });

  it("does not turn an unexpected write failure into a false acknowledgement", async () => {
    upsert.mockResolvedValue({ error: { code: "42501", message: "RLS denied" } });

    await expect(ackSuggestions("member-7", ["suggestion-a"])).rejects.toThrow();
  });
});
