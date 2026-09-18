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
  "crm.contact_medium.phone_country":
    "an ISO country code ('US', 'GB'). It matches the deny-list's /phone/ pattern because the " +
    "word is in its name, and it is the one part of a telephone number that identifies a " +
    "COUNTRY rather than a subscriber. The number itself lives in value_raw / value_key / " +
    "display_value, all three of which are synthesised.",
  "auth.oauth_clients.token_endpoint_auth_method":
    "an OAuth 2.0 protocol constant naming HOW a client authenticates " +
    "('client_secret_basic' / 'none'), not a credential. It is NOT NULL with no default, and " +
    "the extension and desktop lanes read it back.",
} as const;


/**
 * 🚨 THE PERSONAL-DATA TABLES — DENY BY DEFAULT.
 *
 * `auth.users` taught this file one lesson and `auth.oauth_clients` taught it a
 * second: an ALLOW-list of forbidden names covers the column somebody
 * remembered, never the one they added. `crm.party` and the four tables its
 * record page reads are the first tables in the copy set whose subject IS a
 * person — 1,905 real parties, their names, birth dates, bios, addresses, phone
 * numbers and email addresses — so the rule on them is inverted: **every copied
 * column must be either SYNTHESISED or EXEMPT, and a column that is neither is a
 * violation.** Adding a column to one of these tables fails the guard until
 * somebody writes down which it is.
 *
 * THE CENSUS BELOW IS NOT THE GUARD'S ONLY DEFENCE AGAINST ITSELF. A declared
 * column list rots the moment production grows a column, and a stale list here
 * would read green while copying a person's new value. So `restore-graph.ts`
 * asserts at RUN TIME, against production's own catalogue, that each of these
 * tables has exactly these columns and refuses the whole copy when it does not
 * (`PERSONAL_DATA_TABLES` is imported there for exactly that). The list is the
 * text half of a claim whose other half is measured.
 */
export const PERSONAL_DATA_TABLES: Readonly<Record<string, readonly string[]>> = {
  "crm.party": [
    "id", "party_kind", "display_name", "sort_name", "name_key", "aka", "first_name",
    "middle_name", "last_name", "preferred_name", "name_prefix", "name_suffix", "pronouns",
    "date_of_birth", "headline", "legal_name", "primary_domain", "industry_id", "employee_band",
    "founded_year", "tax_id", "registration_number", "bio", "avatar_file_id", "timezone",
    "locale", "canonical_id", "source_party_id", "source_synced_at", "locked_fields",
    "expert_status", "claimed_by", "claimed_at", "assigned_to", "lifecycle_stage_id",
    "lifecycle_stage_changed_at", "became_customer_at", "rating_id", "source", "source_detail",
    "do_not_contact", "do_not_contact_reason", "linked_organization_id",
    "primary_employer_party_id", "job_title", "attributes", "organization_id", "created_by",
    "updated_by", "created_at", "updated_at", "deleted_at", "version", "metadata", "visibility",
    "record_class", "created_by_tier", "created_by_system", "updated_by_tier",
    "updated_by_system", "field_provenance",
  ],
  "crm.affiliation": [
    "id", "party_id", "employer_party_id", "title", "department", "seniority", "is_primary",
    "is_current", "start_date", "end_date", "source", "confidence", "organization_id",
    "created_at", "updated_at", "created_by", "updated_by", "deleted_at", "version", "metadata",
  ],
  "crm.contact_medium": [
    "id", "channel", "platform_slug", "value_raw", "value_key", "display_value", "external_id",
    "handle", "profile_url", "line_type", "phone_country", "calling_time_zone",
    "is_role_address", "mx_valid", "verification_status", "verified_at", "bounce_type",
    "bounce_count", "first_bounced_at", "last_bounced_at", "complaint_at", "unsubscribed_at",
    "dnc_state", "dnc_checked_at", "suppressed_at", "suppression_reason",
    "suppression_expires_at", "details", "organization_id", "created_by", "updated_by",
    "created_at", "updated_at", "deleted_at", "version", "metadata", "visibility",
    "is_contactable", "consent_basis", "consent_source", "consent_source_url",
    "consent_recorded_at", "consent_evidence_at", "consent_expires_at", "consent_jurisdiction",
    "consent_evidence", "subscriber_kind", "source_disclosed_at",
  ],
  "crm.address": [
    "id", "party_id", "purpose_code", "purpose_id", "label", "line1", "line2", "line3",
    "locality", "region", "postal_code", "plus4", "country_code", "formatted_address",
    "latitude", "longitude", "timezone", "place_id", "geo_source", "verification_status",
    "is_primary", "valid_from", "valid_to", "source", "organization_id", "created_at",
    "updated_at", "created_by", "updated_by", "deleted_at", "version", "metadata",
  ],
  "crm.party_contact_point": [
    "id", "party_id", "medium_id", "purpose_code", "purpose_id", "label", "extension",
    "is_primary", "is_identity_key", "affiliation_id", "address_id", "valid_from", "valid_to",
    "opt_out_at", "opt_out_source", "last_contacted_at", "source", "confidence", "sort_order",
    "organization_id", "created_at", "updated_at", "created_by", "updated_by", "deleted_at",
    "version", "metadata", "channel",
  ],
};

