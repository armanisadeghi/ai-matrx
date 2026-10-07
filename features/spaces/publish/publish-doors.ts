// features/spaces/publish/publish-doors.ts — Notion's Publish (J1, I4) through the platform's doors.
//
// "Published to the web" is the platform's ONE anonymous lane (`published_to_web`, access ladder). A page
// goes on the web through `content.space_publish` (the caller's own update under row security; sub-pages
// follow when "Include sub-pages" is on), "Allow search engines" is the T-12 switch
// (`platform.set_search_engine_indexed`), the public page reads `content.space_public_view`, and Duplicate
// is `content.space_duplicate_published` (refused when the owner turned it off). No permission logic here.

import { supabase } from "@/utils/supabase/client";

export interface PublishState {
  published: boolean;
  slug: string | null;
  includeSubPages: boolean;
  allowDuplicate: boolean;
  /** The creator's choice; null = the type default (not indexed). */
  indexed: boolean | null;
}

export interface PublishChange {
  published?: boolean;
  includeSubPages?: boolean;
  allowDuplicate?: boolean;
  slug?: string;
}

/** The public address of a published page. */
export function publicPageUrl(slugOrId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL ?? "");
  return `${base}/site/${slugOrId}`;
}

function message(error: { message?: string } | null | undefined, fallback: string): string {
  return error?.message?.trim() || fallback;
}

export async function readPublishState(spaceId: string): Promise<PublishState> {
  const { data, error } = await supabase
    .schema("content")
    .from("document")
    .select("published_to_web, slug, web_include_sub_pages, web_allow_duplicate, search_engine_indexed")
    .eq("id", spaceId)
    .maybeSingle();
  if (error) throw new Error(message(error, "We couldn't read this page's publish settings."));
  if (!data) throw new Error("This page is not here any more, or you cannot open it.");
  return {
    published: data.published_to_web === true,
    slug: data.slug ?? null,
    includeSubPages: data.web_include_sub_pages !== false,
    allowDuplicate: data.web_allow_duplicate !== false,
    indexed: data.search_engine_indexed ?? null,
  };
}

export async function changePublish(spaceId: string, change: PublishChange): Promise<void> {
  const { error } = await supabase.schema("content").rpc("space_publish", {
    p_space_id: spaceId,
    p_published: change.published,
    p_include_sub_pages: change.includeSubPages,
    p_allow_duplicate: change.allowDuplicate,
    p_slug: change.slug,
  });
  if (error) throw new Error(message(error, "We couldn't change how this page is published."));
}

export async function setSearchEngines(spaceId: string, on: boolean): Promise<void> {
  const { error } = await supabase
    .schema("platform")
    .rpc("set_search_engine_indexed", { p_resource_type: "document", p_resource_id: spaceId, p_indexed: on });
  if (error) throw new Error(message(error, "We couldn't change the search engine setting."));
}

/** Copy a published page (and its published sub-pages) into the caller's organization; returns the copy's id. */
export async function duplicatePublished(key: string, organizationId: string): Promise<string> {
  const { data, error } = await supabase
    .schema("content")
    .rpc("space_duplicate_published", { p_key: key, p_organization_id: organizationId });
  if (error || !data) throw new Error(message(error, "We couldn't duplicate this page."));
  return data;
}
