/**
 * N5 — an edit made a moment before the tab closes reaches the store: the page is sent as a keepalive
 * `space_save` (same arguments, same compare-and-swap) the browser finishes after the tab is gone.
 * End-to-end proof (type, close the tab 0.3 s later, reopen): scratchpad r19/n5.mjs — FAIL before, PASS after.
 */
jest.mock("@/utils/supabase/client", () => ({ supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn() } } }));
import { KEEPALIVE_LIMIT, leaveSaveRequest } from "../leave-save";
import type { SpaceDoc } from "../../contract";

const doc = (text: string) =>
  ({ id: "d1", title: "Plan", icon: null, cover: null, settings: {}, version: 7, blocks: [{ id: "b1", type: "text", text: [{ text }] }] }) as unknown as SpaceDoc;
const base = { endpoint: "https://db.example.com/", apiKey: "pk", token: "jwt" };

describe("leaveSaveRequest", () => {
  it("sends the page through space_save as a keepalive request, compare-and-swap on the base version", () => {
    const r = leaveSaveRequest({ ...base, doc: doc("typed last"), baseVersion: 7 });
    expect(r?.url).toBe("https://db.example.com/rest/v1/rpc/space_save");
    expect(r?.init.keepalive).toBe(true);
    expect(r?.init.headers).toMatchObject({ "Content-Profile": "content", apikey: "pk", Authorization: "Bearer jwt" });
    const body = JSON.parse(String(r?.init.body));
    expect(body.p_document_id).toBe("d1");
    expect(body.p_expected_version).toBe(7);
    expect(JSON.stringify(body.p_snapshot)).toContain("typed last");
    expect(body.p_projection).toContain("typed last");
  });
  it("sends nothing without a sign-in (the device copy restores it instead)", () => {
    expect(leaveSaveRequest({ ...base, token: null, doc: doc("x"), baseVersion: 1 })).toBeNull();
  });
  it("sends nothing past the browser's keepalive limit (the device copy restores it instead)", () => {
    expect(leaveSaveRequest({ ...base, doc: doc("x".repeat(KEEPALIVE_LIMIT)), baseVersion: 1 })).toBeNull();
  });
});