/**
 * STRUCTURALLY-NAMED COLUMNS, EXEMPT BY PATTERN — each with the reason its
 * shape, not its table, makes it safe. Without these the `NOT_PERSONAL` map
 * below would be 132 entries of "a uuid", which is a list nobody reads and
 * therefore a list that protects nobody. A uuid key, a clock reading, a flag or
 * a counter cannot carry a person's name.
 */
export const STRUCTURAL_EXEMPTIONS: readonly {
  readonly pattern: RegExp;
  readonly why: string;
}[] = [
  { pattern: /^id$/, why: "the primary key the whole copy is keyed on" },
  { pattern: /_id$/, why: "a uuid key, never a value a person typed" },
  { pattern: /_at$/, why: "a clock reading, not a fact about a person" },
  { pattern: /^is_/, why: "a flag with two values" },
  { pattern: /_count$/, why: "a counter" },
  { pattern: /^version$/, why: "the optimistic-concurrency counter" },
  { pattern: /^visibility$/, why: "the platform's own visibility enum" },
  { pattern: /^sort_order$/, why: "an ordering integer" },
  { pattern: /^position$/, why: "an ordering integer" },
  { pattern: /^confidence$/, why: "a 0–100 score our own matcher wrote" },
  { pattern: /_seconds$/, why: "a duration" },
  {
    pattern: /^(valid_from|valid_to|start_date|end_date)$/,
    why: "a validity date — when a row applied, never who it applies to",
  },
  { pattern: /^founded_year$/, why: "a year an ORGANIZATION was founded" },
  { pattern: /^do_not_contact$/, why: "a boolean suppression flag" },
  { pattern: /^attempt_number$/, why: "a counter" },
  { pattern: /^mx_valid$/, why: "a boolean: whether a domain had an MX record" },
];

/**
 * 🚨 THE 45 COLUMNS THAT ARE NEITHER SYNTHESISED NOR STRUCTURAL, each with the
 * reason it names nobody. Exact keys, `<schema>.<table>.<column>` — never a
 * pattern, so widening this is one line per column in a diff a reviewer cannot
 * miss. Most are controlled vocabularies the CHECK constraints on these tables
 * enforce, which is why they cannot be made up: a stand-in would raise 23514.
 */
