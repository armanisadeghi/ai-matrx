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

// ── ATTACK-5 finding 4 — ALTER DEFAULT PRIVILEGES … REVOKE ────────────────────
// §6.3 states OFF-switch fact two as REVOKE ALL ON SCHEMA custom and ON ALL TABLES
// IN SCHEMA custom "with ALTER DEFAULT PRIVILEGES so a later table inherits it".
// The parser read that statement's subject as the bare word `tables`, called it
// unqualified, refused the whole file — and told the builder to rewrite it in a
// syntax ALTER DEFAULT PRIVILEGES does not accept. W1-STORE is lane five on the
// critical path; the route a blocked builder finds next is a header-less file.
describe("ALTER DEFAULT PRIVILEGES … REVOKE is attributed to its schema (ATTACK-5 finding 4)", () => {
  const withAllows = (body: string) =>
    `${REVOKE_HEAD}-- allows: revoke custom\n${body}`;

  it("accepts `alter default privileges in schema custom revoke … on tables`", () => {
    const v = judge(
      withAllows(
        "revoke all on schema custom from anon;\n" +
          "alter default privileges in schema custom revoke all on tables from anon, authenticated;\n",
      ),
    );
    expect(v.revokeExemption?.schema).toBe("custom");
    const adp = v.revokeExemption!.statements.find((s) => /default privileges/i.test(s.text))!;
    expect(adp.schemas).toEqual(["custom"]);
    expect(adp.unqualified).toEqual([]);
  });

  it("accepts the `on functions` and `for role` forms too", () => {
    for (const body of [
      "alter default privileges in schema custom revoke all on functions from anon;\n",
      "alter default privileges in schema custom revoke all on sequences from anon;\n",
      "alter default privileges for role postgres in schema custom revoke all on tables from anon;\n",
    ]) {
      expect(judge(withAllows(body)).revokeExemption?.schema).toBe("custom");
    }
  });

  it("STILL refuses one that names a different schema", () => {
    expect(
      refusal(
        withAllows("alter default privileges in schema public revoke all on tables from anon;\n"),
      ),
    ).toContain("does not stay inside it");
  });

  it("STILL refuses a database-wide one that names no schema at all", () => {
    const message = refusal(
      withAllows("alter default privileges revoke all on tables from anon;\n"),
    );
    expect(message).toContain("does not stay inside it");
    expect(message).toContain("no IN SCHEMA");
  });

  it("the refusal's remedy is now syntax that exists", () => {
    const message = refusal(
      withAllows("revoke select on associations from authenticated;\n"),
    );
    expect(message).toContain("ALTER DEFAULT PRIVILEGES IN SCHEMA custom REVOKE");
  });
});

// ── ATTACK-5 finding 3 — the header-less file on production ───────────────────
// `named === null` was exempt from every production check in both runners, by
// design, so rule 8 and §4.9 described a runner that did not exist. History keeps
// its amnesty; a file that has never run does not.
describe("a header-less UNLEDGERED file is judged on production (ATTACK-5 finding 3)", () => {
  const unledgered = (sql: string) =>
    assertHeaderAgreesWithFlag({
      filename: "f.sql",
      flagTarget: "production",
      header: readHeader(sql),
      strippedSql: strip(sql),
      alreadyLedgered: false,
    });

  const refuseUnledgered = (sql: string): string => {
    try {
      unledgered(sql);
    } catch (e) {
      if (e instanceof TargetRefusal) return e.message;
      throw e;
    }
    throw new Error(`expected a TargetRefusal, but the file was ACCEPTED:\n${sql}`);
  };

  it("refuses ALTER TYPE … ADD VALUE with no header at all — rule 9's `no exception`", () => {
    const message = refuseUnledgered(
      "alter type public.permission_level add value 'commenter';\n",
    );
    expect(message).toContain("NO `-- target:` header");
    expect(message).toContain("ALTER TYPE … ADD VALUE");
  });

  it("refuses a header-less DROP, REVOKE, TRUNCATE and DELETE", () => {
    for (const [body, reason] of [
      [DROP, "a DROP"],
      ["revoke usage on schema custom from authenticated;\n", "a REVOKE"],
      ["truncate table custom.t;\n", "a TRUNCATE"],
      ["delete from custom.t where id = 1;\n", "a DELETE"],
    ] as const) {
      expect(refuseUnledgered(body)).toContain(reason);
    }
  });

  it("still ACCEPTS an ordinary additive header-less migration", () => {
    expect(
      unledgered("create table custom.t (id int);\ncreate index on custom.t (id);\n").chairStep,
    ).toBeNull();
  });

  it("gives frozen history its amnesty — the SAME bytes, already ledgered, pass", () => {
    expect(
      assertHeaderAgreesWithFlag({
        filename: "f.sql",
        flagTarget: "production",
        header: readHeader(DROP),
        strippedSql: strip(DROP),
        alreadyLedgered: true,
      }).chairStep,
    ).toBeNull();
  });

  it("lets `-- chair-step:` through, and hands the runner the body to print", () => {
    const sql =
      "-- chair-step: §11.0b, the one deliberately irreversible act, owner awake\n" +
      "alter type public.permission_level add value 'commenter';\n";
    const v = unledgered(sql);
    expect(v.chairStep?.why).toContain("§11.0b");
    expect(v.chairStep?.reasons).toContain("ALTER TYPE … ADD VALUE");
  });

  it("refuses a `-- chair-step:` that does not say why", () => {
    let message = "";
    try {
      readHeader("-- chair-step: because\n");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("does not say why");
  });

  it("names the rehearsal directory when it refuses a branch-only file", () => {
    expect(refusal("-- target: branch\ncreate table custom.t (id int);\n")).toContain(
      "migrations/rehearsal/",
    );
  });
});
