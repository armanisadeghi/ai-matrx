import { LosslessNumber, parse, stringify } from "lossless-json";
import { jsonDepthOk } from "./bitwarden-json";
import { safeDestination, type CsvImportLimits } from "./csv-import";
import type { StructuredImportRecord } from "./structured-import";

type Obj = Record<string, unknown>;
const object = (x: unknown): Obj | undefined =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Obj)
    : undefined;
const exact = (
  x: Obj,
  required: readonly string[],
  optional: readonly string[] = [],
) =>
  Object.keys(x).every((k) => required.includes(k) || optional.includes(k)) &&
  required.every((k) => k in x);
const bytes = (x: string) =>
  typeof TextEncoder === "undefined"
    ? unescape(encodeURIComponent(x)).length
    : new TextEncoder().encode(x).byteLength;
const string = (x: unknown, max: number, nonempty = false) =>
  typeof x === "string" && (!nonempty || x.length > 0) && bytes(x) <= max;
const allStringsBounded = (x: unknown, max: number): boolean =>
  typeof x === "string"
    ? bytes(x) <= max
    : Array.isArray(x)
      ? x.every((v) => allStringsBounded(v, max))
      : !object(x) ||
        Object.values(object(x)!).every((v) => allStringsBounded(v, max));
const integer = (x: unknown, max = Number.MAX_SAFE_INTEGER) =>
  x instanceof LosslessNumber &&
  /^(0|[1-9][0-9]*)$/.test(x.value) &&
  Number(x.value) <= max;
const n = (x: unknown) => Number((x as LosslessNumber).value);
const reject = (
  status: "invalid" | "unsupported",
  ordinal: number,
  title: string,
  reason: string,
): StructuredImportRecord => ({ status, ordinal, title, reason });
const itemTitle = (item: Obj, ordinal: number) => {
  const data = object(item.data);
  const meta = object(data?.metadata);
  return typeof meta?.name === "string" ? meta.name : `Item ${ordinal + 1}`;
};

