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
  assertGuardResolvesOff,
  assertHeaderAgreesWithFlag,
  basedOnFunctionNames,
  nonAdditiveReasons,
  readHeader,
  TargetRefusal,
  topLevelStatements,
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
    basedOnNames: basedOnFunctionNames(sql),
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
    // The ALLOW-LIST quotes the statement it refused (ATTACK-6 finding 2).
    const message = refusal(`-- target: production\n-- additive: yes\n-- guard: custom/k\n${DROP}`);
    expect(message).toContain("not one of the enumerated ADDITIVE shapes");
    expect(message).toContain("drop table platform.associations");
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
    // The ALLOW-LIST names and QUOTES the statement it refused (ATTACK-6 finding 2):
    // the exemption admits the REVOKE and nothing else.
    expect(message).toContain("drop table custom.things");
    expect(message).not.toContain("revoke usage on schema custom");
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

// ── ATTACK-6 finding 2: "additive" is an ALLOW-LIST ─────────────────────────

/**
 * The exact eight bodies ATTACK-6 put through `nonAdditiveReasons`.
 *
 * Measured against the pre-fix library, every one returned `[]` — including
 * `GRANT USAGE ON SCHEMA custom TO authenticated`, which is switch-checklist step 3,
 * the statement the OFF switch's whole security boundary consists of REVOKING. A file
 * headed `-- target: branch,production` + `-- additive: yes` +
 * `-- guard: custom/system_enabled` carrying it passed header agreement, passed the
 * additive scan and passed `assert_guard_resolves_off`: every mechanical check said OFF
 * while schema `custom` stood open to every signed-in user. Policies are OR'd, so
 * `CREATE POLICY … USING (true)` is literally additive and opens every row it names.
 *
 * Restore the blacklist in scripts/lib/migration-target.ts and all eight go RED.
 */
const EIGHT: ReadonlyArray<readonly [string, string]> = [
  ["GRANT USAGE ON SCHEMA custom TO authenticated;", "a GRANT"],
  [
    "CREATE POLICY open ON platform.associations FOR SELECT USING (true);",
    "CREATE POLICY with a `true` predicate",
  ],
  ["ALTER TABLE platform.associations DISABLE ROW LEVEL SECURITY;", "DISABLE ROW LEVEL SECURITY"],
  ["ALTER TABLE platform.associations DISABLE TRIGGER trg_x;", "DISABLE TRIGGER"],
  ["ALTER POLICY p ON iam.permissions USING (true);", "ALTER POLICY"],
  [
    "CREATE OR REPLACE FUNCTION iam.has_access_for_base() RETURNS bool LANGUAGE sql AS $$ select true $$;",
    "declares no `-- based-on:`",
  ],
  [
    "ALTER DEFAULT PRIVILEGES IN SCHEMA custom GRANT ALL ON TABLES TO anon;",
    "ALTER DEFAULT PRIVILEGES … GRANT",
  ],
  ["ALTER FUNCTION x() SECURITY DEFINER;", "no enumerated additive shape"],
];

describe("the eight privilege-widening shapes are refused with the statement named (ATTACK-6 finding 2)", () => {
  it.each(EIGHT)("refuses %s", (body, needle) => {
    const reasons = nonAdditiveReasons(body);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.join("\n")).toContain(needle);
    // "with the statement named" is the requirement, not just the reason.
    expect(reasons.join("\n").toLowerCase()).toContain(body.split(" ")[0]!.toLowerCase());
  });

  it.each(EIGHT)("refuses %s inside a real campaign header", (body) => {
    expect(() =>
      judge(
        `-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n${body}\n`,
      ),
    ).toThrow(/not one of the enumerated ADDITIVE shapes/);
  });
});

