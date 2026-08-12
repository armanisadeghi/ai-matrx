"use client";

/**
 * SiteKeywordsWriteTargets — the live handlers for the write half of
 * `matrx-user/marketing-site-keywords` (the targets its manifest declares).
 *
 * The receiving end of the 360 loop on the organic keyword performance
 * workspace: an agent triaging the site's query evidence calls
 * `applySurfaceWrite("<target>", value)` and the value lands here, through the
 * keyword plane's CANONICAL chokepoints — never a bespoke callback, never a
 * direct table write from a component:
 *   - `library_keywords`      → `ensureKeywordId` (seo.fn_upsert_keyword +
 *                               archive-restore, the ONE keyword upsert path)
 *   - `keyword_traffic_class` → `setGscKeywordClass` (seo.gsc_set_keyword_class,
 *                               THE one human/site ruling path — stamped with
 *                               `origin: "ai"` provenance; the user's Apply in
 *                               the ask dialog is the eyeball, so confirmed)
 *   - `attach_page_keywords`  → `addPageSupportingKeywords` (the same
 *                               chokepoint the page workspace and the
 *                               AddKeywordsToPage kind component use)
 *
 * Renders nothing. Mount once inside the workspace's `SurfaceRuntimeProvider`
 * subtree. Handlers throw on bad input or a failed write — the writeback
 * runtime turns that into the loud toast + captured error.
 */

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { addPageSupportingKeywords } from "@/features/marketing/data/page-keywords";
import { ensureKeywordId } from "@/features/marketing/seo/keyword/data";
import {
  setGscKeywordClass,
  type GscClassRuling,
} from "@/features/marketing/search-console/data-classification";
import { GSC_TRAFFIC_CLASSES } from "@/features/marketing/search-console/types";
import type { MarketingSite } from "@/features/marketing/types";

export const SITE_KEYWORDS_SURFACE_NAME = "matrx-user/marketing-site-keywords";

/** Wire value for the `library_keywords` target. */
export interface LibraryKeywordsWrite {
  keywords: string[];
}

/** Wire value for the `keyword_traffic_class` target. */
export interface KeywordTrafficClassWrite {
  keywords: string[];
  traffic_class: GscClassRuling;
  notes?: string;
}

/** Wire value for the `attach_page_keywords` target. */
export interface AttachPageKeywordsWrite {
  page_id: string;
  keywords: string[];
}

/** The ruling vocabulary, derived from the REAL class constants (never
 * re-typed literals): every class except the `unclassified` bucket, plus the
 * explicit `clear` that removes a site ruling. */
const RULINGS: readonly string[] = [
  ...GSC_TRAFFIC_CLASSES.map((entry) => entry.key).filter(
    (key) => key !== "unclassified",
  ),
  "clear",
];

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

function phraseList(value: unknown, target: string): string[] {
  const phrases = Array.isArray(value)
    ? value.filter(
        (entry): entry is string => typeof entry === "string" && !!entry.trim(),
      )
    : [];
  if (phrases.length === 0) {
    throw new Error(`${target}: keywords must be a non-empty string array.`);
  }
  return phrases;
}

export function SiteKeywordsWriteTargets({
  site,
  onEvidenceChanged,
}: {
  site: MarketingSite;
  /** Refetch the performance page so applied writes show up in the table. */
  onEvidenceChanged: () => Promise<unknown>;
}) {
  useSurfaceWriteHandlers(SITE_KEYWORDS_SURFACE_NAME, {
    library_keywords: async (value: unknown) => {
      const obj = asRecord(value, "library_keywords");
      const keywords = phraseList(obj.keywords, "library_keywords");
      // ensureKeywordId is the canonical upsert (normalized-phrase dedupe is
      // server-side); a repeated phrase in one call just resolves twice.
      const failures: string[] = [];
      for (const phrase of keywords) {
        try {
          await ensureKeywordId(phrase);
        } catch {
          failures.push(phrase);
        }
      }
      if (failures.length === keywords.length) {
        throw new Error(
          `No keywords could be added to the library: ${failures.join(", ")}`,
        );
      }
      if (failures.length > 0) {
        // Partial success still refreshes, but the agent hears the misses.
        await onEvidenceChanged();
        throw new Error(
          `Added ${keywords.length - failures.length} of ${keywords.length}; failed: ${failures.join(", ")}`,
        );
      }
      await onEvidenceChanged();
    },

    keyword_traffic_class: async (value: unknown) => {
      const obj = asRecord(value, "keyword_traffic_class");
      const keywords = phraseList(obj.keywords, "keyword_traffic_class");
      const ruling = obj.traffic_class;
      if (typeof ruling !== "string" || !RULINGS.includes(ruling)) {
        throw new Error(
          `keyword_traffic_class: traffic_class must be one of ${RULINGS.join(" | ")}.`,
        );
      }
      const notes =
        typeof obj.notes === "string" && obj.notes.trim()
          ? obj.notes.trim()
          : null;
      // Server enforces this too — validating here gives the agent the real
      // reason instead of a raw SQL error.
      if (ruling === "mismatch" && !notes) {
        throw new Error(
          "keyword_traffic_class: notes are required for a mismatch ruling.",
        );
      }
      // Rulings key on library keyword ids; classifying an unmapped query
      // ensures its library row first through the same canonical upsert.
      const keywordIds = await Promise.all(
        keywords.map((phrase) => ensureKeywordId(phrase)),
      );
      await setGscKeywordClass(
        site.id,
        keywordIds,
        ruling as GscClassRuling,
        notes,
        // Agent-proposed, human-approved: the ask dialog's Apply IS the
        // eyeball, so the ruling lands confirmed with AI provenance.
        { origin: "ai", confirmed: true },
      );
      await onEvidenceChanged();
    },

    attach_page_keywords: async (value: unknown) => {
      const obj = asRecord(value, "attach_page_keywords");
      const pageId = typeof obj.page_id === "string" ? obj.page_id.trim() : "";
      if (!pageId) {
        throw new Error(
          "attach_page_keywords: page_id is required (a web.page id, e.g. a row's top_page_id).",
        );
      }
      const keywords = phraseList(obj.keywords, "attach_page_keywords");
      const result = await addPageSupportingKeywords(
        pageId,
        keywords,
        site.organization_id ?? undefined,
      );
      if (result.failed.length > 0 && result.attached.length === 0) {
        throw new Error(
          `No keywords could be attached: ${result.failed
            .map((f) => `${f.phrase} (${f.error})`)
            .join(", ")}`,
        );
      }
      if (result.failed.length > 0) {
        throw new Error(
          `Attached ${result.attached.length} of ${keywords.length}; failed: ${result.failed
            .map((f) => f.phrase)
            .join(", ")}`,
        );
      }
    },
  });

  return null;
}
