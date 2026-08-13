// features/crm/import/engine.ts
//
// The CSV import engine: parse → auto-map → dry-run plan → commit.
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
  ParsedCsv,
  RowPlan,
  RowResult,
} from "./types";
import { ORG_IMPORT_FIELDS, PERSON_IMPORT_FIELDS } from "./types";

// ── Parse ───────────────────────────────────────────────────────────────────

export function parseCsv(text: string): ParsedCsv {
  // Strip a UTF-8 BOM (Excel exports) and dedupe repeated header names —
  // papaparse keys rows by header text, so duplicates would silently collapse
  // onto one column.
  const seen = new Map<string, number>();
  const parsed = Papa.parse<Record<string, string>>(
    text.replace(/^﻿/, "").trim(),
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (raw) => {
        const h = raw.replace(/^﻿/, "").trim();
        const n = (seen.get(h) ?? 0) + 1;
        seen.set(h, n);
        return n === 1 ? h : `${h} (${n})`;
      },
    },
  );
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const parseWarnings = parsed.errors
    .slice(0, 5)
    .map((e) =>
      e.row !== undefined ? `Row ${e.row + 1}: ${e.message}` : e.message,
    );
  return { headers, rows: parsed.data, parseWarnings };
}

// ── Auto-mapping ────────────────────────────────────────────────────────────

/** Header → candidate synonyms, normalized to bare lowercase alphanumerics. */
const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  first_name: ["firstname", "first", "givenname", "fname"],
  last_name: ["lastname", "last", "surname", "familyname", "lname"],
  display_name: ["name", "fullname", "displayname", "contactname", "companyname", "organizationname", "orgname", "company", "organization"],
  legal_name: ["legalname", "registeredname"],
  job_title: ["jobtitle", "title", "position", "role"],
  headline: ["headline", "about", "summary", "bio", "description", "notes"],
  company: ["company", "companyname", "employer", "organization", "organisation", "org", "account", "accountname"],
  primary_domain: ["domain", "website", "site", "url", "web", "homepage", "websiteurl"],
  email: ["email", "emailaddress", "workemail", "mail", "primaryemail", "email1"],
  email_2: ["email2", "secondaryemail", "personalemail", "otheremail", "altemail"],
  phone: ["phone", "phonenumber", "telephone", "tel", "workphone", "mobile", "mobilephone", "cell", "cellphone", "primaryphone", "phone1", "directphone"],
  phone_2: ["phone2", "secondaryphone", "otherphone", "homephone", "altphone"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
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
export function guessMapping(headers: string[], kind: PartyKind): ImportMapping {
  const fields = fieldsForKind(kind);
  const mapping: ImportMapping = {};
  const taken = new Set<ImportField>();

  // Person imports must not swallow "Company" into display_name: try company
  // first for people; companies have no `company` field so name-ish wins.
  const ordered: ImportField[] =
    kind === "person"
      ? [
          "company",
          ...fields.filter((f) => f !== "company"),
        ]
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
  for (const raw of raws) {
    if (!raw) continue;
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
  parsed: ParsedCsv;
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
        kind === "person" ? cell(row, mapping, "company") || undefined : undefined,
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
        ? [...plan.emails.map((e) => `e:${e}`), ...plan.phones.map((p) => `p:${p}`)]
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
      ? [...new Set(candidates.map((p) => p.primaryDomain).filter((d): d is string => !!d))]
      : [];
  const allNames =
    kind === "organization"
      ? [...new Set(candidates.map((p) => p.displayName))]
      : [];
  const employerNames = [
    ...new Set(
      candidates
        .map((p) => p.companyName)
        .filter((n): n is string => !!n),
    ),
  ];

  const [emailOwners, phoneOwners, domainOwners, nameOwners, employerMatches] =
    await Promise.all([
      findExistingMediumOwners({ orgId, channel: "email", valueKeys: allEmails }),
      findExistingMediumOwners({ orgId, channel: "phone", valueKeys: allPhones }),
      findPartiesByDomains({ orgId, domains: allDomains }),
      findPartiesByNames({ orgId, kind: "organization", names: allNames }),
      findPartiesByNames({ orgId, kind: "organization", names: employerNames }),
    ]);

  for (const plan of candidates) {
    const existing =
      kind === "person"
        ? (plan.emails.map((e) => emailOwners.get(e)).find(Boolean) ??
          plan.phones.map((p) => phoneOwners.get(p)).find(Boolean))
        : ((plan.primaryDomain ? domainOwners.get(plan.primaryDomain) : undefined) ??
          nameOwners.get(plan.displayName.toLowerCase()));
    if (existing) {
      plan.status = "exists";
      plan.existing = existing;
      continue;
    }
    if (plan.companyName) {
      plan.existingEmployer = employerMatches.get(plan.companyName.toLowerCase());
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
      duplicateInFile: drafts.filter((p) => p.status === "duplicate_in_file").length,
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
        primaryDomain: plan.kind === "organization" ? p.primaryDomain : undefined,
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
      fields: ["First name", "Last name", "Job title", "Company", "Email", "Phone"],
      data: [
        ["Ada", "Lovelace", "Chief Analyst", "Analytical Engines Ltd", "ada@analyticalengines.example", "+13105551234"],
      ],
    });
  }
  return Papa.unparse({
    fields: ["Company name", "Website", "Email", "Phone"],
    data: [
      ["Analytical Engines Ltd", "analyticalengines.example", "info@analyticalengines.example", "+13105555678"],
    ],
  });
}
