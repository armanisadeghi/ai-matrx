// features/education/publishing/actions.ts
//
// Server actions for the AUTHORING surface of the /education/learn publishing
// engine. Every mutation:
//   1. re-checks super-admin (defence-in-depth over the RPC's own is_super_admin
//      gate — the DB is the real authority),
//   2. calls the SECURITY DEFINER RPC (any super-admin can edit any doc),
//   3. busts the LEARN_DOCS_TAG so the public list/article/sitemap/OG update
//      without a deploy (the "publish without deploy" DoD).

"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { mapRowToLearnDoc } from "./mappers";
import { LEARN_DOCS_TAG } from "./queries";
import type { LearnDocDraftInput, LearnDocRecord, LearnDocRow } from "./types";

// Next 16 server-action tag invalidation (read-your-own-writes): the admin sees
// the published change immediately, and every tagged public read is refreshed.
function bust() {
  updateTag(LEARN_DOCS_TAG);
}

/** Create (id null) or update a draft. Does not change publication status. */
export async function saveLearnDocAction(
  input: LearnDocDraftInput,
): Promise<LearnDocRecord> {
  await requireSuperAdmin();
  const sb = await createClient();
  const { data, error } = await sb.rpc("edu_learn_doc_upsert", {
    p_id: input.id ?? undefined,
    p_slug: input.slug,
    p_title: input.title,
    p_summary: input.summary,
    p_sections: input.sections,
    p_subject: input.subject ?? undefined,
    p_letter: input.letter ?? "Lr",
    p_keywords: input.keywords ?? [],
    p_related: input.related ?? {},
    p_content_updated_at: input.contentUpdatedAt ?? undefined,
  });
  if (error) throw new Error(`Save failed: ${error.message}`);
  bust();
  return mapRowToLearnDoc(data as LearnDocRow);
}

/** Publish (true) / unpublish (false). */
export async function setLearnDocStatusAction(
  id: string,
  publish: boolean,
): Promise<LearnDocRecord> {
  await requireSuperAdmin();
  const sb = await createClient();
  const { data, error } = await sb.rpc("edu_learn_doc_set_status", {
    p_id: id,
    p_publish: publish,
  });
  if (error) throw new Error(`Publish failed: ${error.message}`);
  bust();
  return mapRowToLearnDoc(data as LearnDocRow);
}

/** Soft-delete a doc. */
export async function deleteLearnDocAction(id: string): Promise<void> {
  await requireSuperAdmin();
  const sb = await createClient();
  const { error } = await sb.rpc("edu_learn_doc_delete", { p_id: id });
  if (error) throw new Error(`Delete failed: ${error.message}`);
  bust();
}

/** Every doc incl. drafts, for the admin list (bypasses per-owner RLS). */
export async function listLearnDocsAdminAction(): Promise<LearnDocRecord[]> {
  await requireSuperAdmin();
  const sb = await createClient();
  const { data, error } = await sb.rpc("edu_learn_doc_admin_list");
  if (error) throw new Error(`List failed: ${error.message}`);
  return ((data ?? []) as LearnDocRow[]).map(mapRowToLearnDoc);
}
