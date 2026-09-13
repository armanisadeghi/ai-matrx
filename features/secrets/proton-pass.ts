import { LosslessNumber, parse, stringify } from "lossless-json";

import { jsonDepthOk } from "./bitwarden-json";
import { safeDestination, type CsvImportLimits } from "./csv-import";
import type { StructuredImportRecord } from "./structured-import";

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : null;
const only = (value: Obj, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const textBytes = (value: string) =>
  typeof TextEncoder === "undefined"
    ? unescape(encodeURIComponent(value)).length
    : new TextEncoder().encode(value).byteLength;
const bounded = (value: unknown, limit: number): boolean => {
  if (typeof value === "string") return textBytes(value) <= limit;
  if (Array.isArray(value))
    return value.every((child) => bounded(child, limit));
  const record = obj(value);
  return (
    !record || Object.values(record).every((child) => bounded(child, limit))
  );
};
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): boolean =>
  value instanceof LosslessNumber &&
  /^(0|[1-9][0-9]*)$/.test(value.value) &&
  Number(value.value) <= max;
const rejected = (
  status: "invalid" | "unsupported",
  ordinal: number,
  title: string,
  reason: string,
): StructuredImportRecord => ({ status, ordinal, title, reason });

function validDisplay(value: unknown): boolean {
  const display = obj(value);
  return (
    !!display &&
    only(display, ["icon", "color"]) &&
    (display.icon === undefined || integer(display.icon, 31)) &&
    (display.color === undefined || integer(display.color, 11))
  );
}
function validFiles(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((name) => typeof name === "string" && name.length > 0)
  );
}
function sourceRecord(
  version: string,
  userId: string | undefined,
  vaultId: string,
  vault: Obj,
  item: Obj,
) {
  const envelope: Obj = {
    source_vendor: "proton_pass",
    format: "proton-pass-json-v1",
    version,
  };
  if (userId) envelope.userId = userId;
  envelope.vault = {
    id: vaultId,
    description: vault.description,
    display: vault.display,
    name: vault.name,
  };
  envelope.item = item;
  return stringify(envelope);
}
function itemRecord(
  item: Obj,
  vaultId: string,
  vault: Obj,
  version: string,
  userId: string | undefined,
  ordinal: number,
  limits: Pick<CsvImportLimits, "maxCellBytes">,
  binaryNames?: ReadonlySet<string>,
): StructuredImportRecord {
  const itemData = obj(item.data);
  const itemMetadata = obj(itemData?.metadata);
  const title =
    typeof itemMetadata?.name === "string"
      ? itemMetadata.name
      : `Item ${ordinal + 1}`;
  const itemKeys = [
    "itemId",
    "shareId",
    "data",
    "state",
    "aliasEmail",
    "contentFormatVersion",
    "createTime",
    "modifyTime",
    "pinned",
    "shareCount",
    "files",
  ];
  if (
    !only(item, itemKeys) ||
    typeof item.itemId !== "string" ||
    !item.itemId ||
    item.shareId !== vaultId ||
    !integer(item.state, 2) ||
    !integer(item.contentFormatVersion) ||
    !integer(item.createTime) ||
    !integer(item.modifyTime) ||
    typeof item.pinned !== "boolean" ||
    !(item.aliasEmail === null || typeof item.aliasEmail === "string") ||
    (item.shareCount !== undefined && !integer(item.shareCount)) ||
    !validFiles(item.files) ||
    !bounded(item, limits.maxCellBytes)
  )
    return rejected(
      "invalid",
      ordinal,
      title,
      "The Proton Pass item is invalid.",
    );
  if (
    Number((item.contentFormatVersion as LosslessNumber).value) !== 8 ||
    ![1, 2].includes(Number((item.state as LosslessNumber).value))
  )
    return rejected(
      "unsupported",
      ordinal,
      title,
      "This Proton Pass item format is unsupported.",
    );
  const data = obj(item.data);
  const metadata = obj(data?.metadata);
  const content = obj(data?.content);
  if (
    !data ||
    !metadata ||
    !content ||
    !only(data, [
      "type",
      "content",
      "platformSpecific",
      "extraFields",
      "metadata",
    ]) ||
    !only(metadata, ["name", "note", "itemUuid"]) ||
    !["name", "note", "itemUuid"].every(
      (key) => typeof metadata[key] === "string",
    ) ||
    !Array.isArray(data.extraFields)
  )
    return rejected(
      "invalid",
      ordinal,
      title,
      "The Proton Pass item data is invalid.",
    );
  if (item.files.length > 0 && !binaryNames)
    return rejected(
      "unsupported",
      ordinal,
      title,
      "Proton Pass attachments are unsupported.",
    );
  if (binaryNames && !item.files.every((name) => binaryNames.has(name)))
    throw new Error("The Proton Pass archive is invalid.");
  if (data.type !== "login" && data.type !== "note")
    return rejected(
      "unsupported",
      ordinal,
      title,
      "This Proton Pass item type is unsupported.",
    );
  if (data.type === "note") {
    if (!only(content, []))
      return rejected(
        "invalid",
        ordinal,
        title,
        "The Proton Pass note is invalid.",
      );
    return {
      status: "supported",
      ordinal,
      title: metadata.name as string,
      sourceState:
        Number((item.state as LosslessNumber).value) === 2
          ? "deleted"
          : "active",
      sourceRecord: sourceRecord(version, userId, vaultId, vault, item),
      hasOtp: false,
      kind: "custom",
    };
  }
  const loginKeys = [
    "itemEmail",
    "password",
    "urls",
    "totpUri",
    "passkeys",
    "itemUsername",
    "autofillUrls",
  ];
  if (
    !only(content, loginKeys) ||
    !["itemEmail", "password", "totpUri", "itemUsername"].every(
      (key) => typeof content[key] === "string",
    ) ||
    !Array.isArray(content.urls) ||
    !Array.isArray(content.autofillUrls) ||
    !Array.isArray(content.passkeys)
  )
    return rejected(
      "invalid",
      ordinal,
      title,
      "The Proton Pass login is invalid.",
    );
  if (content.passkeys.length || item.files.length)
    return rejected(
      "unsupported",
      ordinal,
      title,
      "Proton Pass passkeys and attachments are unsupported.",
    );
  const urls = content.urls as unknown[];
  const autofill = content.autofillUrls as unknown[];
  if (
    !urls.every((url) => typeof url === "string") ||
    !autofill.every((row) => {
      const value = obj(row);
      return (
        !!value &&
        only(value, ["url", "mode"]) &&
        typeof value.url === "string" &&
        integer(value.mode, 6)
      );
    })
  )
    return rejected(
      "invalid",
      ordinal,
      title,
      "The Proton Pass URL list is invalid.",
    );
  const defaults = autofill
    .filter((row) => Number((obj(row)?.mode as LosslessNumber).value) === 0)
    .map((row) => obj(row)?.url);
  if (
    defaults.length !== urls.length ||
    defaults.some((value, index) => value !== urls[index])
  )
    return rejected(
      "invalid",
      ordinal,
      title,
      "The Proton Pass URL projection is invalid.",
    );
  return {
    status: "supported",
    ordinal,
    title: metadata.name as string,
    sourceState:
      Number((item.state as LosslessNumber).value) === 2 ? "deleted" : "active",
    sourceRecord: sourceRecord(version, userId, vaultId, vault, item),
    hasOtp: (content.totpUri as string).length > 0,
    kind: "website_login",
    urls: urls
      .map(safeDestination)
      .flatMap((url) => (url.metadata ? [url.metadata] : [])),
    username:
      (content.itemUsername as string) || (content.itemEmail as string) || null,
    password: content.password as string,
  };
}

