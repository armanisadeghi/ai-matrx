/**
 * V0's `W0-DATA` FAIL — `restore-graph.ts` must copy `auth.users` as an ID-ONLY
 * shell, and this is the guard that says so without a database.
 *
 * The RED half below is not a hypothetical: every fixture in it is the shape the
 * file actually had at `HEAD` before this change, which put 336 real production
 * email addresses and 336 user-metadata blobs on a rehearsal branch with a
 * public PostgREST API. Reinstate any one of them in the live file and the first
 * test goes RED.
 *
 * No database, no credential, no connection.
 */
import { resolve } from "node:path";
import {
  checkAuthSecretColumns,
  checkIdentityShell,
  checkRestoreGraphFile,
} from "../gate-corpus/identity-shell-contract";

const RESTORE = resolve(__dirname, "..", "gate-corpus", "restore-graph.ts");

/**
 * `auth.oauth_clients` as the live file now spells it — the SECOND auth table
 * of the copy set, compliant unless a fixture replaces it. Every `auth.*` entry
 * is audited, so the auth.users fixtures need a clean sibling or every one of
 * them would also report the sibling's violation.
 */
const OAUTH_OK =
  `  {\n    table: "auth.oauth_clients",\n    policy: "upsert",\n` +
  `    columns: [\n      "id",\n      "client_secret_hash",\n      "client_name",\n` +
  `      "token_endpoint_auth_method",\n    ],\n` +
  `    synthesize: {\n      client_secret_hash: \`'NO-PRODUCTION-SECRET-WAS-COPIED'\`,\n    },\n` +
  `    columnsNote:\n      "NO CREDENTIAL IS COPIED. SYNTHESISED: client_secret_hash",\n` +
  `    notOurs: true,\n  },\n`;

/** The live entry's shape, with one thing swapped per fixture. */
function entry(opts: {
  columns: string[];
  synthesize?: Record<string, string>;
  note?: string;
  oauth?: string;
}): string {
  const synth = opts.synthesize
    ? `    synthesize: {\n` +
      Object.entries(opts.synthesize)
        .map(([k, e]) => `      ${k}: ${e},`)
        .join("\n") +
      `\n    },\n`
    : "";
  const note =
    opts.note === undefined
      ? `    columnsNote:\n      "ID-ONLY SHELL. ${Object.keys(opts.synthesize ?? {}).join(" ")}",\n`
      : opts.note === ""
        ? ""
        : `    columnsNote:\n      "${opts.note}",\n`;
  return (
    `const COPY_TABLES = [\n  {\n    table: "auth.users",\n    policy: "upsert",\n` +
    `    columns: [\n${opts.columns.map((c) => `      "${c}",`).join("\n")}\n    ],\n` +
    synth +
    note +
    `    /** trailing */\n    notOurs: true,\n  },\n` +
    (opts.oauth ?? OAUTH_OK) +
    `];\n`
  );
}

const SHELL = {
  columns: ["id", "instance_id", "aud", "role", "email", "raw_app_meta_data", "raw_user_meta_data", "banned_until"],
  synthesize: {
    email: "`'u-' || left(\"id\"::text, 8) || '@corpus.invalid'`",
    raw_user_meta_data: "`'{}'::jsonb`",
    raw_app_meta_data: "`'{}'::jsonb`",
    banned_until: "`timestamptz '9999-12-31 00:00:00+00'`",
  },
};

describe("the live restore-graph.ts copies auth.users as an id-only shell", () => {
  it("has no violation at all", () => {
    expect(checkRestoreGraphFile(RESTORE)).toEqual([]);
  });
});

