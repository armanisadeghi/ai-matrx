import { readFileSync } from "node:fs";
import { join } from "node:path";

const executeInstanceSource = readFileSync(
  join(__dirname, "../../thunks/execute-instance.thunk.ts"),
  "utf8",
);

describe("input-capability post-turn persistence contract", () => {
  it("reconciles durable conversation overrides after the stream closes", () => {
    const streamCompletion = executeInstanceSource.indexOf(
      "const result = await runAiStream({",
    );
    const postTurnPersistence = executeInstanceSource.indexOf(
      "await dispatch(persistInputCapabilities({ conversationId }))",
    );

    expect(streamCompletion).toBeGreaterThan(-1);
    expect(postTurnPersistence).toBeGreaterThan(streamCompletion);
    expect(executeInstanceSource).toContain("if (!isEphemeral) {");
  });
});
