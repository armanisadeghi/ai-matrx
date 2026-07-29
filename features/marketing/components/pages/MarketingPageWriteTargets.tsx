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
import { updatePageIntent } from "@/features/marketing/data/service";
import {
  addPageSupportingKeywords,
  fetchPageKeywordBoard,
  pageKeywordsQueryKey,
} from "@/features/marketing/data/page-keywords";
import { marketingKeys } from "@/features/marketing/data/hooks";
import type { MarketingPage } from "@/features/marketing/types";

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

  // The freshest version we KNOW. `platform._touch_row` bumps `version` on
  // every UPDATE and the workspace refetch is a heavy aggregate, so between a
  // successful write and the refetch landing, `page.version` is stale by one —
  // a second consecutive apply would spuriously trip the optimistic lock with
  // "changed in another session" (adversarial find D5). `updatePageIntent`
  // RETURNS the fresh row; we keep its version here and use max(prop, ref).
  const versionRef = useRef(page.version);
  useEffect(() => {
    versionRef.current = Math.max(versionRef.current, page.version);
  }, [page.version]);

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
      const updated = await updatePageIntent({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: versionRef.current,
        targetKeyword: page.target_keyword,
        desiredMetaTitle: title ?? page.meta_title_desired,
        desiredMetaDescription: description ?? page.meta_description_desired,
      });
      versionRef.current = Math.max(versionRef.current, updated.version);
      invalidatePage();
    },

    page_target_keyword: async (value: unknown) => {
      const obj = asRecord(value, "page_target_keyword");
      const keyword = optionalString(obj, "keyword", "page_target_keyword");
      if (!keyword) {
        throw new Error("page_target_keyword: keyword is required.");
      }
      const updated = await updatePageIntent({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: versionRef.current,
        targetKeyword: keyword,
        desiredMetaTitle: page.meta_title_desired,
        desiredMetaDescription: page.meta_description_desired,
      });
      versionRef.current = Math.max(versionRef.current, updated.version);
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
  });

  return null;
}
