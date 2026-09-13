/** Bitwarden's plain JSON export adapter. Parsing is only invoked by its worker. */
import { LosslessNumber, parse, stringify } from "lossless-json";

import { safeDestination, type CsvImportLimits } from "./csv-import";
import type { StructuredImportRecord } from "./structured-import";

type JsonObject = Record<string, unknown>;
const rootKeys = new Set(["encrypted", "folders", "items"]);
const folderKeys = new Set(["id", "name"]);
const itemKeys = new Set(["id", "name", "type", "folderId", "organizationId", "collectionIds", "notes", "login", "secureNote", "card", "identity", "sshKey", "favorite", "reprompt", "fields", "passwordHistory", "revisionDate", "creationDate", "deletedDate", "attachments"]);
const loginKeys = new Set(["username", "password", "totp", "uris", "fido2Credentials"]);
const uriKeys = new Set(["uri", "match"]);
const sshKeys = new Set(["privateKey", "publicKey", "keyFingerprint"]);
const fieldKeys = new Set(["name", "value", "type", "linkedId"]);
const noteKeys = new Set(["type"]);
const cardKeys = new Set(["cardholderName", "expMonth", "expYear", "code", "brand", "number"]);
const identityKeys = new Set(["title", "firstName", "middleName", "lastName", "address1", "address2", "address3", "city", "state", "postalCode", "country", "company", "email", "phone", "ssn", "username", "passportNumber", "licenseNumber"]);

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}
function bytes(value: string): number {
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(value).byteLength : unescape(encodeURIComponent(value)).length;
}
function only(value: JsonObject, allowed: Set<string>): boolean { return Object.keys(value).every((key) => allowed.has(key)); }
function stringOrNull(value: unknown): value is string | null { return value === null || typeof value === "string"; }
function exactInt(value: unknown, min: number, max: number): boolean {
  const text = value instanceof LosslessNumber ? value.value : "";
  return /^(0|[1-9][0-9]*)$/.test(text) && Number(text) >= min && Number(text) <= max;
}
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function timestamp(value: unknown): boolean { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value); }
function depthOk(value: unknown, maxDepth: number): boolean {
  const stack: Array<[unknown, number]> = [[value, 1]];
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (depth > maxDepth) return false;
    const record = object(node);
    const children: unknown[] = Array.isArray(node)
      ? node
      : record
        ? Object.values(record)
        : [];
    for (const child of children) stack.push([child, depth + 1]);
  }
  return true;
}
function allStringsWithin(value: unknown, maxBytes: number): boolean {
  if (typeof value === "string") return bytes(value) <= maxBytes;
  if (Array.isArray(value)) return value.every((entry) => allStringsWithin(entry, maxBytes));
  const record = object(value);
  return !record || Object.values(record).every((entry) => allStringsWithin(entry, maxBytes));
}
function invalid(title: string, ordinal: number, reason: string): StructuredImportRecord { return { ordinal, title, status: "invalid", reason }; }
function unsupported(title: string, ordinal: number, reason: string): StructuredImportRecord { return { ordinal, title, status: "unsupported", reason }; }

