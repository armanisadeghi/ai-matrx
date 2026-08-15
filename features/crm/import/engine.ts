// features/crm/import/engine.ts
//
// The contact import engine: native file parse → auto-map → dry-run plan → commit.
//
// Division of labor (FEATURE.md: service.ts owns ALL crm reads/writes):
//   * parse/guess/plan assembly here are pure over their inputs;
//   * every DB touch — the bulk dedup lookups and the commit writes — goes
//     through features/crm/service.ts. Nothing in this file imports supabase.
//
// Dedup doctrine (dry-run):
//   * People dedupe on identity VALUES — a normalized email or phone already
//     owned by a live party in the org (`findExistingMediumOwners`). Names are
//     too weak to skip a person on.
//   * Companies dedupe on exact domain, then case-insensitive exact name.
//   * Within the file, the first row wins an identity; later rows are marked
//     `duplicate_in_file` so one CSV can never create the same person twice.

import Papa from "papaparse";
import type { PartyKind, PartyRef } from "../types";
import {
  addAffiliation,
  addContactPoint,
  createParty,
  findExistingMediumOwners,
  findOrCreateCompanyByName,
  findPartiesByDomains,
  findPartiesByNames,
  normalizeMediumValue,
  updateParty,
} from "../service";
import type {
  ImportField,
  ImportMapping,
  ImportPlan,
  ImportResult,
  ParsedImportData,
  RowPlan,
  RowResult,
} from "./types";
import { ORG_IMPORT_FIELDS, PERSON_IMPORT_FIELDS } from "./types";

// ── Parse ───────────────────────────────────────────────────────────────────

const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;

function detectSourceLabel(
  headers: string[],
  format: ParsedImportData["format"],
): string {
  if (format === "vcard") return "vCard contacts";
  const normalized = new Set(headers.map(normalizeHeader));
  const has = (...values: string[]) =>
    values.every((value) => normalized.has(value));
  if (has("givenname", "familyname", "email1value")) return "Google Contacts";
  if (has("firstname", "lastname", "emailaddress", "businessphone")) {
    return "Microsoft Outlook";
  }
  if (normalized.has("contactid") && normalized.has("accountname"))
    return "Salesforce";
  if (normalized.has("recordid") && normalized.has("contactowner"))
    return "HubSpot";
  if (has("firstname", "lastname", "company", "position", "connectedon")) {
    return "LinkedIn connections";
  }
  if (format === "xlsx" || format === "xls") return "Excel workbook";
  return format === "tsv" ? "tab-separated export" : "CSV export";
}

function dedupeHeaders(values: unknown[]): string[] {
  const seen = new Map<string, number>();
  return values.map((value, index) => {
    const base =
      String(value ?? "")
        .replace(/^﻿/, "")
        .trim() || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function rowsFromMatrix(matrix: unknown[][]): {
  headers: string[];
  rows: Record<string, string>[];
  rowWarnings: string[];
} {
  const sourceHeaders = matrix[0] ?? [];
  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `This export has ${dataRows.length.toLocaleString()} rows. Split it into files of ${MAX_IMPORT_ROWS.toLocaleString()} rows or fewer.`,
    );
  }
  const maxWidth = dataRows.reduce(
    (width, row) => Math.max(width, row.length),
    sourceHeaders.length,
  );
  const headers = dedupeHeaders([
    ...sourceHeaders,
    ...Array.from(
      { length: Math.max(0, maxWidth - sourceHeaders.length) },
      () => "",
    ),
  ]);
  const rowWarnings = dataRows
    .map((row, index) =>
      row.length === sourceHeaders.length
        ? null
        : `Row ${index + 2} has ${row.length} cells; the header has ${sourceHeaders.length}. ${
            row.length > sourceHeaders.length
              ? "Extra values were preserved in generated columns."
              : "Missing trailing values were left blank."
          }`,
    )
    .filter((warning): warning is string => warning !== null)
    .slice(0, 5);
  const rows = dataRows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, String(values[index] ?? "")]),
    ),
  );
  return { headers, rows, rowWarnings };
}

