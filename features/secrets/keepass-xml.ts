import { SaxesParser } from "saxes";
import { safeDestination, type CsvImportLimits } from "./csv-import";
import type { StructuredImportFileNotice } from "./structured-import-worker-protocol";
import type { StructuredImportRecord } from "./structured-import";
type Limits = Pick<
  CsvImportLimits,
  "maxFileBytes" | "maxRecords" | "maxCellBytes"
> & { maxJsonDepth?: number };
type C = string | N;
type N = {
  name: string;
  attrs: [string, string][];
  content: C[];
  start: number;
  end: number;
};
type I = {
  invalid: boolean;
  unsupported: boolean;
  fields: Map<string, string>;
  title: string;
};
type S = {
  children: readonly string[];
  repeat?: readonly string[];
  required?: readonly string[];
};
type BinaryIds = Set<string>;
const passkeys = new Set([
  "KPEX_PASSKEY_USERNAME",
  "KPEX_PASSKEY_CREDENTIAL_ID",
  "KPEX_PASSKEY_PRIVATE_KEY_PEM",
  "KPEX_PASSKEY_RELYING_PARTY",
  "KPEX_PASSKEY_USER_HANDLE",
  "KPEX_PASSKEY_FLAG_BE",
  "KPEX_PASSKEY_FLAG_BS",
  "KPEX_PASSKEY_GENERATED_USER_ID",
]);
const shapes: Record<string, S> = {
  KeePassFile: { children: ["Meta", "Root"], required: ["Meta", "Root"] },
  Meta: {
    children: [
      "Generator",
      "HeaderHash",
      "SettingsChanged",
      "DatabaseName",
      "DatabaseNameChanged",
      "DatabaseDescription",
      "DatabaseDescriptionChanged",
      "DefaultUserName",
      "DefaultUserNameChanged",
      "MaintenanceHistoryDays",
      "Color",
      "MasterKeyChanged",
      "MasterKeyChangeRec",
      "MasterKeyChangeForce",
      "MemoryProtection",
      "CustomIcons",
      "RecycleBinEnabled",
      "RecycleBinUUID",
      "RecycleBinChanged",
      "EntryTemplatesGroup",
      "EntryTemplatesGroupChanged",
      "LastSelectedGroup",
      "LastTopVisibleGroup",
      "HistoryMaxItems",
      "HistoryMaxSize",
      "Binaries",
      "CustomData",
    ],
  },
  Root: { children: ["Group", "DeletedObjects"], required: ["Group"] },
  Group: {
    children: [
      "UUID",
      "Name",
      "Notes",
      "Tags",
      "IconID",
      "CustomIconUUID",
      "Times",
      "IsExpanded",
      "DefaultAutoTypeSequence",
      "EnableAutoType",
      "EnableSearching",
      "LastTopVisibleEntry",
      "CustomData",
      "PreviousParentGroup",
      "Group",
      "Entry",
    ],
    repeat: ["Group", "Entry"],
    required: ["UUID", "Name"],
  },
  Entry: {
    children: [
      "UUID",
      "IconID",
      "CustomIconUUID",
      "ForegroundColor",
      "BackgroundColor",
      "OverrideURL",
      "Tags",
      "Times",
      "String",
      "Binary",
      "AutoType",
      "History",
      "CustomData",
      "QualityCheck",
      "PreviousParentGroup",
    ],
    repeat: ["String", "Binary"],
    required: ["UUID"],
  },
  String: { children: ["Key", "Value"], required: ["Key", "Value"] },
  Binary: { children: ["Key", "Value"], required: ["Key", "Value"] },
  Times: {
    children: [
      "LastModificationTime",
      "CreationTime",
      "LastAccessTime",
      "ExpiryTime",
      "Expires",
      "UsageCount",
      "LocationChanged",
      "PreviousParentGroup",
    ],
  },
  AutoType: {
    children: [
      "Enabled",
      "DataTransferObfuscation",
      "DefaultSequence",
      "Association",
    ],
    repeat: ["Association"],
  },
  Association: {
    children: ["Window", "KeystrokeSequence"],
    required: ["Window", "KeystrokeSequence"],
  },
  History: { children: ["Entry"], repeat: ["Entry"] },
  CustomData: { children: ["Item"], repeat: ["Item"] },
  Item: {
    children: ["Key", "Value", "LastModificationTime"],
    required: ["Key", "Value"],
  },
  MemoryProtection: {
    children: [
      "ProtectTitle",
      "ProtectUserName",
      "ProtectPassword",
      "ProtectURL",
      "ProtectNotes",
    ],
  },
  CustomIcons: { children: ["Icon"], repeat: ["Icon"] },
  Icon: {
    children: ["UUID", "Name", "LastModificationTime", "Data"],
    required: ["UUID", "Data"],
  },
  DeletedObjects: { children: ["DeletedObject"], repeat: ["DeletedObject"] },
  DeletedObject: {
    children: ["UUID", "DeletionTime"],
    required: ["UUID", "DeletionTime"],
  },
  Binaries: { children: ["Binary"], repeat: ["Binary"] },
};
const bytes = (x: string) =>
    typeof TextEncoder === "undefined"
      ? unescape(encodeURIComponent(x)).length
      : new TextEncoder().encode(x).byteLength,
  fail = (): never => {
    throw new Error("The KeePass XML file is invalid.");
  },
  kids = (n: N, name?: string) =>
    n.content.filter(
      (x): x is N => typeof x !== "string" && (!name || x.name === name),
    ),
  one = (n: N, name: string) => {
    const x = kids(n, name);
    return x.length === 1 ? x[0] : undefined;
  },
  val = (n: N) =>
    n.content.every((x) => typeof x === "string")
      ? n.content.join("")
      : undefined,
  at = (n: N, k: string): string | undefined =>
    n.attrs.find(([a]) => a === k)?.[1],
  ws = (n: N) =>
    n.content.every((x) => typeof x !== "string" || /^\s*$/.test(x));
