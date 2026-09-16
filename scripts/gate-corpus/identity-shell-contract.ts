/**
 * THE IDENTITY-SHELL CONTRACT — read out of `restore-graph.ts`'s own source.
 *
 * WHY IT EXISTS (V0's `W0-DATA` FAIL, 2026-09-16). `restore-graph.ts` copies
 * `auth.users` from production onto the rehearsal branch, and BUILD-BOOK's
 * `W0-DATA` row says it takes those rows "as id-only shell rows — no email, no
 * password hash, no metadata". The code said something else: `email`,
 * `raw_user_meta_data` and `raw_app_meta_data` were in the copy set, under a
 * comment that redefined "shell" as "no authentication secret". The measured
 * result was 336 real production email addresses — staff and several hundred
 * customers — and 336 metadata blobs sitting on a second database with a
 * PostgREST API on the public internet, while the build log recorded the lane
 * DONE. The book's words and the code's words were two different contracts and
 * the code's was wider.
 *
 * So the contract is now MACHINE-READ FROM THE CODE, and a column that names a
 * person can only be written by an expression that makes its value up. This
 * module reads text and nothing else: no database, no credential, no connection.
 *
 * The RED proof is the previous revision of the file. At matrx-frontend
 * `HEAD` before this change, `checkIdentityShell` returns:
 *
 *   copies-an-identifying-column      (email)
 *   copies-an-identifying-column      (raw_app_meta_data)
 *   copies-an-identifying-column      (raw_user_meta_data)
 *   shell-is-not-marked-unusable      (banned_until)
 *
 * Put any one of those columns back into `columns` without a `synthesize`
 * entry and the live-file test goes RED again.
 *
 * WHY IT COVERS EVERY `auth.*` TABLE (chair's ruling, 2026-09-16, after V0's
 * re-verify §R6). The fix above left the class open: this module audited
 * `auth.users` and nothing else, so `auth.oauth_clients` — in `COPY_TABLES`
 * with no column list and no filter — put **87 `client_secret_hash` values** on
 * the branch while every guard read green. The ruling is one sentence: **no
 * secret or credential column is ever read from production into the branch.**
 * It is enforced here as a column-NAME DENY-LIST (`*secret*`, `*token*`,
 * `*hash*`, `*password*`, `phone`, `email`) over EVERY `auth.*` entry of the
 * copy set, with one exact-keyed, reasoned exemption list (`NOT_A_SECRET`) and
 * nothing else. A pattern covers the table nobody has added yet; a census
 * covers only the tables somebody remembered.
 *
 * Its RED proof is the same shape: at `a2117adc0b`, `checkAuthSecretColumns`
 * returns `auth-table-has-no-column-list` for `auth.oauth_clients`.
 */
import { readFileSync } from "node:fs";

export interface IdentityShellViolation {
  readonly code: string;
  readonly detail: string;
}

/**
 * Columns of `auth.users` that NAME OR AUTHENTICATE A PERSON. Any one of them
 * may be copied only if the copy replaces its value — the list is deliberately
 * wider than what the script copies today, so that adding one back is a
 * decision the guard sees rather than a diff nobody reads.
 */
export const IDENTIFYING_COLUMNS: readonly string[] = [
  "email",
  "phone",
  "raw_user_meta_data",
  "raw_app_meta_data",
  "encrypted_password",
  "confirmation_token",
  "recovery_token",
  "reauthentication_token",
  "email_change",
  "email_change_token_new",
  "email_change_token_current",
  "phone_change",
  "phone_change_token",
] as const;

/** The marker that makes GoTrue itself refuse a shell, not just the missing hash. */
const UNUSABLE_MARKER = "banned_until";

/**
 * THE SECRET DENY-LIST — the chair's ruling of 2026-09-16, in one place:
 * **no secret or credential column is ever read from production into the
 * branch**, on ANY `auth.*` table the copy touches, not just `auth.users`.
 *
 * It is written as NAME PATTERNS rather than a column census because the census
 * is what failed: `identity-shell-contract.ts` knew every column of
 * `auth.users` and nothing at all about `auth.oauth_clients`, whose
 * `client_secret_hash` was copied 87 times onto a branch with a public
 * PostgREST API while every guard read green (V0 re-verify §R6). A pattern
 * covers the table nobody has added yet.
 */
export const SECRET_COLUMN_PATTERNS: readonly { readonly pattern: RegExp; readonly what: string }[] =
  [
    { pattern: /secret/, what: "a secret" },
    { pattern: /password/, what: "a password" },
    { pattern: /hash/, what: "a hash of a credential" },
    { pattern: /token/, what: "a token" },
    { pattern: /email/, what: "an email address" },
    { pattern: /phone/, what: "a phone number" },
  ] as const;