export function parseDelimitedText(text: string): ParsedImportData {
  if (text.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      "Paste fewer than 20 million characters, or split the export into smaller files",
    );
  }
  // Strip a UTF-8 BOM (Excel exports) and dedupe repeated header names —
  // papaparse's object mode collapses duplicate keys. Parse as a matrix so
  // every exported column survives and can be mapped independently.
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, "").trim(), {
    skipEmptyLines: "greedy",
  });
  const { headers, rows, rowWarnings } = rowsFromMatrix(parsed.data);
  const parseWarnings = [
    ...parsed.errors
      .slice(0, 5)
      .map((e) =>
        e.row !== undefined ? `Row ${e.row + 1}: ${e.message}` : e.message,
      ),
    ...rowWarnings,
  ].slice(0, 5);
  const format = parsed.meta.delimiter === "\t" ? "tsv" : "csv";
  return {
    headers,
    rows,
    parseWarnings,
    format,
    sourceLabel: detectSourceLabel(headers, format),
  };
}

function unfoldVCardLines(text: string): string[] {
  const lines: string[] = [];
  for (const physical of text.replace(/\r\n?/g, "\n").split("\n")) {
    const previous = lines.at(-1);
    if (
      previous !== undefined &&
      (/^[ \t]/.test(physical) || previous.endsWith("="))
    ) {
      lines[lines.length - 1] =
        previous.replace(/=$/, "") +
        (previous.endsWith("=") ? physical : physical.slice(1));
    } else {
      lines.push(physical);
    }
  }
  return lines;
}

function splitVCardValue(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      current += `\\${char}`;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === ";") {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function decodeVCardValue(value: string, quotedPrintable: boolean): string {
  let decoded = value;
  if (quotedPrintable) {
    try {
      decoded = decodeURIComponent(value.replace(/=([A-Fa-f0-9]{2})/g, "%$1"));
    } catch {
      // Keep the readable source bytes when an exporter emitted malformed QP.
    }
  }
  return decoded
    .replace(/\\n/gi, "\n")
    .replace(/\\([,;\\])/g, "$1")
    .trim();
}

/** Parse vCard 2.1/3.0/4.0 contact exports into the shared tabular mapping shape. */
export function parseVCard(text: string): ParsedImportData {
  const headers = [
    "First name",
    "Last name",
    "Full name",
    "Job title",
    "Company",
    "Email",
    "Email 2",
    "Phone",
    "Phone 2",
  ];
  const rows: Record<string, string>[] = [];
  type VCardValue = { raw: string; quotedPrintable: boolean };
  let card: Record<string, VCardValue[]> | null = null;

  for (const line of unfoldVCardLines(text)) {
    if (line.toUpperCase() === "BEGIN:VCARD") {
      card = {};
      continue;
    }
    if (line.toUpperCase() === "END:VCARD") {
      if (card) {
        const nameValue = card.N?.[0];
        const structuredName = splitVCardValue(nameValue?.raw ?? "");
        const family = decodeVCardValue(
          structuredName[0] ?? "",
          nameValue?.quotedPrintable ?? false,
        );
        const given = decodeVCardValue(
          structuredName[1] ?? "",
          nameValue?.quotedPrintable ?? false,
        );
        const decodeFirst = (property: string) => {
          const value = card?.[property]?.[0];
          return value
            ? decodeVCardValue(value.raw, value.quotedPrintable)
            : "";
        };
        const organizationValue = card.ORG?.[0];
        const organization = decodeVCardValue(
          splitVCardValue(organizationValue?.raw ?? "")[0] ?? "",
          organizationValue?.quotedPrintable ?? false,
        );
        const emails = (card.EMAIL ?? []).map((value) =>
          decodeVCardValue(value.raw, value.quotedPrintable),
        );
        const phones = (card.TEL ?? []).map((value) =>
          decodeVCardValue(value.raw, value.quotedPrintable),
        );
        const fullName =
          decodeFirst("FN") || [given, family].filter(Boolean).join(" ");
        rows.push({
          "First name": given,
          "Last name": family,
          "Full name": fullName,
          "Job title": decodeFirst("TITLE"),
          Company: organization,
          Email: emails[0] ?? "",
          "Email 2": emails[1] ?? "",
          Phone: phones[0] ?? "",
          "Phone 2": phones[1] ?? "",
        });
        if (rows.length > MAX_IMPORT_ROWS) {
          throw new Error(
            `This vCard has more than ${MAX_IMPORT_ROWS.toLocaleString()} contacts. Split it into smaller files.`,
          );
        }
      }
      card = null;
      continue;
    }
    if (!card) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const descriptor = line.slice(0, colon);
    const property = descriptor.split(";")[0].split(".").at(-1)?.toUpperCase();
    if (
      !property ||
      !["N", "FN", "TITLE", "ORG", "EMAIL", "TEL"].includes(property)
    ) {
      continue;
    }
    (card[property] ??= []).push({
      raw: line.slice(colon + 1),
      quotedPrintable: /ENCODING=QUOTED-PRINTABLE/i.test(descriptor),
    });
  }

  return {
    headers,
    rows,
    parseWarnings: [],
    format: "vcard",
    sourceLabel: detectSourceLabel(headers, "vcard"),
  };
}

/** Parse every browser-supported native contact export into one mapping shape. */
export async function parseImportFile(
  file: Pick<File, "name" | "size" | "text" | "arrayBuffer">,
): Promise<ParsedImportData> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      "Choose a file smaller than 20 MB, or split the export into smaller files",
    );
  }
  const extension = file.name.toLowerCase().split(".").at(-1) ?? "";
  if (extension === "vcf" || extension === "vcard")
    return parseVCard(await file.text());
  if (["csv", "tsv", "txt"].includes(extension))
    return parseDelimitedText(await file.text());
  if (extension !== "xlsx" && extension !== "xls") {
    throw new Error("Choose a CSV, TSV, Excel, or vCard file");
  }

  // SheetJS is heavy; this user-triggered import keeps it out of the route's
  // initial bundle and loads it only after an Excel file is chosen.
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    if (matrix.length < 2) continue;
    const { headers, rows, rowWarnings } = rowsFromMatrix(matrix);
    const format = extension as "xlsx" | "xls";
    return {
      headers,
      rows,
      parseWarnings: [
        ...(workbook.SheetNames.length > 1
          ? [
              `Using worksheet “${sheetName}”. Import additional worksheets separately.`,
            ]
          : []),
        ...rowWarnings,
      ].slice(0, 5),
      format,
      sourceLabel: detectSourceLabel(headers, format),
      sheetName,
    };
  }
  throw new Error(
    "The workbook has no worksheet with a header row and data rows",
  );
}