function displayStatus(x: unknown): "valid" | "invalid" | "unsupported" {
  const d = object(x);
  if (!d || !exact(d, [], ["icon", "color"])) return "invalid";
  if (
    (d.icon !== undefined && !integer(d.icon)) ||
    (d.color !== undefined && !integer(d.color))
  )
    return "invalid";
  return (d.icon !== undefined && n(d.icon) > 31) ||
    (d.color !== undefined && n(d.color) > 11)
    ? "unsupported"
    : "valid";
}
function validExtra(x: unknown, max: number) {
  return (
    Array.isArray(x) &&
    x.every((raw) => {
      const f = object(raw);
      if (
        !f ||
        !exact(f, ["fieldName", "type", "data"]) ||
        !string(f.fieldName, max)
      )
        return false;
      const d = object(f.data);
      if (!d) return false;
      return f.type === "totp"
        ? exact(d, ["totpUri"]) && string(d.totpUri, max)
        : f.type === "text" || f.type === "hidden"
          ? exact(d, ["content"]) && string(d.content, max)
          : f.type === "timestamp" &&
            exact(d, ["timestamp"]) &&
            string(d.timestamp, max);
    })
  );
}
function validPlatform(x: unknown, max: number) {
  if (x === undefined) return true;
  const p = object(x);
  if (!p || !exact(p, [], ["android"])) return false;
  if (p.android === undefined) return true;
  const a = object(p.android);
  return (
    !!a &&
    exact(a, ["allowedApps"]) &&
    Array.isArray(a.allowedApps) &&
    a.allowedApps.every((raw) => {
      const app = object(raw);
      return (
        !!app &&
        exact(app, ["packageName", "hashes", "appName"]) &&
        string(app.packageName, max) &&
        string(app.appName, max) &&
        Array.isArray(app.hashes) &&
        app.hashes.every((v) => string(v, max))
      );
    })
  );
}
function base64(x: unknown, max: number) {
  if (!string(x, max)) return false;
  const value = x as string;
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    return false;
  const pad = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (pad === 1 && (alphabet.indexOf(value.at(-2)!) & 3) !== 0) return false;
  if (pad === 2 && (alphabet.indexOf(value.at(-3)!) & 15) !== 0) return false;
  return 3 * (value.length / 4) - pad <= max;
}
function validPasskeys(x: unknown, max: number) {
  return (
    Array.isArray(x) &&
    x.every((raw) => {
      const p = object(raw);
      if (
        !p ||
        !exact(
          p,
          [
            "keyId",
            "content",
            "domain",
            "rpId",
            "rpName",
            "userName",
            "userDisplayName",
            "userId",
            "createTime",
            "note",
            "credentialId",
            "userHandle",
          ],
          ["creationData"],
        ) ||
        !["keyId", "content", "credentialId", "userHandle"].every((k) =>
          base64(p[k], max),
        ) ||
        ![
          "domain",
          "rpId",
          "rpName",
          "userName",
          "userDisplayName",
          "userId",
          "note",
        ].every((k) => string(p[k], max)) ||
        !integer(p.createTime, 4294967295)
      )
        return false;
      if (p.creationData === undefined) return true;
      const c = object(p.creationData);
      return (
        !!c &&
        exact(c, ["osName", "osVersion", "deviceName", "appVersion"]) &&
        Object.values(c).every((v) => string(v, max))
      );
    })
  );
}
function canonical(item: Obj): Obj {
  const data = item.data as Obj,
    content = data.content as Obj,
    meta = data.metadata as Obj;
  const out: Obj = {
    itemId: item.itemId,
    shareId: item.shareId,
    data: {
      type: data.type,
      content:
        data.type === "note"
          ? {}
          : {
              itemEmail: content.itemEmail,
              password: content.password,
              urls: content.urls,
              totpUri: content.totpUri,
              passkeys: content.passkeys,
              itemUsername: content.itemUsername,
              autofillUrls: content.autofillUrls,
            },
      ...(data.platformSpecific === undefined
        ? {}
        : {
            platformSpecific: canonicalPlatform(data.platformSpecific as Obj),
          }),
      extraFields: (data.extraFields as Obj[]).map(canonicalExtra),
      metadata: { name: meta.name, note: meta.note, itemUuid: meta.itemUuid },
    },
    state: item.state,
    aliasEmail: item.aliasEmail,
    contentFormatVersion: item.contentFormatVersion,
    createTime: item.createTime,
    modifyTime: item.modifyTime,
    pinned: item.pinned,
  };
  if (item.shareCount !== undefined) out.shareCount = item.shareCount;
  out.files = [...(item.files as string[])];
  return out;
}
function canonicalExtra(field: Obj): Obj {
  const data = field.data as Obj;
  return {
    fieldName: field.fieldName,
    type: field.type,
    data:
      field.type === "totp"
        ? { totpUri: data.totpUri }
        : field.type === "timestamp"
          ? { timestamp: data.timestamp }
          : { content: data.content },
  };
}
function canonicalPlatform(platform: Obj): Obj {
  if (platform.android === undefined) return {};
  const android = platform.android as Obj;
  return {
    android: {
      allowedApps: (android.allowedApps as Obj[]).map((app) => ({
        packageName: app.packageName,
        hashes: [...(app.hashes as string[])],
        appName: app.appName,
      })),
    },
  };
}
function source(
  version: string,
  userId: string | undefined,
  vaultId: string,
  vault: Obj,
  item: Obj,
) {
  const value: Obj = {
    source_vendor: "proton_pass",
    format: "proton-pass-json-v1",
    version,
  };
  if (userId !== undefined) value.userId = userId;
  value.vault = {
    id: vaultId,
    description: vault.description,
    display: {
      ...((vault.display as Obj).icon === undefined
        ? {}
        : { icon: (vault.display as Obj).icon }),
      ...((vault.display as Obj).color === undefined
        ? {}
        : { color: (vault.display as Obj).color }),
    },
    name: vault.name,
  };
  value.item = canonical(item);
  return stringify(value);
}
type Entry = {
  item: Obj;
  vault: Obj;
  vaultId: string;
  ordinal: number;
  vaultUnsupported?: boolean;
};
function validate(
  entry: Entry,
  version: string,
  userId: string | undefined,
  max: number,
): StructuredImportRecord {
  const { item, vault, vaultId, ordinal } = entry,
    title = itemTitle(item, ordinal);
  if (
    ![
      "itemId",
      "shareId",
      "data",
      "state",
      "aliasEmail",
      "contentFormatVersion",
      "createTime",
      "modifyTime",
      "pinned",
      "files",
    ].every((key) => key in item) ||
    !string(item.itemId, max, true) ||
    item.shareId !== vaultId ||
    !integer(item.state) ||
    !integer(item.contentFormatVersion) ||
    !integer(item.createTime) ||
    !integer(item.modifyTime) ||
    typeof item.pinned !== "boolean" ||
    !(item.aliasEmail === null || string(item.aliasEmail, max)) ||
    (item.shareCount !== undefined && !integer(item.shareCount)) ||
    !Array.isArray(item.files) ||
    !item.files.every((v) => string(v, max, true)) ||
    !allStringsBounded(item, max)
  )
    return reject(
      "invalid",
      ordinal,
      title,
      "The Proton Pass item is invalid.",
    );
  if (
    !exact(
      item,
      [
        "itemId",
        "shareId",
        "data",
        "state",
        "aliasEmail",
        "contentFormatVersion",
        "createTime",
        "modifyTime",
        "pinned",
        "files",
      ],
      ["shareCount"],
    )
  )
    return reject(
      "unsupported",
      ordinal,
      title,
      "This Proton Pass item has unsupported fields.",
    );
  if (n(item.contentFormatVersion) !== 8 || ![1, 2].includes(n(item.state)))
    return reject(
      "unsupported",
      ordinal,
      title,
      "This Proton Pass item format is unsupported.",
    );
  const data = object(item.data),
    meta = object(data?.metadata),
    content = object(data?.content);
  if (
    !data ||
    !meta ||
    !content ||
    !["type", "content", "extraFields", "metadata"].every(
      (key) => key in data,
    ) ||
    !exact(
      data,
      ["type", "content", "extraFields", "metadata"],
      ["platformSpecific"],
    ) ||
    !exact(meta, ["name", "note", "itemUuid"]) ||
    !["name", "note", "itemUuid"].every((k) => string(meta[k], max)) ||
    !validExtra(data.extraFields, max) ||
    !validPlatform(data.platformSpecific, max)
  )
    return reject(
      "invalid",
      ordinal,
      title,
      "The Proton Pass item data is invalid.",
    );
  if (data.type !== "login" && data.type !== "note")
    return reject(
      "unsupported",
      ordinal,
      title,
      "This Proton Pass item type is unsupported.",
    );
  if (data.type === "note") {
    if (!exact(content, []))
      return reject(
        "invalid",
        ordinal,
        title,
        "The Proton Pass note is invalid.",
      );
    if ((item.files as unknown[]).length)
      return reject(
        "unsupported",
        ordinal,
        title,
        "Proton Pass attachments are unsupported.",
      );
    if (entry.vaultUnsupported)
      return reject(
        "unsupported",
        ordinal,
        title,
        "This Proton Pass vault display format is unsupported.",
      );
    return {
      status: "supported",
      ordinal,
      title: meta.name as string,
      sourceState: n(item.state) === 2 ? "deleted" : "active",
      sourceRecord: source(version, userId, vaultId, vault, item),
      hasOtp: false,
      kind: "custom",
    };
  }
  const contentRequired = [
    "itemEmail",
    "password",
    "urls",
    "totpUri",
    "passkeys",
    "itemUsername",
  ];
  if (
    !contentRequired.every((key) => key in content) ||
    !exact(content, [
      "itemEmail",
      "password",
      "urls",
      "totpUri",
      "passkeys",
      "itemUsername",
      "autofillUrls",
    ]) ||
    !["itemEmail", "password", "totpUri", "itemUsername"].every((k) =>
      string(content[k], max),
    ) ||
    !Array.isArray(content.urls) ||
    !content.urls.every((v) => string(v, max)) ||
    !Array.isArray(content.autofillUrls) ||
    !Array.isArray(content.passkeys)
  ) {
    if (
      contentRequired.every((key) => key in content) &&
      !("autofillUrls" in content) &&
      Object.keys(content).every((key) => contentRequired.includes(key))
    )
      return reject(
        "unsupported",
        ordinal,
        title,
        "This Proton Pass legacy login shape is unsupported.",
      );
    return reject(
      "invalid",
      ordinal,
      title,
      "The Proton Pass login is invalid.",
    );
  }
  if (!validPasskeys(content.passkeys, max))
    return reject(
      "invalid",
      ordinal,
      title,
      "The Proton Pass passkey is invalid.",
    );
  if (
    !content.autofillUrls.every((raw) => {
      const u = object(raw);
      return (
        !!u &&
        exact(u, ["url", "mode"]) &&
        string(u.url, max) &&
        integer(u.mode)
      );
    })
  )
    return reject(
      "invalid",
      ordinal,
      title,
      "The Proton Pass URL list is invalid.",
    );
  if ((content.autofillUrls as Obj[]).some((raw) => n(raw.mode) > 6))
    return reject(
      "unsupported",
      ordinal,
      title,
      "This Proton Pass URL mode is unsupported.",
    );
  const legacyUrls = content.urls as string[];
  const defaults = content.autofillUrls
    .filter((raw) => n((raw as Obj).mode) === 0)
    .map((raw) => (raw as Obj).url);
  if (
    defaults.length !== legacyUrls.length ||
    defaults.some((u, i) => u !== legacyUrls[i])
  )
    return reject(
      "invalid",
      ordinal,
      title,
      "The Proton Pass URL projection is invalid.",
    );
  if (content.passkeys.length || (item.files as unknown[]).length)
    return reject(
      "unsupported",
      ordinal,
      title,
      "Proton Pass passkeys and attachments are unsupported.",
    );
  const urls = legacyUrls
    .map(safeDestination)
    .flatMap((value) => (value.metadata ? [value.metadata] : []));
  if (entry.vaultUnsupported)
    return reject(
      "unsupported",
      ordinal,
      title,
      "This Proton Pass vault display format is unsupported.",
    );
  return {
    status: "supported",
    ordinal,
    title: meta.name as string,
    sourceState: n(item.state) === 2 ? "deleted" : "active",
    sourceRecord: source(version, userId, vaultId, vault, item),
    hasOtp:
      (content.totpUri as string).length > 0 ||
      (data.extraFields as Obj[]).some(
        (field) =>
          field.type === "totp" &&
          ((field.data as Obj).totpUri as string).length > 0,
      ),
    kind: "website_login",
    urls,
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
  > & { maxJsonDepth: number },
  binaryNames?: ReadonlySet<string>,
): StructuredImportRecord[] {
  if (bytes(text) > limits.maxFileBytes)
    throw new Error(
      "The Proton Pass export exceeds the organization size limit.",
    );
  let root: Obj;
  try {
    root = object(parse(text)) ?? {};
  } catch {
    throw new Error("The Proton Pass export is invalid.");
  }
  if (
    !jsonDepthOk(root, limits.maxJsonDepth) ||
    !exact(root, ["version", "vaults"], ["userId"]) ||
    !string(root.version, limits.maxCellBytes, true) ||
    (root.userId !== undefined &&
      !string(root.userId, limits.maxCellBytes, true)) ||
    !object(root.vaults) ||
    Object.keys(root.vaults as Obj).length === 0 ||
    !allStringsBounded(root, limits.maxCellBytes)
  )
    throw new Error("The Proton Pass export is invalid.");
  const entries: Entry[] = [],
    identities = new Set<string>(),
    claims = new Map<string, number>();
  for (const [vaultId, rawVault] of Object.entries(root.vaults as Obj)) {
    const vault = object(rawVault);
    if (
      !string(vaultId, limits.maxCellBytes, true) ||
      !vault ||
      !exact(vault, ["description", "display", "name", "items"]) ||
      !string(vault.description, limits.maxCellBytes) ||
      !string(vault.name, limits.maxCellBytes) ||
      displayStatus(vault.display) === "invalid" ||
      !Array.isArray(vault.items)
    )
      throw new Error("The Proton Pass vault is invalid.");
    if (displayStatus(vault.display) === "unsupported") {
      for (const raw of vault.items) {
        if (entries.length >= limits.maxRecords)
          throw new Error("The Proton Pass export has too many records.");
        entries.push({
          item: object(raw) ?? {},
          vault,
          vaultId,
          ordinal: entries.length,
          vaultUnsupported: true,
        });
      }
      continue;
    }
    for (const raw of vault.items) {
      if (entries.length >= limits.maxRecords)
        throw new Error("The Proton Pass export has too many records.");
      const item = object(raw) ?? {};
      if (typeof item.itemId === "string") {
        const id = `${vaultId}\0${item.itemId}`;
        if (identities.has(id))
          throw new Error(
            "The Proton Pass export has duplicate item identities.",
          );
        identities.add(id);
      }
      entries.push({ item, vault, vaultId, ordinal: entries.length });
    }
  }
  const records = entries.map((entry) =>
    validate(
      entry,
      root.version as string,
      root.userId as string | undefined,
      limits.maxCellBytes,
    ),
  );
  if (binaryNames) {
    entries.forEach((entry, index) => {
      if (
        records[index]?.status === "invalid" ||
        !Array.isArray(entry.item.files)
      )
        return;
      for (const file of entry.item.files as unknown[])
        if (typeof file === "string")
          claims.set(file, (claims.get(file) ?? 0) + 1);
    });
    for (const [name, count] of claims)
      if (count !== 1 || !binaryNames.has(name))
        throw new Error("The Proton Pass archive is invalid.");
    for (const name of binaryNames)
      if (claims.get(name) !== 1)
        throw new Error("The Proton Pass archive is invalid.");
  }
  return records;
}
