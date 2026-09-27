// features/message-templates/lib/merge-fields.ts
//
// Merge fields in plain words. A template body carries `{{party.first_name}}`;
// a person reads "Recipient first name" and sees an example ("Jordan") in the
// preview. The syntax is the one aidream's strict renderer accepts
// (`aidream/services/message_templates/renderer.py` `_MERGE_FIELD`), and the
// common fields below are the bindings the outreach senders fill
// (`aidream/services/outreach_single_send/service.py` `_party_binding`,
// `_reply_binding`, `_case_binding`, `_backlink_binding`). Only the sender
// knows at send time whether a value exists; this file never claims a field
// will resolve.

/** Same grammar as the server renderer: dotted identifiers inside {{ }}. */
const MERGE_FIELD = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*\}\}/g;

const ROOT_WORDS: Record<string, string> = {
  party: "Recipient",
  contact: "Contact",
  reply: "Reply",
  case: "Story",
  backlink: "Link",
  personalization: "Personal note",
};

export interface MergeFieldInfo {
  /** The path inside the braces, e.g. `party.first_name`. */
  path: string;
  /** Plain words, e.g. "Recipient first name". */
  label: string;
  /** A made-up example value used only in the preview. */
  example: string;
}

/** The fields the outreach senders fill, offered by "Insert field". */
export const COMMON_MERGE_FIELDS: readonly MergeFieldInfo[] = [
  { path: "party.first_name", label: "Recipient first name", example: "Jordan" },
  { path: "party.last_name", label: "Recipient last name", example: "Lee" },
  { path: "party.display_name", label: "Recipient full name", example: "Jordan Lee" },
  { path: "party.job_title", label: "Recipient job title", example: "Head of Marketing" },
  { path: "party.primary_domain", label: "Recipient website", example: "example.com" },
  { path: "reply.subject", label: "Reply subject", example: "Re: Your question" },
  { path: "reply.body", label: "Reply body", example: "Thanks for getting back to me — here is what I found…" },
  { path: "case.headline", label: "Story headline", example: "Local firm doubles its team" },
  { path: "backlink.source_url", label: "Link source page", example: "https://example.com/article" },
];

const KNOWN = new Map(COMMON_MERGE_FIELDS.map((f) => [f.path, f]));

/** "party.first_name" → "Recipient first name"; unknown roots are humanized. */
export function mergeFieldLabel(path: string): string {
  const known = KNOWN.get(path);
  if (known) return known.label;
  const [root, ...rest] = path.split(".");
  const head = ROOT_WORDS[root] ?? root.replace(/_/g, " ");
  const tail = rest.join(" ").replace(/_/g, " ").toLowerCase();
  const text = tail ? `${head} ${tail}` : head;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function mergeFieldInfo(path: string): MergeFieldInfo {
  return (
    KNOWN.get(path) ?? {
      path,
      label: mergeFieldLabel(path),
      example: `[${mergeFieldLabel(path)}]`,
    }
  );
}

/** Every distinct field used across the given texts, in first-seen order. */
export function mergeFieldsIn(...texts: string[]): MergeFieldInfo[] {
  const seen: string[] = [];
  for (const text of texts) {
    for (const m of text.matchAll(MERGE_FIELD)) {
      if (!seen.includes(m[1])) seen.push(m[1]);
    }
  }
  return seen.map(mergeFieldInfo);
}

export type PreviewPart =
  | { kind: "text"; text: string }
  | { kind: "field"; field: MergeFieldInfo };

/** Splits a text into plain runs and merge fields, for a filled-in preview. */
export function previewParts(text: string): PreviewPart[] {
  const parts: PreviewPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MERGE_FIELD)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ kind: "text", text: text.slice(last, at) });
    parts.push({ kind: "field", field: mergeFieldInfo(m[1]) });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export function mergeFieldToken(path: string): string {
  return `{{${path}}}`;
}
