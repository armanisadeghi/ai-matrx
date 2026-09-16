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
import { checkIdentityShell, checkRestoreGraphFile } from "../gate-corpus/identity-shell-contract";

const RESTORE = resolve(__dirname, "..", "gate-corpus", "restore-graph.ts");

/** The live entry's shape, with one thing swapped per fixture. */
function entry(opts: {
  columns: string[];
  synthesize?: Record<string, string>;
  note?: string;
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
    `    /** trailing */\n    notOurs: true,\n  },\n  { table: "auth.oauth_clients" },\n];\n`
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
    expect(v.map((x) => x.code).sort()).toEqual([
      "copies-an-identifying-column",
      "copies-an-identifying-column",
      "copies-an-identifying-column",
      "shell-is-not-marked-unusable",
    ]);
    expect(v.map((x) => x.detail).join("\n")).toContain('copies "email"');
  });

  it("catches a single identifying column slipped back into the copy set", () => {
    const v = checkIdentityShell(entry({ ...SHELL, columns: [...SHELL.columns, "phone"] }));
    expect(v.map((x) => x.code)).toEqual(["copies-an-identifying-column"]);
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
      `const COPY_TABLES = [\n  { table: "auth.users", policy: "upsert" },\n  { table: "auth.oauth_clients" },\n];\n`,
    );
    expect(v.map((x) => x.code)).toEqual(["auth-users-is-not-a-shell"]);
  });
});
