// features/spaces/state/templates.ts — I2 / I3: the "template" label on a Space, and "Use template".
//
// The label is the platform category `document_label` / `template`, assigned by the association
// `document → category` labelled `labeled` (common-docs spaces STATE.md § Applied). "Templates I can open"
// is one `assoc_for_targets` read (it already filters to Spaces the caller can open). "Use template" is
// `content.space_duplicate` into the active organization at the top level, keeping the template's title.
//
// These doors belong in the store-db adapter (owner's folder); until it carries them they live here
// (NEEDS row). No permission logic: the database decides.

import { pageOrganizationId } from "../data/agency-install";
import { supabase } from "@/utils/supabase/client";

const ROLE = "labeled";

/** What carries the label: a page (`document`, the Spaces templates) or a saved board (`board`, SI-13). Both ride the same
 *  category and the same `labeled` association, so one set of helpers serves both - never a second mechanism. */
export type TemplateSource = "document" | "board";
let categoryId: Promise<string> | null = null;

/** The template category's id, read once per tab. */
function templateCategoryId(): Promise<string> {
  categoryId ??= (async () => {
    const { data, error } = await supabase
      .schema("platform")
      .from("categories")
      .select("id")
      .eq("dimension", "document_label")
      .eq("slug", "template")
      .is("deleted_at", null)
      .single();
    if (error || !data) {
      categoryId = null;
      throw new Error(`We couldn't read the template label${error ? `: ${error.message}` : "."}`);
    }
    return data.id;
  })();
  return categoryId;
}

/** Ids of every record of `source` (default: Space) marked as a template that the person can open. */
export async function listTemplateIds(source: TemplateSource = "document"): Promise<string[]> {
  const cat = await templateCategoryId();
  const { data, error } = await supabase.rpc("assoc_for_targets", { p_target_type: "category", p_target_ids: [cat] });
  if (error) throw new Error(`We couldn't list templates: ${error.message}`);
  return [...new Set((data ?? []).filter((e) => e.source_type === source && e.label === ROLE).map((e) => e.source_id))];
}

export async function setTemplate(spaceId: string, on: boolean, source: TemplateSource = "document"): Promise<void> {
  const cat = await templateCategoryId();
  const { error } = on
    ? await supabase.rpc("assoc_link", {
        p_source_type: source,
        p_source_id: spaceId,
        p_target_type: "category",
        p_target_id: cat,
        p_role: ROLE,
        p_label: ROLE,
      })
    : await supabase.rpc("assoc_unlink", { p_source_type: source, p_source_id: spaceId, p_target_type: "category", p_target_id: cat, p_role: ROLE });
  if (error) throw new Error(`We couldn't ${on ? `save this ${source === "board" ? "board" : "page"} as a template` : "remove the template label"}: ${error.message}`);
}

/** "Use template": the template and its sub-pages copied to the top level of the active organization. */
export async function copyTemplate(templateId: string, title: string, activeOrganizationId: string | null): Promise<string> {
  // The copy is filed in the template's own organization (read from the page), never whichever is active.
  const organizationId = (await pageOrganizationId(templateId)) ?? activeOrganizationId;
  if (!organizationId) throw new Error("We couldn't tell which organization this template belongs to.");
  // Not in the generated types until the next regeneration: a typed local shape for this one door.
  const content = supabase.schema("content") as unknown as {
    rpc(fn: "space_duplicate", args: Record<string, unknown>): PromiseLike<{ data: string | null; error: { message: string } | null }>;
  };
  const { data, error } = await content.rpc("space_duplicate", {
    p_space_id: templateId,
    p_organization_id: organizationId,
    p_with_children: true,
    p_title: title || "Untitled",
  });
  if (error || !data) throw new Error(`We couldn't use this template${error ? `: ${error.message}` : "."}`);
  return data;
}

