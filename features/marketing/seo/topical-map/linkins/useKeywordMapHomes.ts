"use client";

/**
 * WHERE A KEYWORD LIVES ON THE MAP — the read behind the Keyword Workbench's
 * `map_topic` column (placement §7 #1).
 *
 * A keyword's map home is `seo.site_keyword_value.topic_id` (FK →
 * `seo.map_topic` since migration 21; written by migration 23's
 * `seo.set_site_keyword_map_home`, which the daily offering assigner calls —
 * a SERVER-ONLY writer, deliberately: lesson 30 in the provisioning register).
 * There is no client-callable read for "this keyword's map topic", so this is
 * a direct, RLS-bounded table read of exactly the columns the column needs,
 * for exactly the keyword ids on the page — THE VIEW LAW: the query declares
 * its own scope. Names come from the map's own rows (`useMapTopicRows`).
 *
 * "No home yet" is a real state: the assigner homes a keyword from its
 * primary Offering on its next pass, and the column says so instead of
 * showing a blank.
 */

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";

import { withTopicalMapErrors } from "../errors";
import { topicalMapKeys, useMapTopicRows } from "../hooks";
import { useSiteTopicalMapLink } from "./useSiteTopicalMapLink";

const assertData = makeAssertData("seo.site_keyword_value");

interface KeywordHomeRow {
  keyword_id: string;
  topic_id: string | null;
}

async function readKeywordHomes(siteId: string, keywordIds: string[]): Promise<KeywordHomeRow[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("site_keyword_value")
    .select("keyword_id, topic_id")
    .eq("site_id", siteId)
    .in("keyword_id", keywordIds)
    .is("deleted_at", null);
  return assertData(response.data, response.error);
}

export interface KeywordMapHome {
  topicId: string;
  slug: string;
  name: string;
  status: string;
}

export interface KeywordMapHomes {
  /** The site's map, or null when it uses none. */
  mapId: string | null;
  /** True once BOTH the site's map and the page's homes have resolved. */
  ready: boolean;
  /** The function's own sentence when any read refused. */
  error: string | null;
  /**
   * `undefined` while not ready; `null` = no home yet; a home whose topic is
   * not in the map's rows (deleted) reads as null too, and is counted below.
   */
  homeFor: (keywordId: string) => KeywordMapHome | null | undefined;
}

export function useKeywordMapHomes(
  siteId: string,
  brandSeg: string | null,
  keywordIds: readonly string[],
): KeywordMapHomes {
  const link = useSiteTopicalMapLink(siteId, brandSeg);
  const mapId = link.mapId;
  const topics = useMapTopicRows(mapId ?? "", link.status === "ready");
  const ids = [...new Set(keywordIds)].sort();
  const homes = useQuery({
    queryKey: [...topicalMapKeys.root, "keyword-homes", siteId, ids] as const,
    queryFn: () =>
      withTopicalMapErrors("seo.site_keyword_value (keyword homes)", () =>
        readKeywordHomes(siteId, ids),
      ),
    enabled: link.status === "ready" && ids.length > 0,
  });

  const topicById = new Map((topics.data ?? []).map((t) => [t.id, t] as const));
  const homeByKeyword = new Map((homes.data ?? []).map((h) => [h.keyword_id, h.topic_id] as const));

  const error =
    link.status === "error"
      ? link.error
      : topics.isError
        ? (topics.error as Error).message
        : homes.isError
          ? (homes.error as Error).message
          : null;
  const ready =
    link.status === "none" ||
    (link.status === "ready" && !topics.isPending && (ids.length === 0 || !homes.isPending));

  return {
    mapId,
    ready,
    error,
    homeFor: (keywordId) => {
      if (!ready) return undefined;
      if (!mapId) return null;
      const topicId = homeByKeyword.get(keywordId) ?? null;
      if (!topicId) return null;
      const topic = topicById.get(topicId);
      if (!topic) return null;
      return { topicId, slug: topic.slug, name: topic.name, status: topic.status };
    },
  };
}
