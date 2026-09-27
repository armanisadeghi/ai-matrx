/**
 * @jest-environment node
 *
 * THE USE CASE (lane HANDOVER, 2026-09-27). test@test.com, a member of Cedar Ridge Physical Therapy
 * who may view its patients, changed Dana Whitfield's Allergies. The store refused with a sentence
 * for her — this is the live 403 body, verbatim — and the page toasted "Permission denied Your
 * text is still in the box.": the scopes mapper swapped the store's sentence for a fixed string.
 *
 * RED before the lane: RPC_RESULT_UNDER_TEST / WRITE_FAILURE_UNDER_TEST point at HEAD copies.
 */
const customRpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: jest.fn(), schema: () => ({ rpc: (...a: unknown[]) => customRpc(...a) }) },
}));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "u-test", requireUserId: () => "u-test" }));
if (process.env.RPC_RESULT_UNDER_TEST) {
  jest.mock("@/features/scopes/service/rpcResult", () => jest.requireActual(process.env.RPC_RESULT_UNDER_TEST as string));
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scopeStore } = require("@/features/scopes/service/scopeStore") as typeof import("@/features/scopes/service/scopeStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { describeWriteFailure } = require(process.env.WRITE_FAILURE_UNDER_TEST ?? "@/lib/errors/writeFailure") as typeof import("@/lib/errors/writeFailure");

const LIVE_403 = {
  code: "42501",
  details: null,
  hint: "DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through. It would take Record editor, or a share of this one field with you.",
  message: 'You can see this record, but "Allergies" is not yours to change.',
};

beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));

it("a refused value keeps the store's sentence all the way to the words on screen", async () => {
  customRpc.mockResolvedValueOnce({ data: null, error: LIVE_403 });
  const refused = await scopeStore.setContextValue({ context_item_id: "i", scope_id: "s", value_text: "Latex, penicillin, sulfa" });
  expect(!refused.ok && refused.error.message).toBe(LIVE_403.message);
  const words = describeWriteFailure(new Error(!refused.ok ? refused.error.message : ""), { action: "save this value", remedy: "Your text is still in the box." });
  expect(words.description).toBe('You can see this record, but "Allergies" is not yours to change. Your text is still in the box.');
});

it("a PostgREST refusal on screen says the door's words, and never Postgres's own", () => {
  const say = (e: unknown) => describeWriteFailure(e, { action: "save this", remedy: "" }).description;
  expect(say(LIVE_403)).toBe(LIVE_403.message);
  expect(say({ code: "42501", message: "cat_write: this category is not yours to change." })).toBe("This category is not yours to change.");
  expect(say({ code: "42501", message: "permission denied for table context_values" })).toBe("You do not have permission to do this.");
  expect(say({ code: "42501", message: 'new row violates row-level security policy for table "x"' })).toBe("You do not have permission to do this.");
  expect(say({ name: "Error", message: "Permission denied" })).toBe("Permission denied.");
});
