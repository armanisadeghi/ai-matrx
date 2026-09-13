import { LosslessNumber, parse, stringify } from "lossless-json";

import { safeDestination, type CsvImportLimits } from "./csv-import";
import type { StructuredImportRecord } from "./structured-import";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : null;
const only = (value: ObjectValue, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const bytes = (value: string) => typeof TextEncoder !== "undefined" ? new TextEncoder().encode(value).byteLength : unescape(encodeURIComponent(value)).length;
const integer = (value: unknown) => value instanceof LosslessNumber && /^(0|[1-9][0-9]*)$/.test(value.value) && Number(value.value) <= Number.MAX_SAFE_INTEGER;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");
const rejected = (status: "invalid" | "unsupported", ordinal: number, title: string, reason: string): StructuredImportRecord => ({ status, ordinal, title, reason });

function loginRecord(item: ObjectValue, ordinal: number, attrs: ObjectValue, account: ObjectValue, vault: ObjectValue): StructuredImportRecord {
  const overview = object(item.overview);
  const details = object(item.details);
  const title = typeof overview?.title === "string" ? overview.title : `Item ${ordinal + 1}`;
  if (!overview || !details || !only(item, ["uuid", "favIndex", "createdAt", "updatedAt", "state", "categoryUuid", "overview", "details"])) return rejected("unsupported", ordinal, title, "The 1Password item has an unsupported field.");
  if (typeof item.uuid !== "string" || !item.uuid || !integer(item.favIndex) || !integer(item.createdAt) || !integer(item.updatedAt) || (item.state !== "active" && item.state !== "archived") || typeof item.categoryUuid !== "string") return rejected("invalid", ordinal, title, "The 1Password item shape is invalid.");
  if (item.categoryUuid !== "001") return rejected("unsupported", ordinal, title, "Only 1Password login items are supported.");
  if (!only(overview, ["title", "subtitle", "url", "urls", "tags", "ps", "pbe", "pgrng", "icons", "watchtowerExclusions"]) || typeof overview.title !== "string" || typeof overview.subtitle !== "string" || typeof overview.url !== "string") return rejected("invalid", ordinal, title, "The 1Password overview is invalid.");
  if (overview.urls !== undefined && overview.urls !== null && (!Array.isArray(overview.urls) || !overview.urls.every((entry) => { const row = object(entry); return !!row && Object.keys(row).length === 2 && typeof row.label === "string" && typeof row.url === "string"; }))) return rejected("invalid", ordinal, title, "The 1Password URL list is invalid.");
  if (!only(details, ["loginFields", "notesPlain", "sections", "passwordHistory", "documentAttributes", "password"]) || (details.documentAttributes != null || details.password != null)) return rejected("unsupported", ordinal, title, "This 1Password item requires a later import path.");
  if (details.loginFields !== undefined && details.loginFields !== null && !Array.isArray(details.loginFields)) return rejected("invalid", ordinal, title, "The 1Password login fields are invalid.");
  let username: string | null = null;
  let password: string | null = null;
  let hasOtp = false;
  for (const entry of details.loginFields ?? []) {
    const field = object(entry);
    if (!field || !only(field, ["id", "name", "value", "fieldType", "designation"]) || typeof field.id !== "string" || typeof field.name !== "string" || typeof field.value !== "string" || !["T", "E", "U", "N", "P", "A", "TEL", "C"].includes(String(field.fieldType)) || (field.designation !== undefined && field.designation !== null && field.designation !== "username" && field.designation !== "password")) return rejected("invalid", ordinal, title, "The 1Password login fields are invalid.");
    if (field.designation === "username") { if (username !== null) return rejected("invalid", ordinal, title, "The 1Password login has duplicate username fields."); username = field.value; }
    if (field.designation === "password") { if (password !== null) return rejected("invalid", ordinal, title, "The 1Password login has duplicate password fields."); password = field.value; }
    if (field.fieldType === "T" && field.name.toLowerCase().includes("one-time") && field.value) hasOtp = true;
  }
  const rawUrls = [overview.url, ...(Array.isArray(overview.urls) ? overview.urls.map((entry) => (entry as ObjectValue).url).filter((url): url is string => typeof url === "string") : [])];
  return { status: "supported", ordinal, title, sourceState: item.state === "archived" ? "archived" : "active", sourceRecord: stringify({ source_vendor: "1password", format: "1pux-v3", export_attributes: attrs, account_attributes: account, vault_attributes: vault, item }), hasOtp, kind: "website_login", urls: rawUrls.map(safeDestination).flatMap((url) => url.metadata ? [url.metadata] : []), username, password };
}

export function parseOnePuxData(text: string, limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords">): StructuredImportRecord[] {
  if (bytes(text) > limits.maxFileBytes) throw new Error("The 1Password export exceeds this organization’s import size limit.");
  let root: ObjectValue;
  try { root = object(parse(text)) ?? {}; } catch { throw new Error("The 1Password export could not be read safely."); }
  if (!only(root, ["accounts"]) || !Array.isArray(root.accounts)) throw new Error("This is not a supported 1Password 1PUX export.");
  const records: StructuredImportRecord[] = [];
  for (const accountRow of root.accounts) {
    const account = object(accountRow); const attrs = object(account?.attrs);
    if (!account || !attrs || !only(account, ["attrs", "vaults"]) || !Array.isArray(account.vaults)) throw new Error("The 1Password account structure is invalid.");
    for (const vaultRow of account.vaults) {
      const vault = object(vaultRow); const vaultAttrs = object(vault?.attrs);
      if (!vault || !vaultAttrs || !only(vault, ["attrs", "items"]) || !Array.isArray(vault.items)) throw new Error("The 1Password vault structure is invalid.");
      for (const item of vault.items) { if (records.length >= limits.maxRecords) throw new Error("The export has more records than this organization allows."); const row = object(item); records.push(row ? loginRecord(row, records.length, attrs, attrs, vaultAttrs) : rejected("invalid", records.length, `Item ${records.length + 1}`, "The 1Password item is invalid.")); }
    }
  }
  return records;
}