export const NOT_PERSONAL: Readonly<Record<string, string>> = {
  // ── crm.party
  "crm.party.party_kind":
    "one of exactly two words, 'person' or 'organization', enforced by " +
    "party_party_kind_check — and the two facet CHECK constraints are written against " +
    "it, so it cannot be made up.",
  "crm.party.employee_band":
    "a size bucket of the employer, not of a person.",
  "crm.party.timezone":
    "an IANA zone name; it names a region of the earth, not a person, and REC-40's read " +
    "returns it.",
  "crm.party.locale":
    "a BCP 47 language tag ('en-US'). It names a language and a region, which billions of " +
    "people share.",
  "crm.party.locked_fields":
    "a text[] of COLUMN NAMES of this table — the governance guard reads it — never a " +
    "value.",
  "crm.party.expert_status":
    "one of 'registered' / 'approved' / 'vetted', enforced by " +
    "party_expert_status_check.",
  "crm.party.claimed_by":
    "the uuid of the USER who claimed the profile — a foreign key into auth.users, " +
    "whose own rows are id-only shells on this branch. It says who did something, never " +
    "who the row is about.",
  "crm.party.assigned_to":
    "the uuid of the USER the record is assigned to — a foreign key into auth.users, " +
    "not a fact about the party.",
  "crm.party.source":
    "the name of the SYSTEM a row came from, never who it is about.",
  "crm.party.created_by":
    "a uuid foreign key into auth.users naming WHO wrote the row — auth.users is copied " +
    "here as id-only shells, so it names nobody.",
  "crm.party.updated_by":
    "a uuid foreign key into auth.users naming WHO last wrote the row — the same " +
    "id-only shells; it is a fact about our system, not about the person.",
  "crm.party.record_class":
    "'contact' or 'discovered', enforced by party_record_class_check.",
  "crm.party.created_by_tier":
    "which provenance tier wrote the row — code, ai or human. A fact about our own writer.",
  "crm.party.created_by_system":
    "the name of the system that wrote the row.",
  "crm.party.updated_by_tier":
    "which provisioning tier last wrote the row.",
  "crm.party.updated_by_system":
    "the name of the system that last wrote the row.",
  // ── crm.affiliation
  "crm.affiliation.seniority":
    "a seniority band, a controlled vocabulary of about six words.",
  "crm.affiliation.source":
    "the name of the SYSTEM a row came from — an importer, a scraper, a form — never who " +
    "the row is about.",
  "crm.affiliation.created_by":
    "a uuid foreign key into auth.users naming WHO wrote the row — auth.users is copied " +
    "here as id-only shells, so it names nobody.",
  "crm.affiliation.updated_by":
    "a uuid foreign key into auth.users naming WHO last wrote the row — the same " +
    "id-only shells; it is a fact about our system, not about the person.",
  // ── crm.contact_medium
  "crm.contact_medium.channel":
    "'email' / 'phone' / 'social' — WHICH kind of medium, never the medium itself.",
  "crm.contact_medium.platform_slug":
    "the social platform's name ('linkedin'), not the account on it.",
  "crm.contact_medium.line_type":
    "'mobile' / 'landline' / 'voip' — what KIND of line the number is, never the number.",
  "crm.contact_medium.phone_country":
    "an ISO country code — the dialling COUNTRY, not the subscriber. The number itself is in " +
    "value_raw / value_key / display_value, all synthesised.",
  "crm.contact_medium.calling_time_zone":
    "an IANA zone name ('America/Chicago') — a region of the earth, read to decide when it is " +
    "polite to call.",
  "crm.contact_medium.verification_status":
    "a controlled vocabulary of verification outcomes.",
  "crm.contact_medium.bounce_type":
    "'hard' / 'soft' — how a delivery failed, a fact about our own sending.",
  "crm.contact_medium.dnc_state":
    "a do-not-call registry verdict.",
  "crm.contact_medium.created_by":
    "a uuid foreign key into auth.users naming WHO wrote the row — auth.users is copied " +
    "here as id-only shells, so it names nobody.",
  "crm.contact_medium.updated_by":
    "a uuid foreign key into auth.users naming WHO last wrote the row — the same " +
    "id-only shells; it is a fact about our system, not about the person.",
  "crm.contact_medium.consent_basis":
    "the legal basis word ('consent', 'legitimate_interest').",
  "crm.contact_medium.consent_jurisdiction":
    "a jurisdiction code ('US-CA', 'EU') — WHICH law governs the consent, not who gave it.",
  "crm.contact_medium.subscriber_kind":
    "'individual' / 'business' — which consent regime applies to the medium.",
  // ── crm.address
  "crm.address.purpose_code":
    "which SLOT the address fills ('billing', 'home'), never where it is.",
  "crm.address.country_code":
    "an ISO 3166 country code — the one part of an address that identifies nobody.",
  "crm.address.geo_source":
    "the name of the GEOCODER that resolved the address, never the address it resolved.",
  "crm.address.verification_status":
    "a controlled vocabulary of verification outcomes.",
  "crm.address.source":
    "the name of the SYSTEM a row came from — an importer, a scraper, a form — never who " +
    "the row is about.",
  "crm.address.created_by":
    "a uuid foreign key into auth.users naming WHO wrote the row — auth.users is copied " +
    "here as id-only shells, so it names nobody.",
  "crm.address.updated_by":
    "a uuid foreign key into auth.users naming WHO last wrote the row — the same " +
    "id-only shells; it is a fact about our system, not about the person.",
  // ── crm.party_contact_point
  "crm.party_contact_point.purpose_code":
    "which SLOT the point fills ('work', 'home'), never the point itself.",
  "crm.party_contact_point.source":
    "the name of the SYSTEM a row came from — an importer, a scraper, a form — never who " +
    "the row is about.",
  "crm.party_contact_point.created_by":
    "a uuid foreign key into auth.users naming WHO wrote the row — auth.users is copied " +
    "here as id-only shells, so it names nobody.",
  "crm.party_contact_point.updated_by":
    "a uuid foreign key into auth.users naming WHO last wrote the row — the same " +
    "id-only shells; it is a fact about our system, not about the person.",
  "crm.party_contact_point.channel":
    "'email' / 'phone' — WHICH kind of point; contact_point_primary_key is unique over " +
    "it.",
};

/**
 * DENY BY DEFAULT over `PERSONAL_DATA_TABLES`: on a table whose subject is a
 * person, a copied column is SYNTHESISED, or STRUCTURAL, or has a written reason
 * in `NOT_PERSONAL` — and anything else is a violation with the person's real
 * value already on the wire.
 */
