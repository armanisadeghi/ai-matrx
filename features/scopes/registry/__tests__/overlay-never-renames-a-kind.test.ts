/**
 * A kind has ONE name, set in platform.entity_types.label. The host overlay may give a
 * grammatical plural ("Code Repositories" for "Code Repository") but never a different
 * word: on 2026-09-29 the overlay renamed Audio Session → "Recordings", Processed document →
 * "Saved sources" and Canonical Page → "Site pages" while the registry, agents and every
 * other screen kept the old names (law: common-docs/policies/canonicalize-without-destroying.md).
 * Rename a kind in the registry, with a vocabulary ruling, never here.
 */
import { ENTITY_TYPE_METADATA } from "@ai-matrx/associations";
import { getAssociationsEntityOverlay } from "../entityRegistry";

function pluralize(label: string): string {
  if (/(media|data)$/i.test(label)) return label;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(label)) return `${label}es`;
  return `${label}s`;
}

/**
 * Overlay plurals that rename a kind today, waiting for a naming ruling (vocabulary row +
 * registry label). This list only shrinks: a fixed entry fails the test until it is deleted.
 */
const AWAITING_A_NAMING_RULING = new Set<string>([
  "anon_form: Public form → Forms",
  "app: App → Applets",
  "content_ir_kind: Content-IR Kind → Shapes",
  "crm_sending_identity: Sending Identity → Sending Mailboxes",
  "fc_set: Flashcard Deck → Flashcard Sets",
  "google_document: Google document → Google Files",
  "growth_loop_run: Growth Loop Run → Growth Loops",
  "party: Entity → People & Companies",
  "plan_node: Plan Node → Plan Pages",
  "quiz_session: Quiz Session → Quizzes",
  "sandbox_instance: Sandbox Instance → Sandboxes",
  "seo_keyword: SEO Keyword → Keywords",
  "udt_document: Cloud document → Documents",
  "web_brand: Brand → Marketing Accounts",
  "web_crawl_session: Crawl Session → Crawls",
  "web_property: Brand Property → Marketing Properties",
  "web_screenshot: Screenshot → Web Screenshots",
  "web_snapshot: Snapshot → Web Snapshots",
]);

it("every overlay plural is the grammatical plural of the registry label", () => {
  const overlay = getAssociationsEntityOverlay() as Record<string, { labelPlural?: string }>;
  const meta = ENTITY_TYPE_METADATA as Record<string, { label: string } | undefined>;
  const renames: string[] = [];
  for (const [token, entry] of Object.entries(overlay)) {
    const plural = entry?.labelPlural;
    const label = meta[token]?.label;
    if (!plural || !label) continue;
    if (plural.toLowerCase() !== pluralize(label).toLowerCase()) {
      renames.push(`${token}: ${label} → ${plural}`);
    }
  }
  expect(renames.filter((r) => !AWAITING_A_NAMING_RULING.has(r)).sort()).toEqual([]);
  expect([...AWAITING_A_NAMING_RULING].filter((r) => !renames.includes(r))).toEqual([]);
});

it("the pluralizer covers the legitimate grammar plurals", () => {
  expect(pluralize("Code Repository")).toBe("Code Repositories");
  expect(pluralize("Source Library")).toBe("Source Libraries");
  expect(pluralize("Study Media")).toBe("Study Media");
  expect(pluralize("Site page")).toBe("Site pages");
  expect(pluralize("Source")).toBe("Sources");
});
