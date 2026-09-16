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

/** The `auth.users` entry of `COPY_TABLES`, as source text. */
function authUsersEntry(source: string): string | null {
  const start = source.indexOf(`table: "auth.users"`);
  if (start < 0) return null;
  // The entry ends where the next entry of the list begins. Every entry in
  // COPY_TABLES opens with `table: "` — including the one after this.
  const next = source.indexOf(`table: "`, start + 10);
  return source.slice(start, next < 0 ? source.length : next);
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

function disclosure(entry: string): string {
  const m = entry.match(/columnsNote:\s*([\s\S]*?),\n {4}\/\*\*/);
  return m ? m[1]! : "";
}

/**
 * Every way `restore-graph.ts` can stop being an id-only shell. An empty array
 * is the contract held.
 */
export function checkIdentityShell(source: string): IdentityShellViolation[] {
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

  const note = disclosure(entry);
  if (!note) {
    v.push({
      code: "no-disclosure",
      detail: `auth.users has no columnsNote, so the run announces nothing about what it took.`,
    });
  } else {
    for (const c of Object.keys(synth)) {
      if (!note.includes(c)) {
        v.push({
          code: "disclosure-omits-a-synthesised-column",
          detail:
            `the run's disclosure never names "${c}", which is synthesised rather than copied. ` +
            `A disclosure that is true about the columns it names and silent about the rest is ` +
            `how 336 addresses were taken while the terminal said "shell".`,
        });
      }
    }
  }
  return v;
}

/** The live file. */
export function checkRestoreGraphFile(path: string): IdentityShellViolation[] {
  return checkIdentityShell(readFileSync(path, "utf8"));
}
