import { recoverUserArgs, userArgsSchema } from "../schemas";

describe("user tool argument recovery", () => {
  it("recovers the production action=notify discriminator slip", () => {
    const recovered = recoverUserArgs({
      action: "notify",
      level: "success",
      message: "Cerebras + Groq sync complete. Two items need your decision.",
    });

    expect(recovered.recoveredAlias).toBe("action_to_type");
    expect(recovered.args).toEqual({
      type: "notify",
      level: "success",
      message: "Cerebras + Groq sync complete. Two items need your decision.",
    });
    expect(userArgsSchema.safeParse(recovered.args).success).toBe(true);
  });

  it("does not reinterpret unknown actions or override canonical forms", () => {
    expect(
      recoverUserArgs({ action: "delete_everything", message: "no" }),
    ).toEqual({
      args: { action: "delete_everything", message: "no" },
      recoveredAlias: null,
    });
    expect(
      recoverUserArgs({ type: "confirm", action: "notify", question: "OK?" }),
    ).toEqual({
      args: { type: "confirm", action: "notify", question: "OK?" },
      recoveredAlias: null,
    });
  });
});
