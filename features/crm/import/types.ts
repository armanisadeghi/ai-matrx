// features/crm/import/types.ts
//
// Types for the contact import wizard. The engine (engine.ts) is the only writer
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
  (typeof PERSON_IMPORT_FIELDS)[number] | (typeof ORG_IMPORT_FIELDS)[number];

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

export type ImportFileFormat =
  | "csv"
  | "tsv"
  | "xlsx"
  | "xls"
  | "vcard"
  /** An API contact connector (Google People, …) — not a file at all. */
  | "connector";

/**
 * Provenance of a connector-sourced parse — which adapter and connection read
 * the records, and the sync cursor to persist AFTER a successful commit.
 * Provider-generic: Microsoft Graph and every later connector reuse it.
 */
export interface ImportConnectorMeta {
  /** Server connector registry key, e.g. 'google_people'. */
  providerKey: string;
  /** `crm.contact_medium.platform_slug` for external-id identity points. */
  platformSlug: string;
  connectionId: string;
  accountEmail?: string;
  /** Delta cursor — persisted via the /cursor endpoint only after commit. */
  syncToken?: string;
  /** True when this run read only changes since the last sync. */
  incremental: boolean;
  /** Deleted at the SOURCE since last sync — reported, never applied. */
  deletedExternalIds: string[];
}

export interface ParsedImportData {
  headers: string[];
  /** One record per data row, keyed by header. */
  rows: Record<string, string>[];
  /** Structural problems (wrong cell counts, extra worksheets, etc.). */
  parseWarnings: string[];
  /** Native container that was parsed before entering the shared mapping flow. */
  format: ImportFileFormat;
  /** Best-effort product/export recognition from native headers. */
  sourceLabel: string;
  /** Excel only: the first non-empty worksheet selected for import. */
  sheetName?: string;
  /** Connector sources only: adapter provenance + sync cursor. */
  connector?: ImportConnectorMeta;
  /**
   * Connector sources only: per-row source metadata aligned by index with
   * `rows`. The external id is the source's stable record id — the strongest
   * identity key the resolver has, and what makes a re-sync idempotent.
   */
  rowMeta?: { externalId?: string }[];
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
  /** Connector sources: the source's stable record id for this row. */
  externalId?: string;
  /** Non-fatal issues (a bad second email on an otherwise good row, …). */
  problems: string[];
}

export interface ImportPlan {
  kind: PartyKind;
  orgId: string;
  /** Carried from the parse so commit can stamp external ids + the wizard can
   * persist the sync cursor after a successful commit. */
  connector?: ImportConnectorMeta;
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
  /**
   * The resolver matched a party we already had instead of creating one. The
   * row succeeded — reporting it as "created" would tell the user we imported
   * N new contacts when some of them were already in the CRM.
   */
  matchedExisting?: boolean;
  error?: string;
}

export interface ImportResult {
  created: RowResult[];
  failed: RowResult[];
  /** Companies created as employers during the run. */
  companiesCreated: PartyRef[];
}