describe("the allow-list still admits what the campaign actually writes", () => {
  // An allow-list that refuses everything is not a guard: this is the positive control.
  const ALLOWED = [
    "create schema if not exists custom;",
    "create table if not exists custom.record (id uuid primary key);",
    "create unique index if not exists ix_r on custom.record (id);",
    "create type custom.kind as enum ('a','b');",
    "alter table custom.record add column note text;",
    "alter table custom.record add column n int not null default 0;",
    "alter table custom.record enable row level security;",
    "create policy p on custom.record for select using (org_id = any (iam.accessible_entity_ids()));",
    "insert into platform.feature_knob (feature, key) values ('custom','system_enabled');",
    "alter default privileges in schema custom revoke all on tables from anon;",
    "comment on table custom.record is 'the record';",
    "set local lock_timeout = '3s';",
    "create function custom.fresh() returns int language sql as $$ select 1; $$;",
  ];
  it.each(ALLOWED)("admits %s", (body) => {
    expect(nonAdditiveReasons(body)).toEqual([]);
  });

  it("splits statements without cutting a dollar-quoted body in half", () => {
    expect(
      topLevelStatements("create function f() returns int language sql as $$ select 1; $$;"),
    ).toHaveLength(1);
  });

  it("admits a replacement that declares the body it was written against", () => {
    const sql =
      "-- based-on: iam.accessible_entity_ids(uuid) " +
      "0000000000000000000000000000000000000000000000000000000000000000\n" +
      "create or replace function iam.accessible_entity_ids(p uuid) returns setof uuid " +
      "language sql as $$ select 1 $$;";
    expect(nonAdditiveReasons(strip(sql), { basedOnNames: basedOnFunctionNames(sql) })).toEqual([]);
  });

  it("refuses the SAME replacement when the based-on line is missing", () => {
    const sql =
      "create or replace function iam.accessible_entity_ids(p uuid) returns setof uuid " +
      "language sql as $$ select 1 $$;";
    expect(nonAdditiveReasons(sql, { basedOnNames: basedOnFunctionNames(sql) })).toHaveLength(1);
  });
});

describe("a guarded body must READ its guard (ATTACK-6 finding 2, second half)", () => {
  // Nothing compared the `-- guard:` key to the body, so a CREATE OR REPLACE FUNCTION
  // that replaced a live SECURITY DEFINER body and never read the knob satisfied every
  // mechanical check. `public._provision_new_user_personal_org()` is the trigger every
  // signup runs.
  const HEAD = "-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n";
  const BASED_ON =
    "-- based-on: public._provision_new_user_personal_org() " +
    "0000000000000000000000000000000000000000000000000000000000000000\n";
  const body = (inner: string) =>
    `create or replace function public._provision_new_user_personal_org() returns trigger ` +
    `language plpgsql security definer as $$ begin ${inner} return new; end $$;`;

  it("refuses a replacement whose body never names its guard", () => {
    expect(() => judge(HEAD + BASED_ON + body(""))).toThrow(/never names custom\/system_enabled/);
  });

  it("admits the SAME body when it reads the knob", () => {
    const inner =
      "if not platform.knob_resolve('custom', 'system_enabled', null) then return new; end if;";
    expect(judge(HEAD + BASED_ON + body(inner))).toBeTruthy();
  });

  it("does not ask a file that replaces nothing to read its guard", () => {
    expect(judge(HEAD + "create table if not exists custom.record (id uuid primary key);")).toBeTruthy();
  });
});

