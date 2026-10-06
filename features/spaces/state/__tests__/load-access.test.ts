/**
 * A refused tree read is a sign-in / no-access state, never database text in the sidebar.
 * readAllRows flattens PostgREST's error into a sentence and drops `.code`, so the refusal must be
 * recognised from that sentence as well as from a 42501 code.
 */
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ auth: {} }) }));
import { isRefusal } from "../load-access";

describe("isRefusal", () => {
  it("reads the sentence readAllRows leaves for a refused space_list", () => {
    expect(isRefusal(new Error("readAllRows(content.space_list): query failed — permission denied for function space_list"))).toBe(true);
  });
  it("reads a PostgREST 42501", () => {
    expect(isRefusal({ code: "42501", message: "nope" })).toBe(true);
  });
  it("leaves a real fault a fault", () => {
    expect(isRefusal(new Error("readAllRows(content.space_list): query failed — TypeError: Failed to fetch"))).toBe(false);
  });
});
