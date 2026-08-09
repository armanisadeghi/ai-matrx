"use client";

/**
 * MarketingPageWriteTargets — the live handlers for the write half of
 * `matrx-user/marketing-page` (the targets its manifest declares).
 *
 * This is the receiving end of the 360 loop on the page workspace: an agent
 * result rendered anywhere (the bound "LSI Variations & Metadata" agent's
 * `meta_tag_options` / `keyword_relationship_research` /
 * `keyword_search_metrics` kind components, a chat block, chrome) calls
 * `applySurfaceWrite("<target>", value)` and the value lands here, through the
 * page's CANONICAL services — never a bespoke callback, never a direct DB
 * write from a component.
 *
 * Also the page's UI-state PUBLISHER (the read twin): it publishes the
 * `page_keywords` key so rendered keyword blocks can reflect what is already
 * attached to the page. The `page_draft_content` handler is the one target
 * NOT registered here — it lives in `PageDraftContentCard`, which owns the
 * unsaved-draft state that target stages into.
 *
 * Renders nothing. Mount once inside the page's `SurfaceRuntimeProvider`
 * subtree with the loaded page row. Handlers throw on bad input or a failed
 * save — the writeback runtime turns that into the loud toast + captured
 * error; a version-guard conflict surfaces as its own message.
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { publishSurfaceUiState } from "@/features/surfaces/runtime/surface-ui-state";
import { MARKETING_PAGE_SURFACE_NAME } from "@/features/marketing/lib/marketing-page-scope";
import {
  updatePageDesiredValues,
  updatePageIntent,
} from "@/features/marketing/data/service";
import {
  addPageSupportingKeywords,
  fetchPageKeywordBoard,
  pageKeywordsQueryKey,
  removePageKeyword,
  PAGE_KEYWORD_SUPPORTING_ROLE,
} from "@/features/marketing/data/page-keywords";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  readPageDesiredValues,
  type DesiredHeadingEntry,
  type DesiredImagePlanEntry,
  type MarketingPage,
  type PageDesiredValues,
  type PlannedLinkEntry,
} from "@/features/marketing/types";

/** Wire value for the `page_meta_tags` target. Omitted fields keep current. */
export interface PageMetaTagsWrite {
  meta_title?: string;
  meta_description?: string;
}

/** Wire value for the `page_target_keyword` target. */
export interface PageTargetKeywordWrite {
  keyword: string;
}

/** Wire value for the `page_supporting_keywords` target. */
export interface PageSupportingKeywordsWrite {
  keywords: string[];
}

/** Wire value for the `page_remove_keywords` target. */
export interface PageRemoveKeywordsWrite {
  keywords: string[];
}

/** Wire value for the `page_social_card` target. Omitted fields keep current. */
export interface PageSocialCardWrite {
  og_title?: string;
  og_description?: string;
}

/** Wire value for the `page_indexability_plan` target. */
export interface PageIndexabilityPlanWrite {
  canonical_url?: string;
  meta_robots?: string;
}

/** Wire value for the `page_headings_plan` target. Outline replaces the plan. */
export interface PageHeadingsPlanWrite {
  outline: DesiredHeadingEntry[];
  notes?: string;
}

/** Wire value for the `page_link_plan` target. Provided keys replace lists. */
export interface PageLinkPlanWrite {
  accepted_anchor_texts?: string[];
  inbound_links?: { url: string; anchor_text?: string }[];
  outbound_links?: { url: string; anchor_text?: string }[];
}

/** The plan-note desired_values keys `page_plan_notes` may set. */
export const PAGE_PLAN_NOTE_KEYS = [
  "identity_notes",
  "structured_data_notes",
  "strategy_notes",
  "performance_goals",
  "backlink_plan",
  "additional_content_notes",
] as const;
export type PagePlanNotesWrite = Partial<
  Record<(typeof PAGE_PLAN_NOTE_KEYS)[number], string>
>;

