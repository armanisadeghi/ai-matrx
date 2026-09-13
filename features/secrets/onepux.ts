import { LosslessNumber, parse, stringify } from "lossless-json";

import { safeDestination, type CsvImportLimits } from "./csv-import";
import type { StructuredImportRecord } from "./structured-import";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : null;
const only = (value: ObjectValue, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const bytes = (value: string) => typeof TextEncoder !== "undefined" ? new TextEncoder().encode(value).byteLength : unescape(encodeURIComponent(value)).length;
const integer = (value: unknown) => value instanceof LosslessNumber && /^(0|[1-9][0-9]*)$/.test(value.value) && Number(value.value) <= Number.MAX_SAFE_INTEGER;
const nonnegativeNumber = (value: unknown) => value instanceof LosslessNumber && Number.isFinite(Number(value.value)) && Number(value.value) >= 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");
const rejected = (status: "invalid" | "unsupported", ordinal: number, title: string, reason: string): StructuredImportRecord => ({ status, ordinal, title, reason });
function sectionsValid(value: unknown): "valid" | "invalid" | "unsupported" {
  if (value === undefined || value === null) return "valid";
  if (!Array.isArray(value)) return "invalid";
  for (const entry of value) {
    const section = object(entry);
    if (!section || !only(section, ["title", "name", "fields", "hideAddAnotherField"]) || typeof section.title !== "string" || (section.name !== undefined && section.name !== null && typeof section.name !== "string") || (section.hideAddAnotherField !== undefined && typeof section.hideAddAnotherField !== "boolean") || !Array.isArray(section.fields)) return "invalid";
    for (const fieldEntry of section.fields) {
      const field = object(fieldEntry); const traits = object(field?.inputTraits); const valueObject = object(field?.value);
      if (!field || !only(field, ["title", "id", "value", "guarded", "multiline", "dontGenerate", "inputTraits", "placeholder", "clipboardFilter", "indexAtSource"]) || typeof field.title !== "string" || typeof field.id !== "string" || typeof field.guarded !== "boolean" || typeof field.multiline !== "boolean" || typeof field.dontGenerate !== "boolean" || !traits || !only(traits, ["keyboard", "correction", "capitalization"]) || !Object.values(traits).every((item) => typeof item === "string") || (field.placeholder !== undefined && typeof field.placeholder !== "string") || (field.clipboardFilter !== undefined && field.clipboardFilter !== null && typeof field.clipboardFilter !== "string") || (field.indexAtSource !== undefined && !integer(field.indexAtSource)) || !valueObject) return "invalid";
      const keys = Object.keys(valueObject); if (keys.length !== 1) return "invalid";
      const key = keys[0]!; const fieldValue = valueObject[key];
      if (["string", "concealed", "totp", "url", "phone", "menu", "reference"].includes(key)) { if (typeof fieldValue !== "string") return "invalid"; continue; }
      if (key === "email") { const email = object(fieldValue); if (!email || !only(email, ["email_address", "provider"]) || typeof email.email_address !== "string" || (email.provider !== null && typeof email.provider !== "string")) return "invalid"; continue; }
      return "unsupported";
    }
  }
  return "valid";
}

function loginRecord(item: ObjectValue, ordinal: number, attrs: ObjectValue, account: ObjectValue, vault: ObjectValue): StructuredImportRecord {
  const overview = object(item.overview);
  const details = object(item.details);
  const title = typeof overview?.title === "string" ? overview.title : `Item ${ordinal + 1}`;
  if (!overview || !details || !only(item, ["uuid", "favIndex", "createdAt", "updatedAt", "state", "categoryUuid", "overview", "details"])) return rejected("unsupported", ordinal, title, "The 1Password item has an unsupported field.");
  if (typeof item.uuid !== "string" || !item.uuid || !integer(item.favIndex) || !integer(item.createdAt) || !integer(item.updatedAt) || (item.state !== "active" && item.state !== "archived") || typeof item.categoryUuid !== "string") return rejected("invalid", ordinal, title, "The 1Password item shape is invalid.");
  if (item.categoryUuid !== "001") return rejected("unsupported", ordinal, title, "Only 1Password login items are supported.");
  if (!only(overview, ["title", "subtitle", "url", "urls", "tags", "ps", "pbe", "pgrng", "icons", "watchtowerExclusions"]) || typeof overview.title !== "string" || typeof overview.subtitle !== "string" || typeof overview.url !== "string" || [overview.tags, overview.urls].some((value) => value !== undefined && value !== null && !Array.isArray(value)) || [overview.ps, overview.pbe].some((value) => value !== undefined && value !== null && !nonnegativeNumber(value)) || (overview.pgrng !== undefined && overview.pgrng !== null && typeof overview.pgrng !== "boolean") || [overview.icons, overview.watchtowerExclusions].some((value) => value !== undefined && value !== null && typeof value !== "string") || (Array.isArray(overview.tags) && !strings(overview.tags))) return rejected("invalid", ordinal, title, "The 1Password overview is invalid.");
  if (overview.urls !== undefined && overview.urls !== null && (!Array.isArray(overview.urls) || !overview.urls.every((entry) => { const row = object(entry); return !!row && Object.keys(row).length === 2 && typeof row.label === "string" && typeof row.url === "string"; }))) return rejected("invalid", ordinal, title, "The 1Password URL list is invalid.");
  if (!only(details, ["loginFields", "notesPlain", "sections", "passwordHistory", "documentAttributes", "password"]) || (details.documentAttributes != null || details.password != null)) return rejected("unsupported", ordinal, title, "This 1Password item requires a later import path.");
  const sectionState = sectionsValid(details.sections);
  if (sectionState !== "valid") return rejected(sectionState, ordinal, title, sectionState === "unsupported" ? "The 1Password item has an unsupported field value." : "The 1Password sections are invalid.");
  if ((details.notesPlain !== undefined && details.notesPlain !== null && typeof details.notesPlain !== "string") || (details.passwordHistory !== undefined && details.passwordHistory !== null && (!Array.isArray(details.passwordHistory) || !details.passwordHistory.every((entry) => { const row = object(entry); return !!row && only(row, ["value", "time"]) && typeof row.value === "string" && integer(row.time); })))) return rejected("invalid", ordinal, title, "The 1Password details are invalid.");
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

function attributes(value: ObjectValue, account: boolean): boolean {
  const keys = account ? ["accountName", "name", "avatar", "email", "uuid", "domain"] : ["uuid", "desc", "avatar", "name", "type"];
  const idKey = "uuid";
  return only(value, keys) && keys.every((key) => typeof value[key] === "string") && typeof value[idKey] === "string" && (value[idKey] as string).length > 0 && (!account ? ["P", "E", "U"].includes(value.type as string) : true);
}

export function parseOnePuxData(exportAttributesText: string, exportDataText: string, limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords">): StructuredImportRecord[] {
  if (bytes(exportAttributesText) + bytes(exportDataText) > limits.maxFileBytes) throw new Error("The 1Password export exceeds this organization’s import size limit.");
  let exportAttributes: ObjectValue;
  try { exportAttributes = object(parse(exportAttributesText)) ?? {}; } catch { throw new Error("The 1Password export attributes could not be read safely."); }
  if (!only(exportAttributes, ["version", "description", "createdAt"]) || !integer(exportAttributes.version) || (exportAttributes.version as LosslessNumber).value !== "3" || exportAttributes.description !== "1Password Unencrypted Export" || !integer(exportAttributes.createdAt)) throw new Error("This is not a supported unencrypted 1Password v3 export.");
  let root: ObjectValue;
  try { root = object(parse(exportDataText)) ?? {}; } catch { throw new Error("The 1Password export could not be read safely."); }
  if (!only(root, ["accounts"]) || !Array.isArray(root.accounts)) throw new Error("This is not a supported 1Password 1PUX export.");
  const records: StructuredImportRecord[] = [];
  const accountIds = new Set<string>();
  for (const accountRow of root.accounts) {
    const account = object(accountRow); const attrs = object(account?.attrs);
    if (!account || !attrs || !attributes(attrs, true) || !only(account, ["attrs", "vaults"]) || !Array.isArray(account.vaults) || accountIds.has(attrs.uuid as string)) throw new Error("The 1Password account structure is invalid.");
    accountIds.add(attrs.uuid as string); const vaultIds = new Set<string>();
    for (const vaultRow of account.vaults) {
      const vault = object(vaultRow); const vaultAttrs = object(vault?.attrs);
      if (!vault || !vaultAttrs || !attributes(vaultAttrs, false) || !only(vault, ["attrs", "items"]) || !Array.isArray(vault.items) || vaultIds.has(vaultAttrs.uuid as string)) throw new Error("The 1Password vault structure is invalid.");
      vaultIds.add(vaultAttrs.uuid as string); const itemIds = new Set<string>();
      for (const item of vault.items) { if (records.length >= limits.maxRecords) throw new Error("The export has more records than this organization allows."); const row = object(item); if (row && typeof row.uuid === "string" && itemIds.has(row.uuid)) throw new Error("The 1Password vault has duplicate item IDs."); if (row && typeof row.uuid === "string") itemIds.add(row.uuid); records.push(row ? loginRecord(row, records.length, exportAttributes, attrs, vaultAttrs) : rejected("invalid", records.length, `Item ${records.length + 1}`, "The 1Password item is invalid.")); }
    }
  }
  return records;
}