// ── Auto-mapping ────────────────────────────────────────────────────────────

/** Header → candidate synonyms, normalized to bare lowercase alphanumerics. */
const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  first_name: ["firstname", "first", "givenname", "fname"],
  last_name: ["lastname", "last", "surname", "familyname", "lname"],
  display_name: [
    "name",
    "fullname",
    "displayname",
    "contactname",
    "companyname",
    "organizationname",
    "orgname",
    "company",
    "organization",
  ],
  legal_name: ["legalname", "registeredname"],
  job_title: [
    "jobtitle",
    "title",
    "position",
    "role",
    "organization1title",
    "org1title",
  ],
  headline: ["headline", "about", "summary", "bio", "description"],
  company: [
    "company",
    "companyname",
    "employer",
    "organization",
    "organisation",
    "org",
    "account",
    "accountname",
    "organization1name",
    "org1name",
  ],
  primary_domain: [
    "domain",
    "website",
    "site",
    "url",
    "web",
    "homepage",
    "websiteurl",
  ],
  email: [
    "email",
    "emailaddress",
    "workemail",
    "mail",
    "primaryemail",
    "email1",
  ],
  email_2: [
    "email2",
    "secondaryemail",
    "personalemail",
    "otheremail",
    "altemail",
  ],
  phone: [
    "phone",
    "phonenumber",
    "telephone",
    "tel",
    "workphone",
    "businessphone",
    "mobile",
    "mobilephone",
    "cell",
    "cellphone",
    "primaryphone",
    "phone1",
    "directphone",
  ],
  phone_2: ["phone2", "secondaryphone", "otherphone", "homephone", "altphone"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isNativeEmailValueHeader(header: string): boolean {
  return (
    /^email\d+(?:value|address)$/.test(header) ||
    /^(?:business|home|other|personal|work)email(?:address)?\d*$/.test(header)
  );
}

function isNativePhoneValueHeader(header: string): boolean {
  return (
    /^phone\d+value$/.test(header) ||
    /^(?:business|home|other|mobile|cell|work|direct)?phone(?:number)?\d*$/.test(
      header,
    )
  );
}

export function fieldsForKind(kind: PartyKind): readonly ImportField[] {
  return kind === "person" ? PERSON_IMPORT_FIELDS : ORG_IMPORT_FIELDS;
}

/**
 * Guess the mapping from header names. Each field is assigned at most once
 * (first matching header wins); `company` and `display_name` share synonyms,
 * so kind-specific ordering resolves them: for people the company-ish headers
 * feed `company`, for companies they feed `display_name`.
 */
export function guessMapping(
  headers: string[],
  kind: PartyKind,
): ImportMapping {
  const fields = fieldsForKind(kind);
  const mapping: ImportMapping = {};
  const taken = new Set<ImportField>();

  // Person imports must not swallow "Company" into display_name: try company
  // first for people; companies have no `company` field so name-ish wins.
  const ordered: ImportField[] =
    kind === "person"
      ? ["company", ...fields.filter((f) => f !== "company")]
      : [...fields];

  for (const header of headers) {
    const norm = normalizeHeader(header);
    let match: ImportField | null = null;
    for (const field of ordered) {
      if (taken.has(field)) continue;
      if (FIELD_SYNONYMS[field].includes(norm)) {
        match = field;
        break;
      }
    }
    // Native Google/Outlook exports number channel columns and pair each
    // value with an adjacent Type/Label column. Recognize only value-bearing
    // headers, then fill the first two supported slots in order.
    if (!match && isNativeEmailValueHeader(norm) && fields.includes("email")) {
      match = !taken.has("email")
        ? "email"
        : fields.includes("email_2") && !taken.has("email_2")
          ? "email_2"
          : null;
    }
    if (!match && isNativePhoneValueHeader(norm) && fields.includes("phone")) {
      match = !taken.has("phone")
        ? "phone"
        : fields.includes("phone_2") && !taken.has("phone_2")
          ? "phone_2"
          : null;
    }
    // Second identical channel column upgrades to the `_2` slot.
    if (match === "email" && taken.has("email") && !taken.has("email_2")) {
      match = "email_2";
    }
    if (match === "phone" && taken.has("phone") && !taken.has("phone_2")) {
      match = "phone_2";
    }
    mapping[header] = match;
    if (match) taken.add(match);
  }
  return mapping;
}

// ── Dry-run plan ────────────────────────────────────────────────────────────

function cell(
  row: Record<string, string>,
  mapping: ImportMapping,
  field: ImportField,
): string {
  for (const [header, mapped] of Object.entries(mapping)) {
    if (mapped === field) return (row[header] ?? "").trim();
  }
  return "";
}

function normalizeMany(
  channel: "email" | "phone",
  raws: string[],
  problems: string[],
): string[] {
  const keys: string[] = [];
  for (const raw of raws.flatMap((value) =>
    value.split(/(?:\s*:::\s*|\s*[,;\n]\s*)/).filter(Boolean),
  )) {
    try {
      const { valueKey } = normalizeMediumValue(channel, raw);
      if (!keys.includes(valueKey)) keys.push(valueKey);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }
  return keys;
}

/** Bare-domain extraction: `https://acme.com/x` / `www.acme.com` → `acme.com`. */
function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .trim();
}

/**
 * Build the full dry-run plan. Reads the DB (via service bulk lookups) but
 * writes NOTHING — this is what the preview step renders.
 */
export async function planImport(args: {
  parsed: ParsedImportData;
  mapping: ImportMapping;
  kind: PartyKind;
  orgId: string;
}): Promise<ImportPlan> {
  const { parsed, mapping, kind, orgId } = args;

  // Pass 1 — extract + validate every row locally.
  const drafts: RowPlan[] = parsed.rows.map((row, i) => {
    const problems: string[] = [];
    const firstName = cell(row, mapping, "first_name");
    const lastName = cell(row, mapping, "last_name");
    const explicitName = cell(row, mapping, "display_name");
    const displayName =
      explicitName || [firstName, lastName].filter(Boolean).join(" ").trim();

    const emails = normalizeMany(
      "email",
      [cell(row, mapping, "email"), cell(row, mapping, "email_2")],
      problems,
    );
    const phones = normalizeMany(
      "phone",
      [cell(row, mapping, "phone"), cell(row, mapping, "phone_2")],
      problems,
    );

    const domainRaw = cell(row, mapping, "primary_domain");
    const plan: RowPlan = {
      rowNumber: i + 1,
      status: displayName ? "create" : "invalid",
      displayName,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      legalName: cell(row, mapping, "legal_name") || undefined,
      jobTitle: cell(row, mapping, "job_title") || undefined,
      headline: cell(row, mapping, "headline") || undefined,
      primaryDomain: domainRaw ? normalizeDomain(domainRaw) : undefined,
      emails,
      phones,
      companyName:
        kind === "person"
          ? cell(row, mapping, "company") || undefined
          : undefined,
      problems,
    };
    if (!displayName) plan.problems.unshift("No name — a record needs a name");
    return plan;
  });

  // Pass 2 — in-file identity dedup (first claim wins).
  const claimed = new Map<string, number>(); // identity key → rowNumber
  for (const plan of drafts) {
    if (plan.status !== "create") continue;
    const identities =
      kind === "person"
        ? [
            ...plan.emails.map((e) => `e:${e}`),
            ...plan.phones.map((p) => `p:${p}`),
          ]
        : [
            ...(plan.primaryDomain ? [`d:${plan.primaryDomain}`] : []),
            `n:${plan.displayName.toLowerCase()}`,
          ];
    const hit = identities.find((k) => claimed.has(k));
    if (hit !== undefined) {
      plan.status = "duplicate_in_file";
      plan.duplicateOfRow = claimed.get(hit);
      continue;
    }
    for (const k of identities) claimed.set(k, plan.rowNumber);
  }

  // Pass 3 — existing-record dedup against the org, batched.
  const candidates = drafts.filter((p) => p.status === "create");
  const allEmails = [...new Set(candidates.flatMap((p) => p.emails))];
  const allPhones = [...new Set(candidates.flatMap((p) => p.phones))];
  const allDomains =
    kind === "organization"
      ? [
          ...new Set(
            candidates
              .map((p) => p.primaryDomain)
              .filter((d): d is string => !!d),
          ),
        ]
      : [];
  const allNames =
    kind === "organization"
      ? [...new Set(candidates.map((p) => p.displayName))]
      : [];
  const employerNames = [
    ...new Set(
      candidates.map((p) => p.companyName).filter((n): n is string => !!n),
    ),
  ];

  const [emailOwners, phoneOwners, domainOwners, nameOwners, employerMatches] =
    await Promise.all([
      findExistingMediumOwners({
        orgId,
        channel: "email",
        valueKeys: allEmails,
      }),
      findExistingMediumOwners({
        orgId,
        channel: "phone",
        valueKeys: allPhones,
      }),
      findPartiesByDomains({ orgId, domains: allDomains }),
      findPartiesByNames({ orgId, kind: "organization", names: allNames }),
      findPartiesByNames({ orgId, kind: "organization", names: employerNames }),
    ]);

  for (const plan of candidates) {
    const existing =
      kind === "person"
        ? (plan.emails.map((e) => emailOwners.get(e)).find(Boolean) ??
          plan.phones.map((p) => phoneOwners.get(p)).find(Boolean))
        : ((plan.primaryDomain
            ? domainOwners.get(plan.primaryDomain)
            : undefined) ?? nameOwners.get(plan.displayName.toLowerCase()));
    if (existing) {
      plan.status = "exists";
      plan.existing = existing;
      continue;
    }
    if (plan.companyName) {
      plan.existingEmployer = employerMatches.get(
        plan.companyName.toLowerCase(),
      );
    }
  }

  const creates = drafts.filter((p) => p.status === "create");
  // Dedupe by the SAME lowercase key the commit loop uses, so the preview's
  // "creates N companies" is exactly what commit will do.
  const newCompanyByKey = new Map<string, string>();
  for (const p of creates) {
    if (p.companyName && !p.existingEmployer) {
      const key = p.companyName.toLowerCase();
      if (!newCompanyByKey.has(key)) newCompanyByKey.set(key, p.companyName);
    }
  }
  const newCompanyNames = [...newCompanyByKey.values()];

  return {
    kind,
    orgId,
    rows: drafts,
    newCompanyNames,
    counts: {
      create: creates.length,
      exists: drafts.filter((p) => p.status === "exists").length,
      duplicateInFile: drafts.filter((p) => p.status === "duplicate_in_file")
        .length,
      invalid: drafts.filter((p) => p.status === "invalid").length,
    },
  };
}

// ── Commit ──────────────────────────────────────────────────────────────────

/**
 * Execute the plan: create every `create` row, wiring contact points (first
 * email/phone becomes primary) and, for people, the employer affiliation.
 * Employers are resolved once per distinct name. Per-row failures are
 * captured and the run continues — one bad row never sinks the file.
 */
export async function commitImport(
  plan: ImportPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const rows = plan.rows.filter((p) => p.status === "create");
  const created: RowResult[] = [];
  const failed: RowResult[] = [];
  const companiesCreated: PartyRef[] = [];
  const employerCache = new Map<string, PartyRef>();

  // Resolve every distinct employer up front so row order can't create the
  // same company twice.
  for (const p of rows) {
    if (p.existingEmployer && p.companyName) {
      employerCache.set(p.companyName.toLowerCase(), p.existingEmployer);
    }
  }

  let done = 0;
  for (const p of rows) {
    // Captured as soon as the party lands so a later step's failure can still
    // hand the user a door to the half-populated record instead of hiding it.
    let createdPartyId: string | undefined;
    try {
      let employer: PartyRef | undefined;
      if (p.companyName) {
        const key = p.companyName.toLowerCase();
        employer = employerCache.get(key);
        if (!employer) {
          employer = await findOrCreateCompanyByName({
            orgId: plan.orgId,
            name: p.companyName,
          });
          employerCache.set(key, employer);
          companiesCreated.push(employer);
        }
      }

      const party = await createParty({
        kind: plan.kind,
        displayName: p.displayName,
        orgId: plan.orgId,
        firstName: p.firstName,
        lastName: p.lastName,
        jobTitle: p.jobTitle,
        headline: p.headline,
        primaryDomain:
          plan.kind === "organization" ? p.primaryDomain : undefined,
      });
      createdPartyId = party.id;
      if (p.legalName) {
        // legal_name is not in CreatePartyInput's narrow shape; a follow-up
        // update keeps createParty's surface small.
        await updateParty(party.id, { legal_name: p.legalName });
      }

      for (const [i, email] of p.emails.entries()) {
        await addContactPoint({
          partyId: party.id,
          orgId: plan.orgId,
          channel: "email",
          value: email,
          makePrimary: i === 0,
        });
      }
      for (const [i, phone] of p.phones.entries()) {
        await addContactPoint({
          partyId: party.id,
          orgId: plan.orgId,
          channel: "phone",
          value: phone,
          makePrimary: i === 0,
        });
      }

      if (employer) {
        await addAffiliation({
          partyId: party.id,
          employerPartyId: employer.id,
          orgId: plan.orgId,
          title: p.jobTitle,
          isCurrent: true,
          isPrimary: true,
        });
      }

      created.push({
        rowNumber: p.rowNumber,
        displayName: p.displayName,
        ok: true,
        partyId: party.id,
      });
    } catch (e) {
      failed.push({
        rowNumber: p.rowNumber,
        displayName: p.displayName,
        ok: false,
        partyId: createdPartyId,
        error:
          (e instanceof Error ? e.message : String(e)) +
          (createdPartyId
            ? " — the record was created but is missing later pieces; open it to finish by hand"
            : ""),
      });
    }
    done += 1;
    onProgress?.(done, rows.length);
  }

  return { created, failed, companiesCreated };
}

// ── Template ────────────────────────────────────────────────────────────────

export function buildTemplateCsv(kind: PartyKind): string {
  if (kind === "person") {
    return Papa.unparse({
      fields: [
        "First name",
        "Last name",
        "Job title",
        "Company",
        "Email",
        "Phone",
      ],
      data: [
        [
          "Ada",
          "Lovelace",
          "Chief Analyst",
          "Analytical Engines Ltd",
          "ada@analyticalengines.example",
          "+13105551234",
        ],
      ],
    });
  }
  return Papa.unparse({
    fields: ["Company name", "Website", "Email", "Phone"],
    data: [
      [
        "Analytical Engines Ltd",
        "analyticalengines.example",
        "info@analyticalengines.example",
        "+13105555678",
      ],
    ],
  });
}
