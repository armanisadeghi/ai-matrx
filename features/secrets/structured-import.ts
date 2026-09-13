import { isLoopbackApiUrl } from "@/lib/api/service-routing";
import type { VaultExpectedActor } from "./vault-service";
import type { VaultItemCreateRequest, VaultPrincipal } from "./types";
import { safeDestination, type CsvImportCommand, type CsvImportLimits, type CsvImportPreparation } from "./csv-import";

export type RejectedStructuredImportRecord = {
  status: "invalid" | "unsupported";
  ordinal: number;
  title: string;
  reason: string;
};
type StructuredImportBase = {
  status: "supported";
  ordinal: number;
  title: string;
  sourceState: "active" | "deleted" | "archived";
  sourceRecord: string;
  hasOtp: boolean;
};
export type StructuredImportRecord = RejectedStructuredImportRecord | (StructuredImportBase & (
  | { kind: "website_login"; urls: string[]; username: string | null; password: string | null }
  | { kind: "custom" }
  | { kind: "ssh_key"; privateKey: string; publicKey: string }
));

function bytes(value: string): number {
  return typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(value).byteLength
    : unescape(encodeURIComponent(value)).length;
}

export function hasVisiblePublicKey(record: StructuredImportRecord): boolean {
  return record.status === "supported" && record.kind === "ssh_key";
}

export function isPossibleStructuredImportDuplicate(
  record: StructuredImportRecord,
  existingItems: { displayName: string; loginUrls: string[] }[],
): boolean {
  if (record.status !== "supported") return false;
  const destination = record.kind === "website_login" ? record.urls[0] : undefined;
  return existingItems.some((item) => {
    if (item.displayName !== record.title) return false;
    const existingOrigins = item.loginUrls.map(safeDestination).flatMap((url) => url.metadata ? [url.metadata] : []);
    return destination ? existingOrigins.includes(destination) : existingOrigins.length === 0;
  });
}

export function prepareStructuredImportCommand(input: {
  record: StructuredImportRecord; principal: VaultPrincipal; expectedActor: VaultExpectedActor;
  rowId: string; browserFillEnabled: boolean; includeDeleted: boolean; includeArchived: boolean;
  limits: CsvImportLimits; existingItems?: { displayName: string; loginUrls: string[] }[]; skipPossibleDuplicate?: boolean;
}): CsvImportPreparation {
  const { record } = input;
  if (record.status === "invalid") return { status: "invalid", diagnostic: record.reason };
  if (record.status === "unsupported") return { status: "skipped", reason: "unsupported" };
  if (record.status !== "supported") return { status: "invalid", diagnostic: "The record is invalid." };
  if (typeof record.sourceRecord !== "string" || record.sourceRecord.length === 0)
    return { status: "invalid", diagnostic: "The record has no source representation." };
  if (record.sourceState === "deleted" && !input.includeDeleted) return { status: "skipped", reason: "deleted" };
  if (record.sourceState === "archived" && !input.includeArchived) return { status: "skipped", reason: "archived" };
  if (input.skipPossibleDuplicate && isPossibleStructuredImportDuplicate(record, input.existingItems ?? [])) return { status: "skipped", reason: "possible_duplicate" };
  const fields: NonNullable<VaultItemCreateRequest["fields"]> = [{ field_key: "import_source_record", value: record.sourceRecord, handling: "revealable", editable: false, inject_into_sandbox: false }];
  const add = (field_key: string, value: string, handling: "revealable" | "visible" = "revealable", editable = true) => fields.push({ field_key, value, handling, editable, inject_into_sandbox: false });
  let browserFillEnabled = false; let uriMatchMode: "host" | "never" = "never";
  const destination = record.kind === "website_login" ? record.urls[0] : undefined;
  if (record.kind === "website_login") {
    if (record.username) add("username", record.username);
    if (record.password) add("password", record.password);
    browserFillEnabled = Boolean(input.browserFillEnabled && record.username && record.password && destination && (new URL(destination).protocol === "https:" || isLoopbackApiUrl(destination)));
    uriMatchMode = browserFillEnabled ? "host" : "never";
  }
  if (record.kind === "ssh_key") { add("private_key", record.privateKey); add("public_key", record.publicKey, "visible"); }
  const body: VaultItemCreateRequest = { principal: input.principal.type === "organization" ? { type: "organization", organization_id: input.principal.organizationId } : { type: "user" }, display_name: record.title, definition_key: record.kind, source: "system_import", login_urls: record.kind === "website_login" && destination ? [destination] : [], uri_match_mode: uriMatchMode, browser_fill_enabled: browserFillEnabled, fields };
  if (fields.length > input.limits.maxFields || fields.some((field) => bytes(field.value) > input.limits.maxPlaintextFieldBytes) || bytes(JSON.stringify(body)) > input.limits.maxRequestBodyBytes) return { status: "invalid", diagnostic: "The record exceeds this organization’s encrypted field limit." };
  const command: CsvImportCommand = { rowId: input.rowId, expectedActor: input.expectedActor, hasOtp: record.hasOtp, body };
  return { status: "ready", command };
}
