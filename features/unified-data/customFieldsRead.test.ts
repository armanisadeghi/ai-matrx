import { customFieldsScopeFromRecord } from "./customFieldsRead";
import { providerOwnsCustomFields } from "@ai-matrx/chat/surfaces/runtime/custom-field-targets";

describe("custom fields: one owner per surface", () => {
  it("maps the store's answer to the scope value, leaving withheld fields out", () => {
    const out = customFieldsScopeFromRecord("note", "n1", {
      fields: [
        { key: "client", label: "Client", type: "text" },
        { key: "ssn", label: "SSN", type: "text", hidden: { reason: "x" } },
      ],
      custom: { client: "Rincon" },
    });
    expect(out).toEqual([
      { entity: "note", record_id: "n1", fields: [{ name: "Client", key: "client", type: "text", value: "Rincon" }] },
    ]);
  });
  it("notes is provider-owned; a section there contributes no value", () => {
    expect(providerOwnsCustomFields("matrx-user/notes")).toBe(true);
    expect(providerOwnsCustomFields("matrx-user/message-template")).toBe(false);
  });
});