describe("the RED half — every way the 336-address failure comes back", () => {
  it("catches the exact shape that shipped: email and both metadata blobs copied", () => {
    const v = checkIdentityShell(
      entry({
        columns: ["id", "aud", "role", "email", "raw_app_meta_data", "raw_user_meta_data", "banned_until"],
        note: "shell — every password, token and email/phone-change column is left unset",
      }),
    );
    // `email` trips BOTH arms — the auth.users identity rule and the auth-wide
    // secret deny-list — which is the point: two independent readings of the
    // same source have to agree before a copy of a person's address is legal.
    expect(v.map((x) => x.code).sort()).toEqual([
      "copies-a-secret-column",
      "copies-an-identifying-column",
      "copies-an-identifying-column",
      "copies-an-identifying-column",
      "shell-is-not-marked-unusable",
    ]);
    expect(v.map((x) => x.detail).join("\n")).toContain('copies "email"');
  });

  it("catches a single identifying column slipped back into the copy set", () => {
    const v = checkIdentityShell(entry({ ...SHELL, columns: [...SHELL.columns, "phone"] }));
    expect(v.map((x) => x.code)).toEqual(["copies-an-identifying-column", "copies-a-secret-column"]);
    expect(v[0]!.detail).toContain('"phone"');
  });

  it("catches a synthetic address that is not in the reserved corpus domain", () => {
    const v = checkIdentityShell(
      entry({
        ...SHELL,
        synthesize: { ...SHELL.synthesize, email: "`'u-' || left(\"id\"::text, 8) || '@example.com'`" },
      }),
    );
    expect(v.map((x) => x.code)).toEqual(["synthetic-email-is-not-corpus-invalid"]);
  });

  it("catches a synthetic address every row would share", () => {
    const v = checkIdentityShell(
      entry({ ...SHELL, synthesize: { ...SHELL.synthesize, email: "`'shell@corpus.invalid'`" } }),
    );
    expect(v.map((x) => x.code)).toEqual(["synthetic-email-is-not-per-row"]);
  });

  it("catches metadata that is synthesised to something other than {}", () => {
    const v = checkIdentityShell(
      entry({
        ...SHELL,
        synthesize: { ...SHELL.synthesize, raw_user_meta_data: '`jsonb_build_object(\'name\', "id")`' },
      }),
    );
    expect(v.map((x) => x.code)).toEqual(["synthetic-metadata-is-not-empty"]);
  });

  it("catches a shell GoTrue would still treat as a sign-in candidate", () => {
    const { banned_until: _dropped, ...rest } = SHELL.synthesize;
    const v = checkIdentityShell(
      entry({ columns: SHELL.columns.filter((c) => c !== "banned_until"), synthesize: rest }),
    );
    expect(v.map((x) => x.code)).toEqual(["shell-is-not-marked-unusable"]);
  });

  it("catches a disclosure that is silent about a column it made up", () => {
    const v = checkIdentityShell(entry({ ...SHELL, note: "shell — no password is copied" }));
    expect(v.map((x) => x.code)).toEqual([
      "disclosure-omits-a-synthesised-column",
      "disclosure-omits-a-synthesised-column",
      "disclosure-omits-a-synthesised-column",
      "disclosure-omits-a-synthesised-column",
    ]);
  });

  it("catches auth.users copied with no shell at all", () => {
    const v = checkIdentityShell(
      `const COPY_TABLES = [\n  { table: "auth.users", policy: "upsert" },\n` + OAUTH_OK + `];\n`,
    );
    expect(v.map((x) => x.code)).toEqual([
      "auth-users-is-not-a-shell",
      "auth-table-has-no-column-list",
    ]);
  });
});

/**
 * THE CHAIR'S RULING, 2026-09-16: no secret or credential column is ever read
 * from production into the branch, on ANY `auth.*` table the copy touches.
 *
 * The first fixture below is the LIVE SHAPE OF `auth.oauth_clients` AT
 * `a2117adc0b`, character for character — `{ table, policy, notOurs }`, no
 * column list, no filter — which put 87 production `client_secret_hash` values
 * on a branch with a public PostgREST API while `checkIdentityShell` returned
 * `[]`, because it audited `auth.users` alone.
 */
