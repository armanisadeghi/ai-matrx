// ─────────────────────────────────────────────────────────────────────────
// @-MENTIONS in rendered content — the SAME stored form RC-B11's mention
// picker writes (features/rich-document/annotations/mentions.ts):
//
//   person  @[Dana Ruiz](user:<uuid>)     → a person chip (resolved against the
//                                            members the viewer may see)
//   date    @[Tue, Sep 30](date:2026-09-30) → a date chip
//   record  @[Kiln schedule](note:<uuid>)  → the record, through the wikilink
//                                            resolver (access-checked, batched)
//           (the picker also writes records as [[note:<uuid>|Title]] —
//            the same resolution)
//
// Markdown parses `@[Label](scheme:value)` as the text "@" followed by a link;
// this pass turns that pair into the mention element. Anything that does not
// validate stays exactly as written.
// ─────────────────────────────────────────────────────────────────────────

import { el, text, toText, type MNode } from "./mdast-helpers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCHEME = /^([a-z][a-z0-9_]*):(.+)$/;

function mentionFor(link: MNode): MNode | null {
  const m = SCHEME.exec(link.url ?? "");
  if (!m) return null;
  const scheme = m[1] as string;
  const value = m[2] as string;
  const label = toText(link).trim();
  if (!label) return null;
  if (scheme === "user") {
    return UUID.test(value) ? el("matrx-mention", { dataKind: "person", dataId: value.toLowerCase(), dataLabel: label }, [text(label)]) : null;
  }
  if (scheme === "date") {
    return ISO_DATE.test(value) ? el("matrx-mention", { dataKind: "date", dataId: value, dataLabel: label }, [text(label)]) : null;
  }
  if (UUID.test(value)) {
    return el("matrx-wikilink", { dataTarget: `${scheme}:${value.toLowerCase()}`, dataAlias: label, dataMention: true }, [text(label)]);
  }
  return null;
}

export function transformMentions(node: MNode): void {
  const children = node.children;
  if (!children || node.type === "link" || node.type === "inlineCode" || node.type === "code") return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as MNode;
    const prev = children[i - 1];
    if (child.type === "link" && prev?.type === "text" && (prev.value ?? "").endsWith("@")) {
      const mention = mentionFor(child);
      if (mention) {
        prev.value = (prev.value ?? "").slice(0, -1);
        children[i] = mention;
        continue;
      }
    }
    transformMentions(child);
  }
}
