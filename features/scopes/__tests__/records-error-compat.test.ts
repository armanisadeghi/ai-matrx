import { isScopesRpcErr } from "../types";

describe("scopes records-result compatibility", () => {
  it("narrows the record store refusal envelope for existing host callers", () => {
    const refused = {
      ok: false as const,
      error: { code: "internal" as const, message: "The store refused this request." },
    };
    const accepted = { ok: true as const, data: { id: "scope-7" } };

    expect(isScopesRpcErr(refused)).toBe(true);
    expect(isScopesRpcErr(accepted)).toBe(false);
  });
});