export function checkPersonalDataTables(source: string): IdentityShellViolation[] {
  const v: IdentityShellViolation[] = [];
  const entries = new Map(copyEntries(source).map((e) => [e.table, e.text]));
  for (const [table, census] of Object.entries(PERSONAL_DATA_TABLES)) {
    const text = entries.get(table);
    if (text === undefined) {
      v.push({
        code: "personal-table-is-not-in-the-copy-set",
        detail:
          `${table} is declared a personal-data table but COPY_TABLES no longer names it. Either ` +
          `it stopped being copied — in which case delete it from PERSONAL_DATA_TABLES and say so ` +
          `— or the entry was renamed and this guard is now watching nothing.`,
      });
      continue;
    }
    // A `columns` shell would mean the census below is not what gets copied, and
    // this guard would be judging a list the run does not use.
    const shell = columnList(text);
    if (shell.length) {
      v.push({
        code: "personal-table-has-a-shell-list",
        detail:
          `${table} declares a \`columns\` shell list. This guard judges the FULL column census ` +
          `in PERSONAL_DATA_TABLES; a shell means the two disagree about what is copied, and the ` +
          `disagreement is where a personal column hides. Copy the whole table (synthesised) or ` +
          `teach this guard about shells.`,
      });
      continue;
    }
    const synth = synthesizeMap(text);
    const note = disclosure(text);
    for (const c of census) {
      if (synth[c]) {
        if (note && !note.includes(c))
          v.push({
            code: "disclosure-omits-a-synthesised-column",
            detail:
              `${table}'s disclosure never names "${c}", which is synthesised rather than copied.`,
          });
        continue;
      }
      if (STRUCTURAL_EXEMPTIONS.some((s) => s.pattern.test(c))) continue;
      if (NOT_PERSONAL[`${table}.${c}`]) continue;
      v.push({
        code: "copies-a-personal-column",
        detail:
          `${table} copies "${c}" straight from production, and ${table} is a table whose subject ` +
          `is a PERSON. On these tables a column is synthesised, or structural, or carries a ` +
          `written reason in NOT_PERSONAL. "${c}" is none of the three, so this copy would put ` +
          `1,905 real values on a rehearsal branch with a public PostgREST API.`,
      });
    }
    if (Object.keys(synth).length && !note) {
      v.push({
        code: "no-disclosure",
        detail: `${table} has no columnsNote, so the run announces nothing about what it took.`,
      });
    }
  }
  return v;
}

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
  const starts = [...block.matchAll(/table: "([a-z0-9_]+\.[a-z0-9_]+)"/g)];
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
  return [...m[1]!.matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]!);
}

/** `synthesize: { name: `expr`, … }` → name → the expression's source text. */
function synthesizeMap(entry: string): Record<string, string> {
  const m = entry.match(/synthesize:\s*\{([\s\S]*?)\n {4}\}/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const k = line.match(/^\s*([a-z0-9_]+)\s*:\s*(.+?),?\s*$/);
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
  // THE SAME DENY-LIST, OVER THE PERSONAL-DATA TABLES. `crm.*` is not `auth.*`,
  // but a `password_hash` or an `api_token` column added to `crm.party`
  // tomorrow is the same failure with a different schema name — and it would be
  // caught by the new deny-by-default rule only until somebody wrote it a
  // reason. Refusing it by NAME as well means the old rule still covers the
  // table nobody has thought about yet. The auth-only arms above (a missing
  // `columns` list, the shell contract) deliberately do NOT run here: these
  // tables are copied whole, on purpose, and `checkPersonalDataTables` is what
  // judges their census.
  for (const { table, text } of copyEntries(source)) {
    if (!(table in PERSONAL_DATA_TABLES)) continue;
    const synth = synthesizeMap(text);
    for (const c of PERSONAL_DATA_TABLES[table]!) {
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
            `branch — the rule is not about the auth schema, it is about the column.`,
        });
        continue;
      }
      if (CREDENTIAL_PATTERNS.some((p) => p.test(c)) && /"[a-z_]+"/.test(e)) {
        v.push({
          code: "synthetic-credential-is-not-a-constant",
          detail:
            `${table} synthesises "${c}" as ${e}, which reads a column of the production row. A ` +
            `credential's stand-in must be a CONSTANT.`,
        });
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
  const source = readFileSync(path, "utf8");
  // `checkPersonalDataTables` is deliberately NOT part of `checkIdentityShell`:
  // it judges the WHOLE live copy set against a declared census, so it reports a
  // missing table — which is meaningless against the miniature fixtures the auth
  // arms are tested with, and would drown their assertions in noise. The live
  // file is judged by all three.
  return [...checkIdentityShell(source), ...checkPersonalDataTables(source)];
}