describe("the auth-wide secret deny-list — the RED half", () => {
  const usersOk =
    `const COPY_TABLES = [\n  {\n    table: "auth.users",\n    policy: "upsert",\n` +
    `    columns: [\n${SHELL.columns.map((c) => `      "${c}",`).join("\n")}\n    ],\n` +
    `    synthesize: {\n` +
    Object.entries(SHELL.synthesize)
      .map(([k, e]) => `      ${k}: ${e},`)
      .join("\n") +
    `\n    },\n    columnsNote:\n      "ID-ONLY SHELL. ${Object.keys(SHELL.synthesize).join(" ")}",\n` +
    `    notOurs: true,\n  },\n`;
  const withOauth = (oauth: string) => usersOk + oauth + `];\n`;

  it("catches the shape that shipped: auth.oauth_clients copied whole", () => {
    const v = checkAuthSecretColumns(
      withOauth(`  { table: "auth.oauth_clients", policy: "upsert", notOurs: true },\n`),
    );
    expect(v.map((x) => x.code)).toEqual(["auth-table-has-no-column-list"]);
    expect(v[0]!.detail).toContain("auth.oauth_clients");
    expect(v[0]!.detail).toContain("client_secret_hash");
  });

  it("catches a named secret column copied straight from production", () => {
    const v = checkAuthSecretColumns(
      withOauth(
        `  {\n    table: "auth.oauth_clients",\n    policy: "upsert",\n` +
          `    columns: [\n      "id",\n      "client_secret_hash",\n    ],\n  },\n`,
      ),
    );
    expect(v.map((x) => x.code)).toEqual(["copies-a-secret-column"]);
    expect(v[0]!.detail).toContain('"client_secret_hash"');
  });

  it("catches a credential stand-in derived from the production row", () => {
    const v = checkAuthSecretColumns(
      withOauth(
        `  {\n    table: "auth.oauth_clients",\n    policy: "upsert",\n` +
          `    columns: [\n      "id",\n      "client_secret_hash",\n    ],\n` +
          `    synthesize: {\n      client_secret_hash: \`md5("client_secret_hash")\`,\n    },\n` +
          `    columnsNote:\n      "client_secret_hash is not copied",\n  },\n`,
      ),
    );
    expect(v.map((x) => x.code)).toEqual(["synthetic-credential-is-not-a-constant"]);
  });

  it("catches a secret-bearing column on an auth table nobody has added yet", () => {
    const v = checkAuthSecretColumns(
      withOauth(
        OAUTH_OK +
          `  {\n    table: "auth.flow_state",\n    policy: "upsert",\n` +
          `    columns: [\n      "id",\n      "provider_refresh_token",\n    ],\n  },\n`,
      ),
    );
    expect(v.map((x) => x.code)).toEqual(["copies-a-secret-column"]);
    expect(v[0]!.detail).toContain("auth.flow_state");
  });

  it("catches an auth entry that synthesises a column its disclosure never names", () => {
    const v = checkAuthSecretColumns(
      withOauth(
        `  {\n    table: "auth.oauth_clients",\n    policy: "upsert",\n` +
          `    columns: [\n      "id",\n      "client_secret_hash",\n    ],\n` +
          `    synthesize: {\n      client_secret_hash: \`'constant'\`,\n    },\n` +
          `    columnsNote:\n      "nothing sensitive was copied",\n  },\n`,
      ),
    );
    expect(v.map((x) => x.code)).toEqual(["disclosure-omits-a-synthesised-column"]);
  });

  it("says so when COPY_TABLES names no auth table at all", () => {
    expect(
      checkAuthSecretColumns(`const COPY_TABLES = [\n  { table: "iam.organizations" },\n];\n`).map(
        (x) => x.code,
      ),
    ).toEqual(["no-auth-entries"]);
  });

  it("lets an exempt column through, and only because NOT_A_SECRET names it", () => {
    expect(checkAuthSecretColumns(withOauth(OAUTH_OK))).toEqual([]);
    const v = checkAuthSecretColumns(
      withOauth(OAUTH_OK.replace('"token_endpoint_auth_method"', '"token_endpoint_auth_style"')),
    );
    expect(v.map((x) => x.code)).toEqual(["copies-a-secret-column"]);
  });
});
