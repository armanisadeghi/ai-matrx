import { chairStepRefusal, confirmChairStep, parseChairStepConfirmations } from "../lib/chair-step";

describe("db:rehearse chair-step confirmations", () => {
  it("keeps repeatable confirmation values out of the migration positional and forwards each exact basename", () => {
    const argv = [
      "migrations/rehearsal/harbor-dental-up.sql",
      "--target", "clone",
      "--confirm-chair-step", "migrations/inverse/harbor-dental-down.sql",
      "--confirm-chair-step=another-down.sql",
    ];
    const parsed = parseChairStepConfirmations(argv);
    const valueIndexes = new Set([2, ...parsed.valueIndexes]);
    const positional = argv.filter((token, index) => !token.startsWith("--") && !valueIndexes.has(index));

    expect(positional).toEqual(["migrations/rehearsal/harbor-dental-up.sql"]);
    expect(parsed.names).toEqual(["harbor-dental-down.sql", "another-down.sql"]);
    expect(parsed.forwardedArgs).toEqual([
      "--confirm-chair-step", "harbor-dental-down.sql",
      "--confirm-chair-step", "another-down.sql",
    ]);
  });

  it("still refuses an unnamed inverse even when a different leg was explicitly confirmed", async () => {
    const parsed = parseChairStepConfirmations(["--confirm-chair-step", "harbor-dental-up.sql"]);

    await expect(confirmChairStep("harbor-dental-down.sql", "DROP obsolete intake index", parsed.names))
      .resolves.toBe(chairStepRefusal("harbor-dental-down.sql", "DROP obsolete intake index"));
  });
});