function itemRecord(item: JsonObject, ordinal: number, maxCellBytes: number, maxJsonDepth: number, folders: JsonObject[]): StructuredImportRecord {
  const candidateTitle = typeof item.name === "string" ? item.name : `Item ${ordinal + 1}`;
  const title = bytes(candidateTitle) <= maxCellBytes ? candidateTitle : `Item ${ordinal + 1}`;
  if (!only(item, itemKeys)) return unsupported(title, ordinal, "The item has an unsupported field.");
  if (!uuid(item.id) || typeof item.name !== "string" || !exactInt(item.type, 1, 5)) return exactInt(item.type, 0, Number.MAX_SAFE_INTEGER) ? unsupported(title, ordinal, "The item type is unsupported.") : invalid(title, ordinal, "The item shape is not supported.");
  if (!["folderId", "organizationId", "notes"].every((key) => item[key] === undefined || stringOrNull(item[key])) || ["revisionDate", "creationDate", "deletedDate"].some((key) => item[key] !== undefined && item[key] !== null && !timestamp(item[key])) || (item.folderId != null && !uuid(item.folderId)) || (item.organizationId != null && !uuid(item.organizationId)) || (item.collectionIds != null && (!Array.isArray(item.collectionIds) || !item.collectionIds.every(uuid))) || (item.favorite != null && typeof item.favorite !== "boolean") || (item.reprompt != null && !exactInt(item.reprompt, 0, 1))) return invalid(title, ordinal, "The item metadata is invalid.");
  if (item.fields != null && (!Array.isArray(item.fields) || !item.fields.every((field) => { const row = object(field); return !!row && only(row, fieldKeys) && exactInt(row.type, 0, 3) && (row.name === undefined || stringOrNull(row.name)) && (row.value === undefined || stringOrNull(row.value)) && (row.linkedId === undefined || row.linkedId === null || exactInt(row.linkedId, 0, 4294967295)); }))) return invalid(title, ordinal, "The custom fields are invalid.");
  if (item.passwordHistory != null && (!Array.isArray(item.passwordHistory) || !item.passwordHistory.every((entry) => { const row = object(entry); return !!row && Object.keys(row).length === 2 && typeof row.password === "string" && timestamp(row.lastUsedDate); }))) return invalid(title, ordinal, "The password history is invalid.");
  if (item.attachments !== undefined && item.attachments !== null && !Array.isArray(item.attachments)) return invalid(title, ordinal, "The attachment fields are invalid.");
  if (!depthOk(item, maxJsonDepth) || !allStringsWithin(item, maxCellBytes)) return invalid(title, ordinal, "The item exceeds the import limits.");
  const type = Number((item.type as LosslessNumber).value);
  const matching = type === 1 ? "login" : type === 2 ? "secureNote" : type === 3 ? "card" : type === 4 ? "identity" : "sshKey";
  for (const component of ["login", "secureNote", "card", "identity", "sshKey"] as const) if (component !== matching && item[component] != null) return unsupported(title, ordinal, "The item has an unclassified component.");
  if (Array.isArray(item.attachments) && item.attachments.length) return unsupported(title, ordinal, "Attachments require a later import path.");
  const sourceRecord = stringify({ source_vendor: "bitwarden", format: "bitwarden-json-export-v1", item, folders: typeof item.folderId === "string" ? folders.filter((folder) => folder.id === item.folderId) : [] });
  if (type === 1) {
    const login = object(item.login); if (!login) return invalid(title, ordinal, "The login fields are invalid."); if (!only(login, loginKeys)) return unsupported(title, ordinal, "The login has an unsupported field."); if (!["username", "password", "totp"].every((key) => login[key] === undefined || stringOrNull(login[key])) || (login.uris !== undefined && !Array.isArray(login.uris)) || (login.fido2Credentials !== undefined && !Array.isArray(login.fido2Credentials))) return invalid(title, ordinal, "The login fields are invalid.");
    if (Array.isArray(login.fido2Credentials) && login.fido2Credentials.length) return unsupported(title, ordinal, "Passkeys require a later import path.");
    const rawUrls: string[] = [];
    for (const uri of login.uris ?? []) { const row = object(uri); if (!row || !only(row, uriKeys)) return unsupported(title, ordinal, "The login has an unsupported URL field."); if ((row.uri !== undefined && !stringOrNull(row.uri)) || (row.match !== undefined && row.match !== null && !exactInt(row.match, 0, 5))) return invalid(title, ordinal, "The login URL fields are invalid."); if (typeof row.uri === "string") rawUrls.push(row.uri); }
    return { ordinal, title, kind: "website_login", status: "supported", sourceState: item.deletedDate ? "deleted" : "active", sourceRecord, urls: rawUrls.map(safeDestination).flatMap((x) => x.metadata ? [x.metadata] : []), username: typeof login.username === "string" ? login.username : null, password: typeof login.password === "string" ? login.password : null, hasOtp: typeof login.totp === "string" && login.totp.length > 0 };
  }
  if (type === 5) { const key = object(item.sshKey); if (!key || !only(key, sshKeys) || typeof key.privateKey !== "string" || !key.privateKey || typeof key.publicKey !== "string" || typeof key.keyFingerprint !== "string") return invalid(title, ordinal, "The SSH key fields are invalid."); return { ordinal, title, kind: "ssh_key", status: "supported", sourceState: item.deletedDate ? "deleted" : "active", sourceRecord, hasOtp: false, privateKey: key.privateKey, publicKey: key.publicKey }; }
  const component = object(item[matching]); const allowed = type === 2 ? noteKeys : type === 3 ? cardKeys : identityKeys;
  if (!component) return invalid(title, ordinal, "The item fields are invalid."); if (!only(component, allowed)) return unsupported(title, ordinal, "The item has an unsupported field.");
  if (type === 2 && !exactInt(component.type, 0, 0)) return invalid(title, ordinal, "The secure note type is invalid.");
  if (Object.entries(component).some(([key, value]) => key !== "type" && !stringOrNull(value))) return invalid(title, ordinal, "The item fields are invalid.");
  return { ordinal, title, kind: "custom", status: "supported", sourceState: item.deletedDate ? "deleted" : "active", sourceRecord, hasOtp: false };
}

export function parseBitwardenExport(text: string, limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords" | "maxCellBytes"> & { maxJsonDepth: number }): StructuredImportRecord[] {
  if (bytes(text) > limits.maxFileBytes) throw new Error("The file exceeds this organization’s import size limit.");
  // Our pinned lossless-json patch rejects every duplicate key, including equal values; keep its details out of UI.
  let root: JsonObject; try { root = object(parse(text)) ?? {}; } catch { throw new Error("The JSON export has duplicate keys or could not be read safely."); }
  if (!depthOk(root, limits.maxJsonDepth) || !only(root, rootKeys) || root.encrypted !== false || !Array.isArray(root.folders) || !Array.isArray(root.items)) throw new Error(root.encrypted === true ? "Encrypted Bitwarden exports need local decryption support before they can be imported." : "This is not a supported plain Bitwarden JSON export.");
  if (root.items.length > limits.maxRecords) throw new Error("The export has more records than this organization allows.");
  if (!root.folders.every((folder) => { const row = object(folder); return !!row && only(row, folderKeys) && uuid(row.id) && typeof row.name === "string" && allStringsWithin(row, limits.maxCellBytes); })) throw new Error("The export folders are not supported.");
  return root.items.map((item, ordinal) => object(item) ? itemRecord(item, ordinal, limits.maxCellBytes, limits.maxJsonDepth, root.folders as JsonObject[]) : invalid(`Item ${ordinal + 1}`, ordinal, "The item is invalid."));
}
