/**
 * 🚨 A DETAIL READ NEVER ASKS FOR A SERVER-ONLY COLUMN (seat-proven 2026-09-30).
 *
 * As admin@admin.com on :3001, `/files/all?panels=detail:file.<id>:as-window`
 * showed "Couldn't load the details for this file. permission denied for table
 * files". The generic detail loader (`detail.tsx` → `makeLoader`) read
 * `files.files` with `select('*')`. That table's grant REVOKEs `storage_uri`
 * from `authenticated` (server-only), so the role has column-level SELECT only
 * and Postgres refuses `*` for the WHOLE table — for every row, whatever RLS
 * says. Every other reader of `files.files` uses `FILES_TABLE_COLUMNS`
 * (`features/files/filesDb.ts`); the detail window was the one that did not.
 * The policy is right; the read was wrong.
 *
 * 1. BEHAVIOUR — the file loader, through the REAL registry, asks for the
 *    canonical client column list and gets the row. The supabase stand-in
 *    refuses `*` on `files.files` exactly as the live grant does.
 * 2. CENSUS — every registered type whose detail table carries a server-only
 *    column declares `columns`, and never names one of them. The table list is
 *    the live catalog on 2026-09-30 (tables where `authenticated` can SELECT
 *    some columns but not all):
 *
 *      select n.nspname, c.relname from pg_class c join pg_namespace n …
 *      where exists (col not selectable by authenticated)
 *        and exists (col selectable by authenticated)
 *
 *    Run that again when adding a `detailSource` on a new table.
 */

const selects: Array<{ schema: string; table: string; columns: string }> = [];

jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitOrganizationForRecordRead: async () => ({ status: "ready" }),
}));

jest.mock("@/utils/supabase/client", () => {
  const from = (schema: string) => (table: string) => ({
    select: (columns: string) => {
      selects.push({ schema, table, columns });
      const refused =
        schema === "files" &&
        table === "files" &&
        (columns.trim() === "*" || /\bstorage_uri\b/.test(columns));
      const result = refused
        ? { data: null, error: { code: "42501", message: "permission denied for table files" } }
        : { data: { id: "d24f733f-0032-44ac-ab43-b4dc030c95ba", file_name: "default-user-avatar.jpg" }, error: null };
      return {
        eq: () => ({ abortSignal: () => ({ maybeSingle: async () => result }) }),
      };
    },
  });
  return {
    supabase: { schema: (schema: string) => ({ from: from(schema) }), from: from("public") },
  };
});

jest.mock("@/features/item-presentation/ItemDetailFrame", () => ({
  ItemDetailFrame: () => null,
}));
jest.mock("@/features/item-presentation/sourceHealth", () => ({
  sourceHealthProducerFor: () => null,
}));

import { FILES_TABLE_COLUMNS } from "@/features/files/filesDb";
import { getItemConfig } from "../registry";
import type { KnownItemType } from "../types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveItemDetailType } = require("@/features/item-presentation/detail") as {
  resolveItemDetailType: (type: string) => {
    load: ((id: string, signal: AbortSignal) => Promise<unknown>) | null;
  } | null;
};

/** Live catalog, 2026-09-30: schema.table → columns `authenticated` may not SELECT. */
const SERVER_ONLY_COLUMNS: Record<string, string[]> = {
  "agent.term_list": ["metadata"],
  "ai.endpoint": ["base_url", "auth_ref", "byok_secret_key"],
  "ai.offering": ["pricing"],
  "browser.account_binding": ["credential_item_id"],
  "browser.login_attempt": ["credential_item_id"],
  "crm.sending_identity": ["domain_verification_token"],
  "docproc.processed_documents": ["storage_uri"],
  "esign.provider": ["credentials"],
  "esign.signing_key": ["secret_key"],
  "files.file_versions": ["storage_uri"],
  "files.files": ["storage_uri"],
  "files.webhooks": ["secret"],
  "hr.calculation_snapshot": ["resolution", "applicability_facts", "inputs", "outputs", "clamps"],
  "hr.eeo_response": ["application_id", "posting_id", "employment_id"],
  "hr.employee_private": ["ssn_ciphertext", "ssn_key_id", "ssn_hmac", "national_id_ciphertext"],
  "hr.employer_profile": ["ein"],
  "hr.employment_pin": ["pin_hash", "pin_algo"],
  "hr.incident": ["excluded_actor_ids"],
  "hr.kiosk_device": ["device_secret_hash", "pairing_code_hash"],
  "hr.kiosk_session": ["session_token_hash"],
  "hr.leave_ledger": ["amount", "rate"],
  "hr.provider_binding": ["credential_ref", "webhook_secret_ref", "connector"],
  "iam.api_keys": ["secret_hash"],
  "platform.action_request": ["token_hash"],
  "platform.actor_session": ["session_hash"],
  "platform.actor_token": ["token_hash", "verification_target", "verification_code_hash"],
  "platform.egress_device": ["token_hash"],
  "iam.team": ["metadata"],
  "rag.library_docs": ["storage_uri", "deleted_at"],
  "scraper.scrape_parsed_page": ["content"],
  "seo.collection_run": ["credential_reference_id", "deleted_at"],
  "users.integration_connections": ["vault_secret_key", "credential_item_id", "created_by", "custom_fields"],
  "users.credential_attachments": ["value_encrypted", "custom_fields"],
  "users.user_secrets": ["value_encrypted"],
  "web.crawl_schedule": ["claim_token"],
  "workflow.trigger": ["webhook_secret"],
};

const ALL_REGISTERED_TYPES: KnownItemType[] = [
  "agent", "app", "research_template", "note", "task", "project", "scope_type",
  "scope", "context_item", "image", "video", "audio", "file", "session", "table",
  "structured_list", "picklist", "workbook", "document", "conversation", "message",
  "email", "party", "google_document", "calendar_event", "web_site",
];

describe("a detail read never asks for a server-only column", () => {
  beforeEach(() => {
    selects.length = 0;
  });

  it.each(["file", "image", "video", "audio"])(
    "a %s opens: the loader reads the canonical file columns and gets the row",
    async (type) => {
      const recordType = resolveItemDetailType(type);
      const result = await recordType?.load?.(
        "d24f733f-0032-44ac-ab43-b4dc030c95ba",
        new AbortController().signal,
      );
      expect(selects).toEqual([{ schema: "files", table: "files", columns: FILES_TABLE_COLUMNS }]);
      expect(result).toEqual({
        row: { id: "d24f733f-0032-44ac-ab43-b4dc030c95ba", file_name: "default-user-avatar.jpg" },
      });
    },
  );

  it("every detail table with a server-only column names readable columns, never `*`", () => {
    const offenders: string[] = [];
    for (const type of ALL_REGISTERED_TYPES) {
      const source = getItemConfig(type).config.detailSource;
      if (!source) continue;
      const key = `${source.schemaName ?? "public"}.${source.table}`;
      const denied = SERVER_ONLY_COLUMNS[key];
      if (!denied) continue;
      const columns = (source.columns ?? "*").split(",").map((c) => c.trim());
      if (columns.includes("*")) offenders.push(`${type} → ${key}: select('*')`);
      for (const col of denied) {
        if (columns.includes(col)) offenders.push(`${type} → ${key}: names ${col}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
