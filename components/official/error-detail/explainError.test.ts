import { explainError, SHORT_FAILURE_LABEL } from "./explainError";

const ACTOR_SYSTEM_REFUSAL =
  'This write declares actor_tier=code, but names no official_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor-system on the client channel, or the app.actor_system GUC on a server channel!) — a person\'s write needs no system at all, but "an AI did it" with no name is not provenance. Table: agent_definition';

describe("explainError", () => {
  it("turns a provenance refusal into a human title and summary", () => {
    const explained = explainError(ACTOR_SYSTEM_REFUSAL);
    expect(explained.title).toBe("Couldn't save this change");
    expect(explained.summary).toMatch(/didn't record who made it/i);
    expect(explained.detail).toBe(ACTOR_SYSTEM_REFUSAL);
    expect(explained.title).not.toMatch(/actor_tier/);
  });

  it("names a permission refusal without dumping the SQL code as the title", () => {
    const explained = explainError(
      "42501 permission denied for table agent_definition",
    );
    expect(explained.title).toBe("You don't have permission for this");
    expect(explained.summary).toMatch(/refused the write/i);
  });

  it("keeps an unknown error's full text as the detail under a short title", () => {
    const raw = "PostgREST could not find the function replace_model_refs";
    const explained = explainError(raw);
    expect(explained.title).toBe("This didn't work");
    expect(explained.summary).toBeNull();
    expect(explained.detail).toBe(raw);
  });

  it("exposes a short row label that never contains the raw refusal", () => {
    expect(SHORT_FAILURE_LABEL).toBe("Couldn't replace");
    expect(SHORT_FAILURE_LABEL.includes("actor_tier")).toBe(false);
  });
});