export function parseProtonPassExport(
  text: string,
  limits: Pick<
    CsvImportLimits,
    "maxFileBytes" | "maxRecords" | "maxCellBytes"
  > & {
    maxJsonDepth: number;
  },
  binaryNames?: ReadonlySet<string>,
): StructuredImportRecord[] {
  if (textBytes(text) > limits.maxFileBytes)
    throw new Error(
      "The Proton Pass export exceeds the organization size limit.",
    );
  let root: Obj;
  try {
    root = obj(parse(text)) ?? {};
  } catch {
    throw new Error("The Proton Pass export is invalid.");
  }
  if (
    !jsonDepthOk(root, limits.maxJsonDepth) ||
    !only(root, ["version", "userId", "vaults"]) ||
    typeof root.version !== "string" ||
    !root.version ||
    (root.userId !== undefined && typeof root.userId !== "string") ||
    !obj(root.vaults) ||
    !bounded(root, limits.maxCellBytes)
  )
    throw new Error("The Proton Pass export is invalid.");
  const records: StructuredImportRecord[] = [];
  const identities = new Set<string>();
  for (const [vaultId, value] of Object.entries(root.vaults as Obj)) {
    const vault = obj(value);
    if (
      !vault ||
      !vaultId ||
      !only(vault, ["description", "display", "name", "items"]) ||
      typeof vault.description !== "string" ||
      typeof vault.name !== "string" ||
      !validDisplay(vault.display) ||
      !Array.isArray(vault.items)
    )
      throw new Error("The Proton Pass vault is invalid.");
    for (const raw of vault.items) {
      if (records.length >= limits.maxRecords)
        throw new Error("The Proton Pass export has too many records.");
      const item = obj(raw);
      if (!item) {
        records.push(
          rejected(
            "invalid",
            records.length,
            `Item ${records.length + 1}`,
            "The Proton Pass item is invalid.",
          ),
        );
        continue;
      }
      const identity = `${vaultId}\0${String(item.itemId)}`;
      if (identities.has(identity))
        throw new Error(
          "The Proton Pass export has duplicate item identities.",
        );
      identities.add(identity);
      records.push(
        itemRecord(
          item,
          vaultId,
          vault,
          root.version,
          root.userId as string | undefined,
          records.length,
          limits,
          binaryNames,
        ),
      );
    }
  }
  return records;
}