function invalidFile(): never {
  throw new Error("The KeePass XML file is invalid.");
}
function b64(x: string) {
  try {
    return /^[A-Za-z0-9+/]*={0,2}$/.test(x) &&
      x.length % 4 === 0 &&
      btoa(atob(x)) === x
      ? atob(x)
      : undefined;
  } catch {
    return undefined;
  }
}
const uuid = (x: string) => b64(x)?.length === 16,
  bool = (x: string) =>
    ["True", "False", "true", "false", "1", "0"].includes(x),
  tri = (x: string) => bool(x) || x === "Null" || x === "null",
  integer = (x: string, n = false) =>
    /^(?:0|-?[1-9]\d*)$/.test(x) &&
    Number.isSafeInteger(Number(x)) &&
    (!n || !x.startsWith("-"));
function time(x: string) {
  const raw = b64(x);
  if (raw?.length === 8) {
    let s = BigInt(0);
    for (let i = 7; i >= 0; i--)
      s = s * BigInt(256) + BigInt(raw.charCodeAt(i));
    return s >= BigInt(0);
  }
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?Z$/.exec(x);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  const z = new Date(0);
  z.setUTCFullYear(y, mo - 1, d);
  z.setUTCHours(h, mi, se, 0);
  return (
    z.getUTCFullYear() === y &&
    z.getUTCMonth() === mo - 1 &&
    z.getUTCDate() === d &&
    z.getUTCHours() === h &&
    z.getUTCMinutes() === mi &&
    z.getUTCSeconds() === se
  );
}
function closed(n: N, k: keyof typeof shapes) {
  const s = shapes[k];
  return (
    !!s &&
    ws(n) &&
    !n.attrs.length &&
    !kids(n).some((x) => !s.children.includes(x.name)) &&
    s.children.every(
      (name) =>
        (s.repeat?.includes(name) || kids(n, name).length <= 1) &&
        (!s.required?.includes(name) || kids(n, name).length === 1),
    )
  );
}
function scalar(n: N, test: (x: string) => boolean, attrs: string[] = []) {
  const x = val(n);
  return (
    x !== undefined && test(x) && n.attrs.every(([k]) => attrs.includes(k))
  );
}
function custom(n: N) {
  const keys = new Set<string>();
  return (
    closed(n, "CustomData") &&
    kids(n).every((item) => {
      const key = one(item, "Key");
      if (!key || !closed(item, "Item") || !scalar(key, () => true))
        return false;
      const keyText = val(key);
      if (keyText === undefined || keys.has(keyText)) return false;
      keys.add(keyText);
      return (
        scalar(one(item, "Value")!, () => true) &&
        (!one(item, "LastModificationTime") ||
          scalar(one(item, "LastModificationTime")!, time))
      );
    })
  );
}
function times(n: N) {
  return (
    closed(n, "Times") &&
    kids(n).every((x) =>
      scalar(
        x,
        x.name === "Expires"
          ? bool
          : x.name === "UsageCount"
            ? (v) => integer(v, true)
            : x.name === "PreviousParentGroup"
              ? uuid
              : time,
      ),
    )
  );
}
function auto(n: N) {
  return (
    closed(n, "AutoType") &&
    kids(n).every((x) =>
      x.name === "Association"
        ? closed(x, "Association") &&
          scalar(one(x, "Window")!, () => true) &&
          scalar(one(x, "KeystrokeSequence")!, () => true)
        : scalar(
            x,
            x.name === "Enabled"
              ? bool
              : x.name === "DataTransferObfuscation"
                ? integer
                : () => true,
          ),
    )
  );
}
function row(n: N, f: Map<string, string>) {
  if (!closed(n, "String")) return { bad: true, p: false };
  const k = one(n, "Key")!,
    v = one(n, "Value")!,
    key = val(k),
    p = at(v, "Protected"),
    m = at(v, "ProtectInMemory");
  if (
    !scalar(k, () => true) ||
    !scalar(v, () => true, ["Protected", "ProtectInMemory"]) ||
    !key ||
    f.has(key) ||
    (p !== undefined && !bool(p)) ||
    (m !== undefined && !bool(m))
  )
    return { bad: true, p: false };
  f.set(key, val(v)!);
  return { bad: false, p: p === "True" || p === "true" || p === "1" };
}
function binary(n: N, ids: BinaryIds) {
  if (!closed(n, "Binary"))
    return { bad: true, inline: false, ref: undefined as string | undefined };
  const k = one(n, "Key")!,
    v = one(n, "Value")!,
    r = at(v, "Ref"),
    attrs = ["Ref", "Protected", "ProtectInMemory", "Compressed"];
  if (
    !scalar(k, () => true) ||
    !val(k) ||
    !scalar(v, () => true, attrs) ||
    ["Protected", "ProtectInMemory", "Compressed"].some(
      (a) => at(v, a) !== undefined && !bool(at(v, a)!),
    )
  )
    return { bad: true, inline: false, ref: undefined };
  if (r !== undefined)
    return {
      bad: val(v) !== "" || !integer(r, true) || !ids.has(r),
      inline: false,
      ref: r,
    };
  return { bad: b64(val(v)!) === undefined, inline: true, ref: undefined };
}
function inspect(n: N, ids: BinaryIds, permitHistory = true): I {
  const f = new Map<string, string>(),
    allowed = new Set(shapes.Entry.children);
  let invalid = !ws(n) || !!n.attrs.length,
    unsupported = kids(n).some((c) => !allowed.has(c.name));
  for (const name of allowed)
    if (name !== "String" && name !== "Binary" && kids(n, name).length > 1)
      invalid = true;
  const simple: Record<string, (x: string) => boolean> = {
    UUID: uuid,
    IconID: (x) => integer(x, true),
    CustomIconUUID: uuid,
    ForegroundColor: () => true,
    BackgroundColor: () => true,
    OverrideURL: () => true,
    Tags: () => true,
    QualityCheck: bool,
    PreviousParentGroup: uuid,
  };
  for (const c of kids(n)) {
    if (!allowed.has(c.name)) continue;
    if (c.name === "String") {
      const z = row(c, f);
      invalid ||= z.bad;
      unsupported ||= z.p;
    } else if (c.name === "Binary") {
      const z = binary(c, ids);
      invalid ||= z.bad;
      unsupported ||= !z.bad;
    } else if (c.name === "Times") invalid ||= !times(c);
    else if (c.name === "AutoType") invalid ||= !auto(c);
    else if (c.name === "CustomData") invalid ||= !custom(c);
    else if (c.name === "History") {
      if (!permitHistory || !closed(c, "History")) invalid = true;
      for (const h of kids(c)) {
        const z = inspect(h, ids, false);
        invalid ||= z.invalid;
        unsupported ||= z.unsupported;
      }
    } else if (c.name in simple) invalid ||= !scalar(c, simple[c.name]!);
  }
  if (!one(n, "UUID") || !f.get("Title")?.trim()) invalid = true;
  if ([...f].some(([k]) => passkeys.has(k))) unsupported = true;
  return {
    invalid,
    unsupported,
    fields: f,
    title: f.get("Title") ?? "Untitled entry",
  };
}
function countParsedWork(node: N, inBinaryPool = false): number {
  const countedNames = new Set(["Entry", "DeletedObject", "Icon", "Item"]);
  return (
    (countedNames.has(node.name) || (inBinaryPool && node.name === "Binary")
      ? 1
      : 0) +
    kids(node).reduce(
      (total, child) =>
        total + countParsedWork(child, node.name === "Binaries"),
      0,
    )
  );
}
function tree(xml: string, l: Limits): N {
  if (bytes(xml) > l.maxFileBytes)
    throw new Error("The file exceeds this organization’s import size limit.");
  const stack: N[] = [];
  let root: N | undefined,
    count = 0;
  const p = new SaxesParser({ xmlns: false, position: true });
  p.on("error", fail);
  p.on("doctype", fail);
  p.on("processinginstruction", fail);
  p.on("xmldecl", (d) => {
    if (
      d.version !== "1.0" ||
      (d.encoding !== undefined && d.encoding.toLowerCase() !== "utf-8") ||
      (d.standalone !== undefined &&
        d.standalone !== "yes" &&
        d.standalone !== "no")
    )
      fail();
  });
  p.on("opentagstart", (t) => {
    const n: N = {
      name: t.name,
      attrs: [],
      content: [],
      start: p.position - t.name.length - 2,
      end: -1,
    };
    if (stack.length) stack.at(-1)!.content.push(n);
    else if (root) fail();
    else root = n;
    stack.push(n);
  });
  p.on("opentag", (t) => {
    if (
      ++count > l.maxFileBytes ||
      stack.length > (l.maxJsonDepth ?? 64) ||
      t.name.includes(":")
    )
      fail();
    const a = Object.entries(t.attributes).map(
      ([k, v]) => [k, String(v)] as [string, string],
    );
    if (
      new Set(a.map((x) => x[0])).size !== a.length ||
      a.some(
        ([k, v]) =>
          k.includes(":") ||
          bytes(k) > l.maxCellBytes ||
          bytes(v) > l.maxCellBytes,
      )
    )
      fail();
    stack.at(-1)!.attrs = a;
  });
  const append = (x: string) => {
    const n = stack.at(-1);
    if (!n) {
      if (!/^\s*$/.test(x)) fail();
      return;
    }
    const last = n.content.at(-1);
    if (typeof last === "string") n.content[n.content.length - 1] = last + x;
    else n.content.push(x);
    if (
      bytes(
        n.content.filter((z): z is string => typeof z === "string").join(""),
      ) > l.maxCellBytes
    )
      fail();
  };
  p.on("text", append);
  p.on("cdata", append);
  p.on("closetag", () => {
    const n = stack.pop();
    if (!n) fail();
    n!.end = p.position;
  });
  p.write(xml).close();
  if (!root || stack.length) fail();
  return root!;
}
export function parseKeePassXml(
  xml: string,
  limits: Limits,
): {
  records: StructuredImportRecord[];
  fileNotices: StructuredImportFileNotice[];
} {
  const file = tree(xml, limits);
  if (countParsedWork(file) > limits.maxRecords)
    throw new Error("The file has more records than this organization allows.");
  if (!closed(file, "KeePassFile")) fail();
  const meta = one(file, "Meta")!,
    root = one(file, "Root")!;
  if (
    !closed(meta, "Meta") ||
    !closed(root, "Root") ||
    kids(root, "Group").length !== 1
  )
    fail();
  const metaScalar: Record<string, (x: string) => boolean> = {
    Generator: () => true,
    HeaderHash: (x) => b64(x) !== undefined,
    SettingsChanged: time,
    DatabaseName: () => true,
    DatabaseNameChanged: time,
    DatabaseDescription: () => true,
    DatabaseDescriptionChanged: time,
    DefaultUserName: () => true,
    DefaultUserNameChanged: time,
    MaintenanceHistoryDays: integer,
    Color: () => true,
    MasterKeyChanged: time,
    MasterKeyChangeRec: integer,
    MasterKeyChangeForce: integer,
    RecycleBinEnabled: bool,
    RecycleBinUUID: uuid,
    RecycleBinChanged: time,
    EntryTemplatesGroup: uuid,
    EntryTemplatesGroupChanged: time,
    LastSelectedGroup: uuid,
    LastTopVisibleGroup: uuid,
    HistoryMaxItems: integer,
    HistoryMaxSize: integer,
  };
  const ids = new Set<string>();
  let pool = 0;
  for (const c of kids(meta)) {
    if (c.name === "MemoryProtection") {
      if (
        !closed(c, "MemoryProtection") ||
        kids(c).some((x) => !scalar(x, bool))
      )
        fail();
    } else if (c.name === "CustomData") {
      if (!custom(c)) fail();
    } else if (c.name === "CustomIcons") {
      if (
        !closed(c, "CustomIcons") ||
        kids(c).some(
          (x) =>
            !closed(x, "Icon") ||
            !scalar(one(x, "UUID")!, uuid) ||
            !scalar(one(x, "Data")!, (v) => b64(v) !== undefined) ||
            (!!one(x, "Name") && !scalar(one(x, "Name")!, () => true)) ||
            (!!one(x, "LastModificationTime") &&
              !scalar(one(x, "LastModificationTime")!, time)),
        )
      )
        fail();
    } else if (c.name === "Binaries") {
      if (!closed(c, "Binaries")) fail();
      for (const x of kids(c)) {
        const id = at(x, "ID");
        if (!id) invalidFile();
        if (
          !integer(id, true) ||
          ids.has(id) ||
          x.attrs.some(
            ([k, v]) => k !== "ID" && (k !== "Compressed" || !bool(v)),
          ) ||
          !scalar(x, (v) => b64(v) !== undefined, ["ID", "Compressed"])
        )
          fail();
        ids.add(id);
        pool++;
      }
    } else if (!scalar(c, metaScalar[c.name]!)) fail();
  }
  const tomb = one(root, "DeletedObjects");
  const tombs = tomb ? kids(tomb).length : 0;
  if (
    tomb &&
    (!closed(tomb, "DeletedObjects") ||
      kids(tomb).some(
        (x) =>
          !closed(x, "DeletedObject") ||
          !scalar(one(x, "UUID")!, uuid) ||
          !scalar(one(x, "DeletionTime")!, time),
      ))
  )
    fail();
  const rec: StructuredImportRecord[] = [];
  const seen = new Set<string>(),
    refs = new Set<string>(),
    recycle = one(meta, "RecycleBinUUID"),
    metaXml = kids(meta)
      .filter((x) => x.name !== "Binaries")
      .map((x) => xml.slice(x.start, x.end));
  const visit = (g: N, path: string[], deleted: boolean) => {
    if (!closed(g, "Group")) fail();
    const simple: Record<string, (x: string) => boolean> = {
      UUID: uuid,
      Name: () => true,
      Notes: () => true,
      Tags: () => true,
      IconID: (x) => integer(x, true),
      CustomIconUUID: uuid,
      IsExpanded: bool,
      DefaultAutoTypeSequence: () => true,
      EnableAutoType: tri,
      EnableSearching: tri,
      LastTopVisibleEntry: uuid,
      PreviousParentGroup: uuid,
    };
    for (const c of kids(g)) {
      if (
        (c.name === "Times" && !times(c)) ||
        (c.name === "CustomData" && !custom(c)) ||
        (c.name in simple && !scalar(c, simple[c.name]!))
      )
        fail();
    }
    const name = val(one(g, "Name")!)!,
      isDeleted = deleted || val(one(g, "UUID")!) === val(recycle ?? g);
    for (const c of kids(g)) {
      if (c.name === "Group") visit(c, [...path, name], isDeleted);
      if (c.name !== "Entry") continue;
      const z = inspect(c, ids);
      const uuidNode = one(c, "UUID");
      const id = uuidNode ? val(uuidNode) : undefined;
      if (id && uuid(id)) {
        if (seen.has(id)) z.invalid = true;
        seen.add(id);
      }
      const h = one(c, "History");
      for (const e of [c, ...(h ? kids(h) : [])])
        for (const b of kids(e, "Binary")) {
          const q = binary(b, ids);
          if (q.ref) refs.add(q.ref);
        }
      const ordinal = rec.length;
      if (z.invalid) {
        rec.push({
          status: "invalid",
          ordinal,
          title: z.title,
          reason: "The entry has invalid or duplicate fields.",
        });
        continue;
      }
      if (z.unsupported) {
        rec.push({
          status: "unsupported",
          ordinal,
          title: z.title,
          reason:
            "Attachments, protected values, or passkeys require a later import path.",
        });
        continue;
      }
      const u = z.fields.get("URL")
          ? safeDestination(z.fields.get("URL")!).metadata
          : null,
        user = z.fields.get("UserName")?.trim()
          ? z.fields.get("UserName")!
          : null,
        password = z.fields.get("Password")?.length
          ? z.fields.get("Password")!
          : null,
        common = {
          status: "supported" as const,
          ordinal,
          title: z.title,
          sourceState: isDeleted ? ("deleted" as const) : ("active" as const),
          sourceRecord: JSON.stringify({
            source: "keepass_xml",
            version: 1,
            entry_xml: xml.slice(c.start, c.end),
            group_path: [...path, name],
            meta_xml: metaXml,
            excluded_binary_definition_count: pool,
          }),
          hasOtp: [...z.fields.keys()].some((k) =>
            /(?:totp|otp|one.?time)/i.test(k),
          ),
          ...(z.fields.get("Notes") ? { notes: z.fields.get("Notes") } : {}),
        };
      rec.push(
        u && (user || password)
          ? {
              ...common,
              kind: "website_login",
              urls: [u],
              username: user,
              password,
            }
          : { ...common, kind: "custom" },
      );
    }
  };
  visit(one(root, "Group")!, [], false);
  const notices: StructuredImportFileNotice[] = [];
  if (pool - refs.size)
    notices.push({
      code: "unsupported_binary_definitions",
      count: pool - refs.size,
    });
  if (tombs) notices.push({ code: "deleted_tombstones", count: tombs });
  return { records: rec, fileNotices: notices };
}
