// features/make/gallery/publicCatalogue.server.ts — LANE MAKE-HOME (v6), wave 4b.
//
// The signed-out read of the catalogue for /templates, its pages and the sitemap, through the public door
// `public.templates_public` (platform cards only, the same card shape as `custom.templates`; v7 TEMPLATES). It asks with the
// publishable key and no session (never a secret key, never a cookie), so the page shows exactly what
// a crawler may see. Shared by a page and its metadata in one request.

import "server-only";
import { cache } from "react";

import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";

import { resolveRelativeDates, type TemplateSpec } from "@ai-matrx/records/templates";

import type { ShowSpec } from "./TemplateShowcase";

import type { GalleryCard } from "./catalogue";
import { closedReason, platformFilter, readPublicCatalogueWith, type PublicRead } from "./publicGallery";

async function readOnce(): Promise<PublicRead> {
  const sb = getScriptSupabaseClient();
  return readPublicCatalogueWith((offset) => sb.schema("public").rpc("templates_public", { p_filter: platformFilter(offset) }));
}

// ONE catalogue read per server process for a few minutes, not one per page. React `cache()` lasts a
// single request, and the build prerenders every /templates/category/* and /templates/job/* page, so
// each page re-read the whole paged catalogue: 192 RPC calls, ~4 minutes of waiting per build
// (measured 2026-10-08). The pages revalidate hourly, so a 5-minute shared read changes nothing a
// visitor sees. A closed or failed read is never kept.
const SHARED_READ_MS = 5 * 60 * 1000;
let sharedRead: { at: number; read: Promise<PublicRead> } | null = null;

function readShared(): Promise<PublicRead> {
  if (sharedRead && Date.now() - sharedRead.at < SHARED_READ_MS) return sharedRead.read;
  const read = readOnce();
  const entry = { at: Date.now(), read };
  sharedRead = entry;
  read.then(
    (r) => {
      if (r.state === "closed" && sharedRead === entry) sharedRead = null;
    },
    () => {
      if (sharedRead === entry) sharedRead = null;
    },
  );
  return read;
}

export const readPublicCatalogue = cache(async (): Promise<PublicRead> => {
  const read = await readShared();
  if (read.state === "closed") {
    console.warn(
      `[templates] the public gallery is empty because public.templates_public is ${read.reason === "absent" ? "not on this database" : "refused to a signed-out caller"}. ` +
        "Remedy: apply migrations/campaign/templates7_a_anyone_can_browse_the_platform_templates.sql.",
    );
  }
  return read;
});

/** One template's public page: its card and its spec with every relative date resolved to today. */
export interface PublicTemplatePage {
  card: GalleryCard;
  spec: ShowSpec;
  updatedAt: string | null;
}

/**
 * THE PAGE READ (`public.template_public_page`): one published platform template by its readable
 * address, its catalogue id or a version id — so an old address finds the template and the page
 * sends it on to the readable one. Null when no published platform template answers to the key.
 */
export const readTemplatePage = cache(async (key: string): Promise<PublicTemplatePage | null> => {
  const sb = getScriptSupabaseClient();
  const { data, error } = await sb.schema("public").rpc("template_public_page", { p_key: key });
  if (error) {
    if (closedReason(error)) return null;
    throw new Error(`The template page could not be read: ${error.message ?? error.code ?? "unknown error"}`);
  }
  const answer = data as { card: GalleryCard; spec: TemplateSpec; updated_at: string | null } | null;
  if (!answer?.card) return null;
  const today = new Date().toISOString().slice(0, 10);
  const spec = resolveRelativeDates(answer.spec as TemplateSpec, today) as unknown as ShowSpec;
  return { card: answer.card, spec, updatedAt: answer.updated_at };
});