/**
 * The patterns above whose match is a CREDENTIAL rather than an identifier. A
 * credential's stand-in must be a CONSTANT: an expression derived from the row
 * would carry the real value's shape (its length, its cost factor, whether two
 * rows share one) across the wire, which is the thing the ruling forbids. An
 * address may be derived from the id, because it must stay unique.
 */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [/secret/, /password/, /hash/, /token/];

/**
 * 🚨 THE ONLY WAY PAST THE DENY-LIST, and every entry costs a written reason.
 *
 * A column whose NAME matches a pattern but which carries no secret and names
 * no person. Keyed `<schema>.<table>.<column>`, exact — never a pattern, so
 * widening this is one line per column in a diff a reviewer cannot miss.
 */
export const NOT_A_SECRET: Readonly<Record<string, string>> = {
  "auth.users.email_confirmed_at":
    "a timestamp. It says WHEN a row confirmed an address, never what the address is, and " +
    "GoTrue reads it to decide whether the identity is confirmed at all.",
  "auth.oauth_clients.token_endpoint_auth_method":
    "an OAuth 2.0 protocol constant naming HOW a client authenticates " +
    "('client_secret_basic' / 'none'), not a credential. It is NOT NULL with no default, and " +
    "the extension and desktop lanes read it back.",
} as const;

/** The `COPY_TABLES` literal, as source text — nothing else in the file counts. */
function copyTablesBlock(source: string): string | null {
  const m = source.match(/const COPY_TABLES[^[]*\[/);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  const end = source.indexOf("\n];", start);
  return source.slice(start, end < 0 ? source.length : end);
}

/** Every entry of `COPY_TABLES`, as `{ table, text }`. */
function copyEntries(source: string): { table: string; text: string }[] {
  const block = copyTablesBlock(source);
  if (block === null) return [];
  const out: { table: string; text: string }[] = [];
  const starts = [...block.matchAll(/table: "([a-z_]+\.[a-z_]+)"/g)];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]!.index!;
    const to = i + 1 < starts.length ? starts[i + 1]!.index! : block.length;
    out.push({ table: starts[i]![1]!, text: block.slice(from, to) });
  }
  return out;
}

/** The `auth.users` entry of `COPY_TABLES`, as source text. */
function authUsersEntry(source: string): string | null {
  return copyEntries(source).find((e) => e.table === "auth.users")?.text ?? null;
}

/** The names inside `columns: [ … ]`, comments and all stripped. */
function columnList(entry: string): string[] {
  const m = entry.match(/columns:\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1]!.matchAll(/"([a-z_]+)"/g)].map((x) => x[1]!);
}

/** `synthesize: { name: `expr`, … }` → name → the expression's source text. */
function synthesizeMap(entry: string): Record<string, string> {
  const m = entry.match(/synthesize:\s*\{([\s\S]*?)\n {4}\}/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const k = line.match(/^\s*([a-z_]+)\s*:\s*(.+?),?\s*$/);
    if (k) out[k[1]!] = k[2]!;
  }
  return out;
}

/**
 * The `columnsNote` string, however it is spelled. Line-based rather than
 * regex-to-the-next-`/**`, because the note is a run of `+`-joined literals and
 * what follows it differs per entry — and a disclosure this function could not
 * see would be reported as a MISSING disclosure, which is a guard crying wolf.
 */
function disclosure(entry: string): string {
  const lines = entry.split("\n");
  const at = lines.findIndex((l) => /^\s*columnsNote:/.test(l));
  if (at < 0) return "";
  const parts: string[] = [lines[at]!.replace(/^\s*columnsNote:/, "")];
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i]!;
    // The note continues while the line is an indented string literal (possibly
    // `+`-joined). Anything else — a new key, a comment, a closing brace — ends it.
    if (!/^\s*(\+\s*)?["'`]/.test(l)) break;
    parts.push(l);
  }
  return parts.join("\n");
}

/**
 * THE CHAIR'S RULING, over EVERY `auth.*` table of the copy set: no secret or
 * credential column is read from production into the branch, and a column whose
 * NAME says it holds one is copied only through a `synthesize` expression —
 * a CONSTANT one, for the credential half of the deny-list.
 */
