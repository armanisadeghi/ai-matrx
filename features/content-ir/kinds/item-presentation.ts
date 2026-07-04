/**
 * item_presentation kind — markdown export facet.
 *
 * item_presentation has NO serverData bridge (ItemPresentationBlock parses
 * `content` itself and tolerates the flat kind shape natively — see
 * system-kinds.ts), so this module exists solely for `toMarkdown`.
 *
 * The kind is a deliberately open shape: `{ type, id?, name?, about?,
 * ...arbitrary presentation fields }`. Name + about lead; everything else is
 * BY DESIGN unknown here, so the whole remainder renders as the key: value
 * list — for this kind the "Additional details" channel isn't the fallback,
 * it's most of the content.
 */

import {
  additionalDetailsSection,
  collectExtras,
  humanizeKind,
  joinBlocks,
} from "./kind-markdown-utils";

const MD_ITEM_KNOWN_KEYS = ["type", "id", "name", "about"];

export function itemPresentationMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.name === "string" && value.name !== ""
      ? value.name
      : typeof value.type === "string" && value.type !== ""
        ? humanizeKind(value.type)
        : "Item";

  return joinBlocks([
    `# ${title}`,
    typeof value.type === "string" && value.type !== ""
      ? `*${humanizeKind(value.type)}*`
      : null,
    typeof value.about === "string" && value.about !== "" ? value.about : null,
    typeof value.id === "string" && value.id !== ""
      ? `**Id:** ${value.id}`
      : null,
    additionalDetailsSection(collectExtras(value, MD_ITEM_KNOWN_KEYS), "##"),
  ]);
}
