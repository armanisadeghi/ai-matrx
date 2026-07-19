import { mapScopeToInstance } from "../scope-mapping";

describe("scope mapping privacy", () => {
  it("does not print mapped user or context values", () => {
    const secret = "SENTINEL_PRIVATE_CHAT_CONTEXT_8e5f44";
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const group = jest
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => undefined);

    try {
      const result = mapScopeToInstance(
        { customer_note: secret },
        { customer_note: "note" },
        [{ name: "note", defaultValue: null }],
        [],
      );

      expect(result.variableValues.note).toBe(secret);
      expect(log).not.toHaveBeenCalled();
      expect(group).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      group.mockRestore();
    }
  });
});
