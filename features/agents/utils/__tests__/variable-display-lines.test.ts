// The Expert must never see a UUID (CLAUDE.md § The user), and an id the user
// cannot open is banned by THE DOOR LAW too. Both rules live in one function,
// so they get one test — a regression here is a developer-leakage incident on
// every surface at once, not a cosmetic slip.

import { buildVariableDisplayLines } from "../variable-display-lines";

const RULEBOOK_ID = "56d96d67-c266-4d0f-b826-f6f4fff4ed66";

describe("buildVariableDisplayLines", () => {
  it("turns a wired record id into an entity line, never text", () => {
    const [line, ...rest] = buildVariableDisplayLines({
      rulebook_id: RULEBOOK_ID,
    });
    expect(rest).toHaveLength(0);
    expect(line.entity).toEqual({ token: "rulebook", id: RULEBOOK_ID });
    // The label loses the `_id` suffix — "Rulebook", not "Rulebook Id".
    expect(line.label).toBe("Rulebook");
    // The id must never reach a text field; that is what got printed.
    expect(line.text).toBe("");
  });

  it("drops a bare id that resolves to no openable entity", () => {
    expect(
      buildVariableDisplayLines({ mystery_id: RULEBOOK_ID }),
    ).toHaveLength(0);
    expect(buildVariableDisplayLines({ whatever: RULEBOOK_ID })).toHaveLength(0);
  });

  it("keeps ordinary user-authored values as text", () => {
    const lines = buildVariableDisplayLines({ user_name: "Mike", age: 26 });
    expect(lines.map((l) => [l.label, l.text])).toEqual([
      ["User Name", "Mike"],
      ["Age", "26"],
    ]);
    expect(lines.every((l) => l.entity === null)).toBe(true);
  });

  it("drops system-reserved keys and empty values", () => {
    expect(
      buildVariableDisplayLines({
        __agent_user_input__: "the message body",
        blank: "",
        nothing: null,
        empty_list: [],
      }),
    ).toHaveLength(0);
  });

  it("never emits a UUID anywhere in a rendered line", () => {
    const lines = buildVariableDisplayLines({
      rulebook_id: RULEBOOK_ID,
      mystery_id: RULEBOOK_ID,
      topic: "surgical documentation",
    });
    for (const line of lines) {
      expect(`${line.label} ${line.text}`).not.toContain(RULEBOOK_ID);
    }
  });
});
