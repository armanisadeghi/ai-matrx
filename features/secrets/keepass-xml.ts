import { SaxesParser } from "saxes";

import { safeDestination, type CsvImportLimits } from "./csv-import";
import type { StructuredImportFileNotice } from "./structured-import-worker-protocol";
import type { StructuredImportRecord } from "./structured-import";

type Node = { name: string; attrs: Record<string, string>; text: string; children: Node[] };
const bytes = (value: string) => typeof TextEncoder === "undefined" ? unescape(encodeURIComponent(value)).length : new TextEncoder().encode(value).byteLength;
const entryFields = new Set(["Title", "UserName", "Password", "URL", "Notes"]);

function parseTree(text: string, limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords" | "maxCellBytes">): Node {
  if (bytes(text) > limits.maxFileBytes) throw new Error("limit");
  const stack: Node[] = [];
  let root: Node | undefined;
  let count = 0;
  const parser = new SaxesParser({ xmlns: false, position: false });
  const fail = () => { throw new Error("invalid"); };
  parser.on("doctype", fail); parser.on("processinginstruction", fail); parser.on("error", fail);
  parser.on("opentag", (tag) => {
    if (++count > limits.maxRecords || stack.length >= limits.maxRecords) fail();
    const node = { name: tag.name, attrs: tag.attributes, text: "", children: [] };
    if (stack.length) stack.at(-1)!.children.push(node); else if (root) fail(); else root = node;
    stack.push(node);
  });
  parser.on("text", (value) => { const node = stack.at(-1); if (!node || bytes(value) > limits.maxCellBytes) fail(); node.text += value; if (bytes(node.text) > limits.maxCellBytes) fail(); });
  parser.on("cdata", (value) => { const node = stack.at(-1); if (!node) fail(); node.text += value; if (bytes(node.text) > limits.maxCellBytes) fail(); });
  parser.on("closetag", () => { if (!stack.pop()) fail(); });
  parser.write(text).close();
  if (!root || stack.length) fail();
  return root;
}

function child(node: Node, name: string): Node | undefined { return node.children.find((x) => x.name === name); }
function strings(entry: Node): Map<string, string> | undefined {
  const values = new Map<string, string>();
  for (const row of entry.children.filter((x) => x.name === "String")) {
    const key = child(row, "Key")?.text; const value = child(row, "Value")?.text;
    if (!key || value === undefined || values.has(key)) return undefined;
    values.set(key, value);
  }
  return values;
}

export function parseKeePassXml(text: string, limits: Pick<CsvImportLimits, "maxFileBytes" | "maxRecords" | "maxCellBytes">): { records: StructuredImportRecord[]; fileNotices: StructuredImportFileNotice[] } {
  const file = parseTree(text, limits);
  if (file.name !== "KeePassFile" || file.children.filter((x) => x.name === "Meta").length !== 1 || file.children.filter((x) => x.name === "Root").length !== 1) throw new Error("invalid");
  const root = child(file, "Root")!; const records: StructuredImportRecord[] = []; let ordinal = 0;
  const visit = (group: Node, path: string[]) => {
    const name = child(group, "Name")?.text ?? "";
    for (const entry of group.children.filter((x) => x.name === "Entry")) {
      const values = strings(entry); const title = values?.get("Title") ?? `Item ${ordinal + 1}`; const current = ordinal++;
      if (!values) { records.push({ status: "invalid", ordinal: current, title, reason: "The entry has duplicate or invalid fields." }); continue; }
      if (entry.children.some((x) => x.name === "Binary") || [...values.keys()].some((x) => x.startsWith("KPEX_PASSKEY_"))) { records.push({ status: "unsupported", ordinal: current, title, reason: "Attachments or passkeys require a later import path." }); continue; }
      const url = values.get("URL"); const destination = url ? safeDestination(url).metadata : undefined;
      const sourceRecord = JSON.stringify({ source: "keepass_xml", version: 1, group_path: [...path, name], fields: [...values] });
      records.push({ status: "supported", ordinal: current, title, sourceState: "active", sourceRecord, hasOtp: false, kind: destination ? "website_login" : "custom", ...(destination ? { urls: [destination], username: values.get("UserName") ?? null, password: values.get("Password") ?? null } : {}) });
    }
    for (const nested of group.children.filter((x) => x.name === "Group")) visit(nested, [...path, name]);
  };
  for (const group of root.children.filter((x) => x.name === "Group")) visit(group, []);
  return { records, fileNotices: [] };
}
