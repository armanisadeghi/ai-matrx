// features/crm/import/types.ts
//
// Types for the CSV import wizard. The engine (engine.ts) is the only writer
// of these shapes; the wizard renders them. Row shapes never mirror DB rows —
// the commit path writes through features/crm/service.ts.

import type { PartyKind, PartyRef } from "../types";

/** The importable fields, per kind. `company` links/creates an employer. */
export const PERSON_IMPORT_FIELDS = [
  "first_name",
  "last_name",
  "display_name",
  "job_title",
  "headline",
  "company",
  "email",
  "email_2",
  "phone",
  "phone_2",
] as const;

export const ORG_IMPORT_FIELDS = [
  "display_name",
  "legal_name",
  "primary_domain",
  "headline",
  "email",
  "phone",
] as const;

export type ImportField =
  | (typeof PERSON_IMPORT_FIELDS)[number]
  | (typeof ORG_IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  first_name: "First name",
  last_name: "Last name",
  display_name: "Full name",
  legal_name: "Legal name",
  job_title: "Job title",
  headline: "Headline",
  company: "Company (employer)",
  primary_domain: "Website domain",
  email: "Email",
  email_2: "Email 2",
  phone: "Phone",
  phone_2: "Phone 2",
};

/** CSV header (as parsed) → the field it feeds, or null = ignored. */
export type ImportMapping = Record<string, ImportField | null>;

export interface ParsedCsv {
  headers: string[];
  /** One record per data row, keyed by header. */
  rows: Record<string, string>[];
  /** Papaparse-reported structural problems (wrong cell counts etc.). */
  parseWarnings: string[];
}

export type RowStatus =
  /** Will create a new record. */
  | "create"
  /** An existing live record already owns one of this row's identity values. */
  | "exists"
  /** A previous row in this same file already claims this identity. */
  | "duplicate_in_file"
  /** Cannot be imported (no name, or every mapped value invalid). */
  | "invalid";

export interface RowPlan {
  /** 1-based CSV data-row number (header excluded) — what the user sees. */
  rowNumber: number;
  status: RowStatus;
  displayName: string;
  firstName?: string;
  lastName?: string;
  legalName?: string;
  jobTitle?: string;
  headline?: string;
  primaryDomain?: string;
  /** Normalized value keys, deduped, in CSV order. First becomes primary. */
  emails: string[];
  phones: string[];
  /** Person imports: the employer cell, verbatim. */
  companyName?: string;
  /** Resolved when the employer already exists in this org. */
  existingEmployer?: PartyRef;
  /** For `exists` / `duplicate_in_file`: who already owns the identity. */
  existing?: PartyRef;
  duplicateOfRow?: number;
  /** Non-fatal issues (a bad second email on an otherwise good row, …). */
  problems: string[];
}

export interface ImportPlan {
  kind: PartyKind;
  orgId: string;
  rows: RowPlan[];
  /** Distinct employer names that will be created (not yet in the org). */
  newCompanyNames: string[];
  counts: {
    create: number;
    exists: number;
    duplicateInFile: number;
    invalid: number;
  };
}

export interface RowResult {
  rowNumber: number;
  displayName: string;
  ok: boolean;
  partyId?: string;
  error?: string;
}

export interface ImportResult {
  created: RowResult[];
  failed: RowResult[];
  /** Companies created as employers during the run. */
  companiesCreated: PartyRef[];
}