describe("the schema-`custom` exemption does not cover a RETURNS TRIGGER function", () => {
  // Postgres resolves a trigger's function by OID at fire time, not by schema
  // privilege — a `custom.*` function already bound with `CREATE TRIGGER … ON
  // platform.associations … EXECUTE FUNCTION custom.job_status_sync()` (a7-02) is a live path
  // the moment that trigger exists, so revoking schema `custom` stops nothing. A LATER
  // file that replaces that function's body must still read its guard, exactly as if
  // it were outside `custom`.
  const HEAD = "-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n";
  const TRIGGER_BASED_ON =
    "-- based-on: custom.job_status_sync() " +
    "0000000000000000000000000000000000000000000000000000000000000000\n";
  const triggerFn = (inner: string) =>
    `create or replace function custom.job_status_sync() returns trigger ` +
    `language plpgsql as $$ begin ${inner} return new; end $$;\n`;
  const PROJECTION_BASED_ON =
    "-- based-on: custom.job_summary_projection(uuid) " +
    "0000000000000000000000000000000000000000000000000000000000000000\n";
  const projectionFn =
    "create or replace function custom.job_summary_projection(p_organization_id uuid) returns jsonb " +
    "language sql stable as $$ select '{}'::jsonb $$;\n";

  it("refuses a custom.* RETURNS TRIGGER replacement whose body never names its guard", () => {
    expect(() => judge(HEAD + TRIGGER_BASED_ON + triggerFn(""))).toThrow(
      /never names custom\/system_enabled/,
    );
  });

  it("admits the SAME trigger-returning replacement when the body reads the knob", () => {
    const inner =
      "if not platform.knob_resolve('custom', 'system_enabled', null)::boolean then return new; end if;";
    expect(judge(HEAD + TRIGGER_BASED_ON + triggerFn(inner))).toBeTruthy();
  });

  it("still exempts an ordinary (non-trigger-returning) custom.* function replacement", () => {
    expect(judge(HEAD + PROJECTION_BASED_ON + projectionFn)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTACK-7 — the two runners had two judgements. These are the rules that changed,
// as unit cases; `pnpm check:migration-judgment` proves the OTHER runner agrees
// with every one of them over migrations/judgment-corpus/.
// ─────────────────────────────────────────────────────────────────────────────
describe("ATTACK-7 finding 2 — `-- chair-step:` waives nothing on a header that names production", () => {
  const CHAIR = "-- chair-step: the abort checklist's step; it is not additive and the chair is awake\n";

  it("refuses a file carrying BOTH a production-naming header and a chair step", () => {
    const sql = "-- target: branch,production\n" + CHAIR + DROP;
    for (const target of ["branch", "production"] as const) {
      let code = "";
      try {
        judge(sql, target);
      } catch (e) {
        code = (e as TargetRefusal).code;
      }
      expect(code).toBe("chair-step-names-production");
    }
  });

  it("lets a header-LESS chair step rehearse on the branch, from the same bytes", () => {
    const v = assertHeaderAgreesWithFlag({
      filename: "f.sql",
      flagTarget: "branch",
      header: readHeader(CHAIR + DROP),
      strippedSql: strip(CHAIR + DROP),
      alreadyLedgered: false,
    });
    expect(v.chairStep?.why).toContain("abort checklist");
  });

  it("still refuses a header-less file with NO chair step on the branch", () => {
    let code = "";
    try {
      assertHeaderAgreesWithFlag({
        filename: "f.sql",
        flagTarget: "branch",
        header: readHeader(DROP),
        strippedSql: strip(DROP),
        alreadyLedgered: false,
      });
    } catch (e) {
      code = (e as TargetRefusal).code;
    }
    expect(code).toBe("branch-needs-target-header");
  });
});

describe("ATTACK-7 finding 3 — a new trigger on a live table must name its guard", () => {
  const HEAD = "-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n";
  const fn = (inner: string) =>
    `create function custom.job_status_sync() returns trigger language plpgsql as $$ begin ${inner} return new; end $$;\n`;
  const trg = (table: string) =>
    `create trigger job_status_sync_trg before insert on ${table} for each row execute function custom.job_status_sync();\n`;

  it("refuses the ATTACK-7 probe: a trigger on platform.associations whose file never names the knob", () => {
    let code = "";
    try {
      judge(HEAD + fn("") + trg("platform.associations"));
    } catch (e) {
      code = (e as TargetRefusal).code;
    }
    expect(code).toBe("trigger-guard-unnamed");
  });

  it("admits the SAME trigger when the function reads the knob", () => {
    const inner =
      "if not platform.knob_resolve('custom', 'system_enabled', null)::boolean then return new; end if;";
    expect(judge(HEAD + fn(inner) + trg("platform.associations"))).toBeTruthy();
  });

  it("exempts schema `custom`, which nothing reads until the switch", () => {
    expect(judge(HEAD + fn("") + trg("custom.job_widget"))).toBeTruthy();
  });

  it("treats an UNQUALIFIED table as outside custom — search_path decides it at run time", () => {
    expect(() => judge(HEAD + fn("") + trg("associations"))).toThrow(/creates a trigger on a live table/);
  });
});

describe("ATTACK-7 finding 3 — platform.entity_types is a branch fixture, not a production mint", () => {
  const HEAD = "-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n";
  const INSERT = "insert into platform.entity_types (token, rls_variant) values ('custom:job_status', 'entity');\n";

  it("refuses the INSERT at --target production", () => {
    expect(() => judge(HEAD + INSERT, "production")).toThrow(/MINTS A LIVE ENTITY TOKEN/);
  });

  it("admits the same INSERT at --target branch", () => {
    expect(judge(HEAD + INSERT, "branch")).toBeTruthy();
  });

  it("still admits an INSERT into the knob register at both targets", () => {
    const knob =
      "insert into platform.feature_knob (feature, key, value) values ('custom', 'job_status_flag', 'false'::jsonb);\n";
    expect(judge(HEAD + knob, "production")).toBeTruthy();
    expect(judge(HEAD + knob, "branch")).toBeTruthy();
  });
});

describe("every judgement refusal carries a stable code — the corpus compares codes, not prose", () => {
  it("names the code on a header-flag disagreement", () => {
    let code = "";
    try {
      judge("-- target: branch\ncreate table custom.t (id int);\n", "production");
    } catch (e) {
      code = (e as TargetRefusal).code;
    }
    expect(code).toBe("header-flag-disagree");
  });

  it("names the code on an allow-list refusal", () => {
    let code = "";
    try {
      judge(
        "-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n" +
          "grant usage on schema custom to authenticated;\n",
      );
    } catch (e) {
      code = (e as TargetRefusal).code;
    }
    expect(code).toBe("not-additive");
  });
});

describe("CHAIR RULING 2026-09-17 — the custom-data INSERT, bounded four ways", () => {
  // `INSERT INTO custom.<table>` was refused at production by "not one of the registry
  // tables", and that refusal was wrong for this ONE class: schema `custom` is created by
  // the campaign, revoked from every client role, absent from `pgrst.db_schemas` and held
  // shut by `custom/system_enabled`, so the row is unreachable by every client and the
  // file's stored inverse removes it. The allowance is bounded by the schema being EXACTLY
  // `custom`, by a `custom/…` guard, by the row's SOURCE, and by ON CONFLICT DO NOTHING.
  const HEAD = "-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n";
  const VALUES = "insert into custom.record (id, data) values (1, '{}'::jsonb);\n";

  it("admits a VALUES insert at BOTH targets", () => {
    expect(judge(HEAD + VALUES, "production")).toBeTruthy();
    expect(judge(HEAD + VALUES, "branch")).toBeTruthy();
  });

  it("admits ON CONFLICT DO NOTHING and refuses ON CONFLICT DO UPDATE", () => {
    const nothing =
      "insert into custom.record (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;\n";
    expect(judge(HEAD + nothing, "production")).toBeTruthy();
    const update =
      "insert into custom.record (id, data) values (1, '{}'::jsonb) " +
      "on conflict (id) do update set data = excluded.data;\n";
    expect(refusal(HEAD + update)).toContain("ON CONFLICT");
  });

  it("refuses a SELECT out of a live schema — that would COPY CUSTOMER DATA", () => {
    const body = "insert into custom.record (id, data) select p.id, to_jsonb(p) from crm.party p;\n";
    expect(refusal(HEAD + body)).toContain("crm.party");
  });

  it("admits a SELECT that stays inside custom.*", () => {
    const body =
      "insert into custom.record (id, data) select t.id, '{}'::jsonb from custom.table_def t;\n";
    expect(judge(HEAD + body, "production")).toBeTruthy();
  });

  it("refuses the same INSERT with no guard, and under a guard outside the custom feature", () => {
    let code = "";
    try {
      judge("-- target: branch,production\n-- additive: yes\n" + VALUES);
    } catch (e) {
      code = (e as TargetRefusal).code;
    }
    expect(code).toBe("production-no-guard");
    const foreign = "-- target: branch,production\n-- additive: yes\n-- guard: platform/job_status_knob\n";
    expect(refusal(foreign + VALUES)).toContain("custom-data INSERT is admitted only under");
  });

  it.each([
    ["the schema must be EXACTLY custom", "insert into customx.record (id) values (1);\n"],
    [
      "a quoted `custom.record` is ONE identifier in whatever schema search_path picks",
      'insert into "custom.record" (id) values (1);\n',
    ],
    ['"Custom" is a DIFFERENT schema — quoting preserves the capital', 'insert into "Custom".record (id) values (1);\n'],
    ["`custom` as a TABLE name in a live schema", "insert into platform.custom (id) values (1);\n"],
  ])("refuses the near miss: %s", (_what, body) => {
    let code = "";
    try {
      judge(HEAD + body);
    } catch (e) {
      code = (e as TargetRefusal).code;
    }
    expect(code).toBe("not-additive");
  });

  it.each([
    ["update custom.record set data = '{}'::jsonb where id = 1;\n"],
    ["delete from custom.record where id = 1;\n"],
  ])("leaves UPDATE/DELETE on custom.* refused: %s", (body) => {
    let code = "";
    try {
      judge(HEAD + body);
    } catch (e) {
      code = (e as TargetRefusal).code;
    }
    expect(code).toBe("not-additive");
  });

  it("carries the admitted statements so the runner ANNOUNCES them", () => {
    const verdict = judge(HEAD + VALUES, "production");
    expect(verdict.customDataInserts).toHaveLength(1);
    expect(verdict.customDataInserts[0]).toContain("custom.record");
  });
});

// ── STORE-ON 2026-09-23 — THE ONE BOUNDED EXCEPTION TO "the guard must resolve OFF" ────────
//
// `assertGuardResolvesOff` refuses a guarded production file whose knob does not resolve
// `false`, so a file landing behind a switch cannot change a path anybody is on. Arman ruled
// the record store's default ON on 2026-09-23, so `custom/system_enabled` resolves `true` —
// and every campaign file headed `-- guard: custom/system_enabled` would have been refused
// for ever, with no remedy but undoing the ruling. A knob the OWNER threw is ANNOUNCED, not
// refused. Everything else about the gate is unchanged, which is what these tests pin.
//
// Empty `KNOBS_THE_OWNER_TURNED_ON` in scripts/lib/migration-target.ts and the first test
// goes RED; drop the `KNOBS_THE_OWNER_TURNED_ON.includes(id)` condition and the second does.
// The same four properties are pinned in aidream's
// db/tests/test_migration_target_refusals.py, because the two runners must agree.
describe("STORE-ON — a guard the owner has ruled ON is announced, not refused", () => {
  const answering = (v: string | null) => async () => ({ rows: [{ v }] });

  it("accepts each knob the owner turned on, and SAYS the apply is live", async () => {
    const written: string[] = [];
    const realWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (chunk: string) => {
      written.push(String(chunk));
      return true;
    };
    try {
      for (const id of [
        "custom/system_enabled",
        "custom/code_paths_enabled",
        "data_tables.relation/relation_columns_enabled",
      ]) {
        const [feature, key] = [id.slice(0, id.lastIndexOf("/")), id.slice(id.lastIndexOf("/") + 1)];
        await expect(
          assertGuardResolvesOff(answering("true"), { feature, key }, "f.sql"),
        ).resolves.toBe("owner-on");
      }
    } finally {
      (process.stderr as unknown as { write: typeof realWrite }).write = realWrite;
    }
    const printed = written.join("");
    expect(printed.match(/the owner turned this switch ON/g) ?? []).toHaveLength(3);
    expect(printed).toContain("LIVE");
  });

  it("still refuses an unlisted knob that resolves true, and names the exception", async () => {
    await expect(
      assertGuardResolvesOff(answering("true"), { feature: "custom", key: "associations_guard" }, "f.sql"),
    ).rejects.toThrow(/resolves true, not false/);
    await expect(
      assertGuardResolvesOff(answering("true"), { feature: "custom", key: "associations_guard" }, "f.sql"),
    ).rejects.toThrow(/KNOBS_THE_OWNER_TURNED_ON/);
  });

  it("still refuses a listed knob whose answer is neither true nor false", async () => {
    await expect(
      assertGuardResolvesOff(answering(null), { feature: "custom", key: "system_enabled" }, "f.sql"),
    ).rejects.toThrow(/resolves \(nothing\), not false/);
  });

  it("still accepts a knob that resolves false, with nothing printed", async () => {
    await expect(
      assertGuardResolvesOff(answering("false"), { feature: "custom", key: "associations_guard" }, "f.sql"),
    ).resolves.toBe("off");
  });
});