/** Wire value for the `page_image_plan` target. */
export interface PageImagePlanWrite {
  images: {
    description: string;
    alt?: string;
    placement?: string;
    style?: string;
  }[];
  mode?: "replace" | "append";
}

/** Wire value for the `page_image_alts` target. Entries merge over current. */
export interface PageImageAltsWrite {
  alts: Record<string, string>;
}

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string | undefined {
  const raw = obj[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new Error(`${target}: ${key} must be a string when provided.`);
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

/** Published `page_keywords` UI-state shape (see the manifest's "UI-state
 * keys" block): the page's current primary target keyword + the attached
 * supporting phrases. Read by rendered keyword kind-components via
 * `useCurrentSurfaceUiState("page_keywords")` to mark what is already on the
 * page. */
export interface PageKeywordsUiState {
  target: string | null;
  supporting: string[];
}

export function MarketingPageWriteTargets({ page }: { page: MarketingPage }) {
  const queryClient = useQueryClient();

  // The freshest ROW we KNOW. `platform._touch_row` bumps `version` on
  // every UPDATE and the workspace refetch is a heavy aggregate, so between a
  // successful write and the refetch landing, `page` is stale by one save —
  // a second consecutive apply would spuriously trip the optimistic lock with
  // "changed in another session" (adversarial find D5), and — with several
  // targets applied in ONE agent message — would read reverted intent fields
  // or desired_values and silently undo the first apply. Every canonical
  // write RETURNS the fresh row; keep whichever row carries the highest
  // version and read intent/desired state from it, never from the prop.
  const rowRef = useRef(page);
  useEffect(() => {
    if (page.version >= rowRef.current.version) rowRef.current = page;
  }, [page]);
  const noteFreshRow = (updated: MarketingPage) => {
    if (updated.version >= rowRef.current.version) rowRef.current = updated;
  };

  // Same key + the ONE shared queryFn as PageKeywordsCard — this subscribes
  // to the existing cache entry rather than defining a second fetch.
  const board = useQuery({
    queryKey: pageKeywordsQueryKey(page.id),
    queryFn: () => fetchPageKeywordBoard(page.id),
  });

  // ── Published on-page keyword state (`page_keywords`) ────────────────────
  // Referential stability: rebuild the published object only when the CONTENT
  // changes — the effect keys on the primary phrase + the sorted supporting
  // phrases, not on array identity (react-query hands back fresh arrays).
  const target = page.target_keyword?.trim() || null;
  const supportingKey = (board.data ?? [])
    .map((entry) => entry.phrase)
    .filter((phrase) => phrase.toLowerCase() !== (target ?? "").toLowerCase())
    .sort()
    .join("|");
  useEffect(() => {
    publishSurfaceUiState(MARKETING_PAGE_SURFACE_NAME, "page_keywords", {
      target,
      supporting: supportingKey ? supportingKey.split("|") : [],
    } satisfies PageKeywordsUiState);
  }, [target, supportingKey]);

  // Unpublish on unmount so a closed workspace never leaves stale keyword
  // state behind for the next surface that mounts.
  useEffect(
    () => () =>
      publishSurfaceUiState(
        MARKETING_PAGE_SURFACE_NAME,
        "page_keywords",
        undefined,
      ),
    [],
  );

  const invalidatePage = () => {
    void queryClient.invalidateQueries({
      queryKey: marketingKeys.page(page.site_id, page.id),
    });
    void queryClient.invalidateQueries({
      queryKey: [...marketingKeys.site(page.site_id), "pages"],
    });
  };

  // Persist ONLY the caller's desired_values keys through the ONE clobber-safe
  // read-merge-write path, then remember the returned fresh row.
  const saveDesired = async (patch: Partial<PageDesiredValues>) => {
    const updated = await updatePageDesiredValues({
      siteId: page.site_id,
      pageId: page.id,
      patch,
    });
    noteFreshRow(updated);
    invalidatePage();
  };

  useSurfaceWriteHandlers(MARKETING_PAGE_SURFACE_NAME, {
    page_meta_tags: async (value: unknown) => {
      const obj = asRecord(value, "page_meta_tags");
      const title = optionalString(obj, "meta_title", "page_meta_tags");
      const description = optionalString(
        obj,
        "meta_description",
        "page_meta_tags",
      );
      if (title === undefined && description === undefined) {
        throw new Error(
          "page_meta_tags: provide meta_title and/or meta_description.",
        );
      }
      // Omitted fields keep the page's CURRENT intent — a metadata proposal
      // for the title alone must never erase the desired description.
      const current = rowRef.current;
      const updated = await updatePageIntent({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: current.version,
        targetKeyword: current.target_keyword,
        desiredMetaTitle: title ?? current.meta_title_desired,
        desiredMetaDescription: description ?? current.meta_description_desired,
      });
      noteFreshRow(updated);
      invalidatePage();
    },

    page_target_keyword: async (value: unknown) => {
      const obj = asRecord(value, "page_target_keyword");
      const keyword = optionalString(obj, "keyword", "page_target_keyword");
      if (!keyword) {
        throw new Error("page_target_keyword: keyword is required.");
      }
      const current = rowRef.current;
      const updated = await updatePageIntent({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: current.version,
        targetKeyword: keyword,
        desiredMetaTitle: current.meta_title_desired,
        desiredMetaDescription: current.meta_description_desired,
      });
      noteFreshRow(updated);
      invalidatePage();
    },

    page_supporting_keywords: async (value: unknown) => {
      const obj = asRecord(value, "page_supporting_keywords");
      const raw = obj.keywords;
      const keywords = Array.isArray(raw)
        ? raw.filter((k): k is string => typeof k === "string" && !!k.trim())
        : [];
      if (keywords.length === 0) {
        throw new Error(
          "page_supporting_keywords: keywords must be a non-empty string array.",
        );
      }
      const result = await addPageSupportingKeywords(
        page.id,
        keywords,
        page.organization_id ?? undefined,
      );
      if (result.failed.length > 0 && result.attached.length === 0) {
        throw new Error(
          `No keywords could be attached: ${result.failed
            .map((f) => f.phrase)
            .join(", ")}`,
        );
      }
      void queryClient.invalidateQueries({
        queryKey: pageKeywordsQueryKey(page.id),
      });
      invalidatePage();
    },

    page_remove_keywords: async (value: unknown) => {
      const obj = asRecord(value, "page_remove_keywords");
      const raw = obj.keywords;
      const phrases = Array.isArray(raw)
        ? raw.filter((k): k is string => typeof k === "string" && !!k.trim())
        : [];
      if (phrases.length === 0) {
        throw new Error(
          "page_remove_keywords: keywords must be a non-empty string array.",
        );
      }
      // Match against the FRESH board (the same one queryFn every subscriber
      // uses), supporting role only — the primary target keyword is intent
      // (page_target_keyword), never an edge removal.
      const board = await queryClient.fetchQuery({
        queryKey: pageKeywordsQueryKey(page.id),
        queryFn: () => fetchPageKeywordBoard(page.id),
        staleTime: 0,
      });
      const supporting = new Map(
        board
          .filter((entry) => entry.role === PAGE_KEYWORD_SUPPORTING_ROLE)
          .map((entry) => [entry.phrase.trim().toLowerCase(), entry]),
      );
      const missing: string[] = [];
      const toRemove = phrases.flatMap((phrase) => {
        const entry = supporting.get(phrase.trim().toLowerCase());
        if (!entry) {
          missing.push(phrase);
          return [];
        }
        return [entry];
      });
      if (missing.length > 0) {
        throw new Error(
          `page_remove_keywords: not attached as supporting keywords: ${missing.join(
            ", ",
          )}. Use page_target_keyword to change the primary keyword.`,
        );
      }
      for (const entry of toRemove) {
        await removePageKeyword(page.id, entry.keywordId, entry.role);
      }
      void queryClient.invalidateQueries({
        queryKey: pageKeywordsQueryKey(page.id),
      });
      invalidatePage();
    },

    page_social_card: async (value: unknown) => {
      const obj = asRecord(value, "page_social_card");
      const title = optionalString(obj, "og_title", "page_social_card");
      const description = optionalString(
        obj,
        "og_description",
        "page_social_card",
      );
      if (title === undefined && description === undefined) {
        throw new Error(
          "page_social_card: provide og_title and/or og_description.",
        );
      }
      const current = readPageDesiredValues(rowRef.current).social_card ?? {};
      await saveDesired({
        social_card: {
          ...current,
          ...(title !== undefined ? { og_title: title } : {}),
          ...(description !== undefined ? { og_description: description } : {}),
        },
      });
    },

    page_indexability_plan: async (value: unknown) => {
      const obj = asRecord(value, "page_indexability_plan");
      const canonical = optionalString(
        obj,
        "canonical_url",
        "page_indexability_plan",
      );
      const robots = optionalString(
        obj,
        "meta_robots",
        "page_indexability_plan",
      );
      if (canonical === undefined && robots === undefined) {
        throw new Error(
          "page_indexability_plan: provide canonical_url and/or meta_robots.",
        );
      }
      const current = readPageDesiredValues(rowRef.current).indexability ?? {};
      await saveDesired({
        indexability: {
          ...current,
          ...(canonical !== undefined ? { canonical_url: canonical } : {}),
          ...(robots !== undefined ? { meta_robots: robots } : {}),
        },
      });
    },

    page_headings_plan: async (value: unknown) => {
      const obj = asRecord(value, "page_headings_plan");
      const rawOutline = obj.outline;
      if (!Array.isArray(rawOutline) || rawOutline.length === 0) {
        throw new Error(
          "page_headings_plan: outline must be a non-empty array of { level, text }.",
        );
      }
      const outline = rawOutline.map((entry, index): DesiredHeadingEntry => {
        const record = asRecord(entry, `page_headings_plan: outline[${index}]`);
        const level = record.level;
        const text = record.text;
        if (
          typeof level !== "number" ||
          !Number.isInteger(level) ||
          level < 1 ||
          level > 6
        ) {
          throw new Error(
            `page_headings_plan: outline[${index}].level must be an integer 1-6.`,
          );
        }
        if (typeof text !== "string" || !text.trim()) {
          throw new Error(
            `page_headings_plan: outline[${index}].text must be a non-empty string.`,
          );
        }
        return { level, text: text.trim() };
      });
      const notes = optionalString(obj, "notes", "page_headings_plan");
      const current = readPageDesiredValues(rowRef.current).headings ?? {};
      await saveDesired({
        headings: { outline, notes: notes ?? current.notes },
      });
    },

    page_link_plan: async (value: unknown) => {
      const obj = asRecord(value, "page_link_plan");
      const patch: Partial<PageDesiredValues> = {};
      const rawAnchors = obj.accepted_anchor_texts;
      if (rawAnchors !== undefined) {
        if (
          !Array.isArray(rawAnchors) ||
          rawAnchors.some((a) => typeof a !== "string" || !a.trim())
        ) {
          throw new Error(
            "page_link_plan: accepted_anchor_texts must be an array of non-empty strings.",
          );
        }
        patch.accepted_anchor_texts = rawAnchors.map((a) => a.trim());
      }
      const parseLinks = (key: "inbound_links" | "outbound_links") => {
        const rawLinks = obj[key];
        if (rawLinks === undefined) return;
        if (!Array.isArray(rawLinks)) {
          throw new Error(
            `page_link_plan: ${key} must be an array of { url, anchor_text? }.`,
          );
        }
        patch[key] = rawLinks.map((entry, index): PlannedLinkEntry => {
          const record = asRecord(entry, `page_link_plan: ${key}[${index}]`);
          const url = record.url;
          if (typeof url !== "string" || !url.trim()) {
            throw new Error(
              `page_link_plan: ${key}[${index}].url must be a non-empty string.`,
            );
          }
          const anchor = optionalString(
            record,
            "anchor_text",
            `page_link_plan: ${key}[${index}]`,
          );
          return {
            id: crypto.randomUUID(),
            url: url.trim(),
            ...(anchor ? { anchor_text: anchor } : {}),
          };
        });
      };
      parseLinks("inbound_links");
      parseLinks("outbound_links");
      if (Object.keys(patch).length === 0) {
        throw new Error(
          "page_link_plan: provide accepted_anchor_texts, inbound_links, and/or outbound_links.",
        );
      }
      await saveDesired(patch);
    },

    page_plan_notes: async (value: unknown) => {
      const obj = asRecord(value, "page_plan_notes");
      const patch: Partial<PageDesiredValues> = {};
      for (const key of PAGE_PLAN_NOTE_KEYS) {
        const note = optionalString(obj, key, "page_plan_notes");
        if (note !== undefined) patch[key] = note;
      }
      if (Object.keys(patch).length === 0) {
        throw new Error(
          `page_plan_notes: provide at least one of ${PAGE_PLAN_NOTE_KEYS.join(
            ", ",
          )} as a non-empty string.`,
        );
      }
      await saveDesired(patch);
    },

    page_image_plan: async (value: unknown) => {
      const obj = asRecord(value, "page_image_plan");
      const rawImages = obj.images;
      if (!Array.isArray(rawImages) || rawImages.length === 0) {
        throw new Error(
          "page_image_plan: images must be a non-empty array of { description, alt?, placement?, style? }.",
        );
      }
      const mode = obj.mode ?? "append";
      if (mode !== "append" && mode !== "replace") {
        throw new Error(
          "page_image_plan: mode must be 'replace' or 'append' when provided.",
        );
      }
      const minted = rawImages.map((entry, index): DesiredImagePlanEntry => {
        const record = asRecord(entry, `page_image_plan: images[${index}]`);
        const description = record.description;
        if (typeof description !== "string" || !description.trim()) {
          throw new Error(
            `page_image_plan: images[${index}].description must be a non-empty string.`,
          );
        }
        const alt = optionalString(
          record,
          "alt",
          `page_image_plan: images[${index}]`,
        );
        const placement = optionalString(
          record,
          "placement",
          `page_image_plan: images[${index}]`,
        );
        const style = optionalString(
          record,
          "style",
          `page_image_plan: images[${index}]`,
        );
        return {
          id: crypto.randomUUID(),
          description: description.trim(),
          alt: alt ?? "",
          placement: placement ?? "",
          status: "planned",
          file_id: null,
          ...(style ? { style } : {}),
        };
      });
      const current = readPageDesiredValues(rowRef.current).image_plan ?? [];
      await saveDesired({
        image_plan: mode === "replace" ? minted : [...current, ...minted],
      });
    },

    page_image_alts: async (value: unknown) => {
      const obj = asRecord(value, "page_image_alts");
      const rawAlts = obj.alts;
      if (
        !rawAlts ||
        typeof rawAlts !== "object" ||
        Array.isArray(rawAlts) ||
        Object.keys(rawAlts).length === 0
      ) {
        throw new Error(
          "page_image_alts: alts must be a non-empty { src: alt } object.",
        );
      }
      const entries = Object.entries(rawAlts as Record<string, unknown>);
      const alts: Record<string, string> = {};
      for (const [src, alt] of entries) {
        if (typeof alt !== "string" || !alt.trim()) {
          throw new Error(
            `page_image_alts: alt for "${src}" must be a non-empty string.`,
          );
        }
        alts[src] = alt.trim();
      }
      const current = readPageDesiredValues(rowRef.current).image_alts ?? {};
      await saveDesired({ image_alts: { ...current, ...alts } });
    },
  });

  return null;
}
