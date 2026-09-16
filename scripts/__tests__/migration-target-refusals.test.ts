/**
 * ATTACK-4 findings 3 and 4 — the production-header rule and the revoke exemption.
 *
 * Finding 3: `-- additive: yes`, `-- guard:` and the non-additive body scan used to
 * run only when the header named BOTH targets, so a file headed exactly
 * `-- target: production` carrying `DROP TABLE platform.associations` and no guard
 * reached production having passed NOTHING but the server-identity check.
 *
 * Finding 4: `REVOKE` is on the non-additive list by name, so the campaign's first
 * DDL file — which must `revoke usage on schema custom from authenticated` on
 * production — had no sanctioned path at all, and its only escape was exactly the
 * production-only file finding 3 let through unchecked.
 *
 * Revert either fix in scripts/lib/migration-target.ts and every test below goes RED.
 *
 * No database, no credential — these are the pure header checks, which is the whole
 * point: they refuse before anything opens.
 */
import {
  assertHeaderAgreesWithFlag,
  readHeader,
  TargetRefusal,
  type Target,
} from "../lib/migration-target";

const DROP = "drop table platform.associations;\n";

/** What the runner hands the header checks: the body with `--` comments gone. */
const strip = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const judge = (sql: string, flagTarget: Target = "production") =>
  assertHeaderAgreesWithFlag({
    filename: "f.sql",
    flagTarget,
    header: readHeader(sql),
    strippedSql: strip(sql),
  });

const refusal = (sql: string, flagTarget: Target = "production"): string => {
  try {
    judge(sql, flagTarget);
  } catch (e) {
    if (e instanceof TargetRefusal) return e.message;
    throw e;
  }
  throw new Error(`expected a TargetRefusal, but the file was ACCEPTED:\n${sql}`);
};

describe("a header that NAMES production is judged (ATTACK-4 finding 3)", () => {
  it("refuses a bare `-- target: production` file without `-- additive: yes`", () => {
    expect(refusal(`-- target: production\n${DROP}`)).toContain("without `-- additive: yes`");
  });

  it("refuses a bare `-- target: production` file without a guard", () => {
    expect(
      refusal("-- target: production\n-- additive: yes\ncreate table custom.t (id int);\n"),
    ).toContain("without a `-- guard:` line");
  });

  it("refuses a `-- target: production` file whose body holds a DROP, by name", () => {
    expect(
      refusal(`-- target: production\n-- additive: yes\n-- guard: custom/k\n${DROP}`),
    ).toContain("a DROP");
  });

  it("says out loud that header-less files are deliberately untouched", () => {
    expect(refusal(`-- target: production\n${DROP}`)).toContain(
      "with NO `-- target:` line is production-only",
    );
  });

  // 🚨 THE SCOPE BOUNDARY. ~3,567 migrations in these two repos carry no
  // `-- target:` line. They are production-only by definition, they already
  // landed, and this rule must never reach them.
  it("leaves a file with NO `-- target:` header exactly as it was", () => {
    expect(judge(DROP).guard).toBeNull();
    expect(judge("revoke usage on schema public from authenticated;\n").guard).toBeNull();
    expect(judge("truncate table platform.associations;\n").guard).toBeNull();
  });

  it("does not judge a branch-only header by the production rule", () => {
    expect(judge(`-- target: branch\n${DROP}`, "branch").guard).toBeNull();
  });

  // ORDER MATTERS: the contradiction must be the message an agent reads.
  it("fires the header-vs-flag disagreement BEFORE the additive requirement", () => {
    const message = refusal(`-- target: production\n${DROP}`, "branch");
    expect(message).toContain("file header: production");
    expect(message).toContain("command flag: branch");
    expect(message).not.toContain("without `-- additive: yes`");
  });

  it("accepts `-- seeds-guards: yes` in place of the guard, bounded to the register", () => {
    expect(
      judge(
        "-- target: production\n-- additive: yes\n-- seeds-guards: yes\n" +
          "insert into platform.feature_knob (feature, key) values ('a', 'b');\n",
      ).guard,
    ).toBeNull();
    expect(
      refusal(
        "-- target: production\n-- additive: yes\n-- seeds-guards: yes\n" +
          "insert into custom.stuff (id) values (1);\n",
      ),
    ).toContain("custom.stuff");
  });
});

const REVOKE_HEAD = "-- target: branch,production\n-- additive: yes\n-- guard: custom/k\n";

describe("`-- allows: revoke <schema>` (ATTACK-4 finding 4)", () => {
  it("refuses a REVOKE that carries no `-- allows:` line, by name", () => {
    const message = refusal(`${REVOKE_HEAD}revoke usage on schema custom from authenticated;\n`);
    expect(message).toContain("a REVOKE");
    expect(message).toContain("-- allows: revoke <schema>");
  });

  it("accepts the campaign's own revoke and reports it for announcement", () => {
    const v = judge(
      `${REVOKE_HEAD}-- allows: revoke custom\nrevoke usage on schema custom from authenticated;\n`,
    );
    expect(v.revokeExemption?.schema).toBe("custom");
    expect(v.revokeExemption?.statements).toHaveLength(1);
  });

  it("refuses the whole file when a REVOKE names another schema", () => {
    expect(
      refusal(
        `${REVOKE_HEAD}-- allows: revoke custom\nrevoke usage on schema public from authenticated;\n`,
      ),
    ).toContain("does not stay inside it");
  });

  it("refuses the whole file when a REVOKE names an unqualified object", () => {
    expect(
      refusal(
        `${REVOKE_HEAD}-- allows: revoke custom\nrevoke select on associations from authenticated;\n`,
      ),
    ).toContain("not schema-qualified");
  });

  it("accepts a qualified object inside the exempt schema", () => {
    expect(
      judge(
        `${REVOKE_HEAD}-- allows: revoke custom\nrevoke select on custom.things from authenticated;\n`,
      ).revokeExemption?.schema,
    ).toBe("custom");
  });

  it("refuses a protected schema by name, printing the list", () => {
    for (const schema of ["public", "auth", "platform", "iam", "storage"]) {
      let message = "";
      try {
        readHeader(`-- allows: revoke ${schema}\n`);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain("PROTECTED schema");
      expect(message).toContain("public, auth, iam, platform");
    }
  });

  it("excuses the REVOKE and NOTHING else", () => {
    const message = refusal(
      `${REVOKE_HEAD}-- allows: revoke custom\n` +
        "revoke usage on schema custom from authenticated;\ndrop table custom.things;\n",
    );
    expect(message).toContain("a DROP");
    expect(message).not.toContain("a REVOKE");
  });

  it("does not excuse `-- additive: yes` or `-- guard:`", () => {
    expect(
      refusal(
        "-- target: production\n-- allows: revoke custom\n" +
          "revoke usage on schema custom from authenticated;\n",
      ),
    ).toContain("without `-- additive: yes`");
  });

  it("refuses an exemption the body never uses", () => {
    expect(
      refusal(`${REVOKE_HEAD}-- allows: revoke custom\ncreate table custom.t (id int);\n`),
    ).toContain("no REVOKE at all");
  });

  it("refuses an `-- allows:` clause it does not know", () => {
    let message = "";
    try {
      readHeader("-- allows: drop custom\n");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("is not an `-- allows:` clause");
  });
});
