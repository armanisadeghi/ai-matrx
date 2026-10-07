// features/marketing/applets/copyAppletFromTemplate.ts — "USE THIS TEMPLATE", the Applet half.
//
// The data template's install (custom.template_install, the store's one install door) has made the
// tables in the organization the person chose. This copies the template Applet's record into that
// same organization with every source alias rebound to the table the install made for its token.
// Idempotent: a second press (or a re-open) finds the copy already made for this install.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TemplateDoorAnswer } from "@ai-matrx/records/templates";

import { installResolver } from "@/features/make/gallery/installAgent";

import type { AppletTemplateLink } from "./types";

export interface CopiedApplet {
  id: string;
  slug: string;
  name: string;
  /** True when this install already had its copy. */
  existed: boolean;
}

function suffix(): string {
  return Math.random().toString(16).slice(2, 8);
}

export async function copyAppletFromTemplate(
  supabase: SupabaseClient,
  args: { templateAppletId: string; organizationId: string; answer: TemplateDoorAnswer },
): Promise<CopiedApplet> {
  const { templateAppletId, organizationId, answer } = args;
  const db = supabase.schema("app");

  const { data: tpl, error: readError } = await db
    .from("definition")
    .select("id, slug, name, tagline, description, category, tags, files, entry, scope, pages, mandates, screenshots, template")
    .eq("id", templateAppletId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw new Error(`The template could not be read: ${readError.message}`);
  if (!tpl) throw new Error("This template is no longer available.");
  const link = tpl.template as unknown as AppletTemplateLink | null;
  if (!link?.bind) throw new Error(`${tpl.name} is not a template.`);

  const resolver = installResolver(answer);
  const sources = Object.entries(link.bind).map(([alias, token]) => {
    const tableId = resolver.tableId(token);
    if (!tableId) throw new Error(`The install made no "${token}" table, so the Applet's "${alias}" has nothing to read.`);
    return { alias, table_id: tableId, organization_id: organizationId };
  });

  const installId = typeof answer.install_id === "string" ? answer.install_id : null;
  const { data: existing, error: existingError } = await db
    .from("definition")
    .select("id, slug, name")
    .eq("organization_id", organizationId)
    .eq("metadata->from_template->>applet_id", templateAppletId)
    .eq("metadata->from_template->>install_id", installId ?? "")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Checking for an earlier copy failed: ${existingError.message}`);
  if (existing) return { ...existing, existed: true };

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in to use this template.");

  const { data: made, error: insertError } = await db
    .from("definition")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      slug: `${tpl.slug}-${suffix()}`,
      name: tpl.name,
      tagline: tpl.tagline,
      description: tpl.description,
      category: tpl.category,
      tags: tpl.tags,
      files: tpl.files,
      entry: tpl.entry,
      scope: tpl.scope,
      pages: tpl.pages,
      mandates: tpl.mandates,
      sources,
      screenshots: tpl.screenshots,
      status: "draft",
      metadata: { from_template: { applet_id: templateAppletId, install_id: installId, catalogue_id: link.catalogue_id } },
    })
    .select("id, slug, name")
    .single();
  if (insertError) throw new Error(`The Applet could not be added: ${insertError.message}`);
  return { ...made, existed: false };
}