export function checkAuthSecretColumns(source: string): IdentityShellViolation[] {
  const v: IdentityShellViolation[] = [];
  const auth = copyEntries(source).filter((e) => e.table.startsWith("auth."));
  if (auth.length === 0) {
    return [
      {
        code: "no-auth-entries",
        detail:
          `COPY_TABLES names no auth.* table at all — this guard cannot see what the copy takes ` +
          `out of production's auth schema.`,
      },
    ];
  }
  for (const { table, text } of auth) {
    const cols = columnList(text);
    if (cols.length === 0) {
      v.push({
        code: "auth-table-has-no-column-list",
        detail:
          `${table} names no \`columns\` list, so EVERY column production's ${table} has is ` +
          `copied — including any secret, token or address it grows later. An auth.* table is ` +
          `copied column by column or not at all. (This is exactly how 87 client_secret_hash ` +
          `values reached the branch.)`,
      });
      continue;
    }
    const synth = synthesizeMap(text);
    for (const c of cols) {
      const hit = SECRET_COLUMN_PATTERNS.find((p) => p.pattern.test(c));
      if (!hit) continue;
      if (NOT_A_SECRET[`${table}.${c}`]) continue;
      const e = synth[c];
      if (!e) {
        v.push({
          code: "copies-a-secret-column",
          detail:
            `${table} copies "${c}" straight from production, and its name says it holds ` +
            `${hit.what}. No secret or credential column is ever read from production into the ` +
            `branch: give it a \`synthesize\` expression, or — if it truly holds nothing secret ` +
            `— add "${table}.${c}" to NOT_A_SECRET with the reason.`,
        });
        continue;
      }
      if (CREDENTIAL_PATTERNS.some((p) => p.test(c)) && /"[a-z_]+"/.test(e)) {
        v.push({
          code: "synthetic-credential-is-not-a-constant",
          detail:
            `${table} synthesises "${c}" as ${e}, which reads a column of the production row. A ` +
            `credential's stand-in must be a CONSTANT — anything derived from the real value ` +
            `carries its shape across the wire.`,
        });
      }
    }
    if (Object.keys(synth).length) {
      const note = disclosure(text);
      if (!note) {
        v.push({
          code: "no-disclosure",
          detail: `${table} has no columnsNote, so the run announces nothing about what it took.`,
        });
      } else {
        for (const c of Object.keys(synth)) {
          if (!note.includes(c)) {
            v.push({
              code: "disclosure-omits-a-synthesised-column",
              detail:
                `${table}'s disclosure never names "${c}", which is synthesised rather than ` +
                `copied. A disclosure that is true about the columns it names and silent about ` +
                `the rest is how 336 addresses were taken while the terminal said "shell".`,
            });
          }
        }
      }
    }
  }
  return v;
}

/**
 * Every way `restore-graph.ts` can stop being an id-only shell. An empty array
 * is the contract held.
 */
export function checkIdentityShell(source: string): IdentityShellViolation[] {
  return [...authUsersShell(source), ...checkAuthSecretColumns(source)];
}

/** The `auth.users`-only half: what "id-only shell" means beyond the deny-list. */
function authUsersShell(source: string): IdentityShellViolation[] {
  const v: IdentityShellViolation[] = [];
  const entry = authUsersEntry(source);
  if (!entry) {
    return [
      {
        code: "no-auth-users-entry",
        detail: `COPY_TABLES has no auth.users entry — this guard cannot see what is copied.`,
      },
    ];
  }
  const cols = columnList(entry);
  if (cols.length === 0) {
    return [
      {
        code: "auth-users-is-not-a-shell",
        detail:
          `auth.users names no \`columns\` list, so EVERY column of production's auth.users is ` +
          `copied — every address, every metadata blob and every credential.`,
      },
    ];
  }
  const synth = synthesizeMap(entry);

  for (const c of cols.filter((x) => IDENTIFYING_COLUMNS.includes(x))) {
    if (!synth[c]) {
      v.push({
        code: "copies-an-identifying-column",
        detail:
          `auth.users copies "${c}" straight from production. A column that names or ` +
          `authenticates a person may only be written by a \`synthesize\` expression that makes ` +
          `its value up.`,
      });
    }
  }

  const email = synth.email;
  if (email && !email.includes("@corpus.invalid")) {
    v.push({
      code: "synthetic-email-is-not-corpus-invalid",
      detail:
        `auth.users synthesises email as ${email}, which does not land in the reserved ` +
        `@corpus.invalid domain the lane's exit clause allows.`,
    });
  }
  // `"id"`, quoted, not the bare letters — `'@corpus.invalid'` itself contains
  // "id" and would otherwise satisfy this on a constant.
  if (email && !email.includes(`"id"`)) {
    v.push({
      code: "synthetic-email-is-not-per-row",
      detail:
        `auth.users synthesises email as ${email}, which does not derive from the row's id — ` +
        `every shell would collide on auth.users's unique email index.`,
    });
  }
  for (const meta of ["raw_user_meta_data", "raw_app_meta_data"]) {
    const e = synth[meta];
    if (e && !e.includes("'{}'")) {
      v.push({
        code: "synthetic-metadata-is-not-empty",
        detail: `auth.users synthesises ${meta} as ${e}, which is not the empty object.`,
      });
    }
  }
  if (!synth[UNUSABLE_MARKER]) {
    v.push({
      code: "shell-is-not-marked-unusable",
      detail:
        `auth.users does not synthesise ${UNUSABLE_MARKER}, so "a copied identity cannot sign ` +
        `in" rests on the absence of a password hash alone. GoTrue must refuse the row itself.`,
    });
  }

  return v;
}

/** The live file. */
export function checkRestoreGraphFile(path: string): IdentityShellViolation[] {
  return checkIdentityShell(readFileSync(path, "utf8"));
}
