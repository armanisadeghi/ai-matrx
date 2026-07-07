/**
 * `resources_legacy_text` — the named parser strategy behind the
 * `<resources>` XML surface (kind_surface: xml_tag/resources →
 * resource_collection).
 *
 * WRAPS the one existing legacy text parser — `parseResourcesMarkdown`, the
 * exact code ResourceCollectionBlock renders `<resources>` markdown through
 * today (via ResourcesArtifact's raw-parse path) — and its own validator
 * `validateResourceCollection`. It NEVER re-implements that grammar (title
 * `### `, first plain line = description, `**Category**` headers,
 * `- [Title](url) - description (duration) [type] {difficulty} *rating*
 * #tag` bullets, the alias maps, the no-category default bucket); it only
 * maps the parser's validated output onto the canonical resource_collection
 * value, so the XML surface converges to the SAME shape a `__kind` JSON
 * arrival carries (THE KEYSTONE).
 *
 * Mapping notes:
 * - Parser-synthesized ids (`category-N` / `resource-N`) are kept — they are
 *   the component's toggle/key identity and deterministic per parse, so
 *   identical region text from both hosts yields identical values
 *   (fingerprint parity holds by construction).
 * - `isFavorite` / `isCompleted` are dropped: the parser emits a constant
 *   `false` for both (initial-state seeds, not content) and the component
 *   never reads them — carrying constants would only bloat every envelope.
 * - Optional metadata (duration / difficulty / rating / tags) is included
 *   only when the parser actually extracted it.
 */

import {
  parseResourcesMarkdown,
  validateResourceCollection,
} from "@/components/mardown-display/blocks/resources/parseResourcesMarkdown";
import { KIND_KEY } from "../core/kind-schema.types";

/** Opening tag with optional attributes, e.g. `<resources>` — host framing. */
const OPENING_TAG_RE = /^\s*<resources(?:\s[^>]*)?>/i;
const CLOSING_TAG = "</resources>";

/**
 * Completed `<resources>` region text → canonical resource_collection value,
 * or null when the region parses to no valid collection (the caller treats
 * null as parse failure: loud, legacy rendering untouched).
 *
 * Accepts BOTH host framings — the accumulator's region text includes the
 * literal tags, the splitter's is inner-only. Framing is stripped before the
 * parse; unlike the flashcards parser, parseResourcesMarkdown needs no
 * closing-tag completion sentinel (this strategy only runs for COMPLETED
 * regions — the hosts gate on the closing tag).
 */
export function resourcesLegacyTextToKindValue(
  regionText: string,
): Record<string, unknown> | null {
  let inner = regionText.replace(OPENING_TAG_RE, "");
  const closeIdx = inner.indexOf(CLOSING_TAG);
  if (closeIdx !== -1) inner = inner.slice(0, closeIdx);

  const parsed = parseResourcesMarkdown(inner);
  if (!validateResourceCollection(parsed)) return null;

  const value: Record<string, unknown> = {
    [KIND_KEY]: "resource_collection",
    title: parsed.title,
    categories: parsed.categories.map((category) => {
      const mappedCategory: Record<string, unknown> = {
        [KIND_KEY]: "resource_category",
        id: category.id,
        name: category.name,
        resources: category.resources.map((item) => {
          const mappedItem: Record<string, unknown> = {
            [KIND_KEY]: "resource_item",
            id: item.id,
            title: item.title,
            url: item.url,
            description: item.description,
            type: item.type,
          };
          if (item.duration !== undefined) mappedItem.duration = item.duration;
          if (item.difficulty !== undefined) {
            mappedItem.difficulty = item.difficulty;
          }
          if (item.rating !== undefined) mappedItem.rating = item.rating;
          if (item.tags !== undefined) mappedItem.tags = item.tags;
          return mappedItem;
        }),
      };
      if (category.description !== undefined) {
        mappedCategory.description = category.description;
      }
      return mappedCategory;
    }),
  };
  if (parsed.description !== undefined) value.description = parsed.description;

  return value;
}
