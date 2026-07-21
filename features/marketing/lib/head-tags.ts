import type { Json } from "@/types/database.types";
import { isJsonRecord } from "@/features/marketing/types";

export interface ParsedSnapshotOpenGraph {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string | null;
  type: string | null;
}

export interface ParsedSnapshotTwitterCard {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
}

export interface ParsedSnapshotHeadTags {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  metaRobots: string | null;
  lang: string | null;
  hreflangCount: number;
  og: ParsedSnapshotOpenGraph;
  twitter: ParsedSnapshotTwitterCard;
}

function trimmedString(
  record: { [key: string]: Json | undefined },
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const EMPTY_OG: ParsedSnapshotOpenGraph = {
  title: null,
  description: null,
  image: null,
  siteName: null,
  url: null,
  type: null,
};

const EMPTY_TWITTER: ParsedSnapshotTwitterCard = {
  card: null,
  title: null,
  description: null,
  image: null,
};

/** Normalize scraper-persisted `web.snapshot.head_tags` into display fields. */
export function parseSnapshotHeadTags(headTags: Json): ParsedSnapshotHeadTags {
  if (!isJsonRecord(headTags)) {
    return {
      title: null,
      metaDescription: null,
      canonicalUrl: null,
      metaRobots: null,
      lang: null,
      hreflangCount: 0,
      og: EMPTY_OG,
      twitter: EMPTY_TWITTER,
    };
  }

  const og = isJsonRecord(headTags.og) ? headTags.og : {};
  const twitter = isJsonRecord(headTags.twitter) ? headTags.twitter : {};

  return {
    title: trimmedString(headTags, "title"),
    metaDescription: trimmedString(headTags, "meta_description"),
    canonicalUrl: trimmedString(headTags, "canonical_url"),
    metaRobots: trimmedString(headTags, "meta_robots"),
    lang: trimmedString(headTags, "lang"),
    hreflangCount: Array.isArray(headTags.hreflang)
      ? headTags.hreflang.length
      : 0,
    og: {
      title: trimmedString(og, "og:title"),
      description: trimmedString(og, "og:description"),
      image: trimmedString(og, "og:image"),
      siteName: trimmedString(og, "og:site_name"),
      url: trimmedString(og, "og:url"),
      type: trimmedString(og, "og:type"),
    },
    twitter: {
      card: trimmedString(twitter, "twitter:card"),
      title: trimmedString(twitter, "twitter:title"),
      description: trimmedString(twitter, "twitter:description"),
      image: trimmedString(twitter, "twitter:image"),
    },
  };
}
