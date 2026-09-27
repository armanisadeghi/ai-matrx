/**
 * THE MENU OPENED IN A FIELD NAMES THE FIELD (page-pass 2026-09-27,
 * /chat/message-templates/<id>). Right-clicking the Body box headed the menu
 * "Content: {{reply.body}}" — the field's raw text. The header is now the
 * field's own name ("Body"), with a short plain preview only when it helps:
 * merge fields read as their names ("Reply body"), and text that is ONLY merge
 * fields gets no preview (the name already says it). Pure, so it is tested
 * without a DOM menu.
 */

/** A field's name, the way a person reads it on screen. `null` when it has none. */
export function fieldLabelOf(element: Element | null | undefined): string | null {
  if (!element) return null;
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").replace(/\s*\*$/, "").trim() || null;
  const aria = clean(element.getAttribute("aria-label"));
  if (aria) return aria;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument?.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (clean(text)) return clean(text);
  }
  const labels = (element as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    const text = clean(labels[0]?.textContent);
    if (text) return text;
  }
  const id = element.getAttribute("id");
  if (id && element.ownerDocument) {
    const label = element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (clean(label?.textContent)) return clean(label?.textContent);
  }
  return null;
}

const MERGE_FIELD = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** "reply.body" / "reply_body" → "Reply body". */
export function mergeFieldName(token: string): string {
  const words = token.replace(/[._-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : token;
}

export const FIELD_PREVIEW_MAX = 60;

/**
 * The preview beside the field's name: plain words with merge fields named,
 * clipped; `""` when the text holds nothing but merge fields (or nothing).
 */
export function fieldPreview(text: string): string {
  const withoutFields = text.replace(MERGE_FIELD, "").replace(/[\s\p{P}]+/gu, "");
  if (!withoutFields) return "";
  const readable = text.replace(MERGE_FIELD, (_, name: string) => mergeFieldName(name)).replace(/\s+/g, " ").trim();
  return readable.length > FIELD_PREVIEW_MAX ? `${readable.slice(0, FIELD_PREVIEW_MAX - 1).trimEnd()}…` : readable;
}
