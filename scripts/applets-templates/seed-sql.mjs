// Prints the SQL that declares the platform's Applet templates (AP-0 item 10) in the system
// organization, published to the web — one statement per template, the row carried base64-encoded
// (the Supabase MCP stalls on raw JS text). Idempotent by slug. Applied through the Supabase MCP:
// the system organization is written by platform staff, not through a member's session.
// Run: node scripts/applets-templates/seed-sql.mjs <slug>
import { createClient } from "@supabase/supabase-js";
import { APPLET_TEMPLATES } from "./templates.mjs";

const SYSTEM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582"; // iam.system_orgs key 'system' (global_readable)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

const t = APPLET_TEMPLATES.find((x) => x.slug === process.argv[2]);
if (!t) throw new Error(`No template ${process.argv[2]}; one of ${APPLET_TEMPLATES.map((x) => x.slug).join(", ")}`);
const { data: page, error } = await sb.rpc("template_public_page", { p_key: t.template.slug });
if (error || !page?.card) throw new Error(`Data template ${t.template.slug} is not readable: ${error?.message ?? "no card"}`);
const row = {
  name: t.name, tagline: t.tagline, description: t.description, category: t.category, tags: t.tags,
  files: t.files, pages: t.pages,
  template: { template_id: page.card.id, catalogue_id: page.card.catalogue_id, template_slug: t.template.slug, bind: t.template.bind },
};
const b64 = Buffer.from(JSON.stringify(row), "utf8").toString("base64");
console.log(`select set_config('app.actor_system', 'applets.template-seed', true);
with r as (select convert_from(decode('${b64}','base64'),'UTF8')::jsonb j)
insert into app.definition (organization_id, created_by, slug, name, tagline, description, category, tags, files, entry, pages, mandates, sources, status, published_to_web, template)
select '${SYSTEM_ORG}', '${process.env.AI_ADMIN_USER_ID}', '${t.slug}', j->>'name', j->>'tagline', j->>'description', j->>'category',
  array(select jsonb_array_elements_text(j->'tags')), j->'files', 'App.tsx', j->'pages', '[]'::jsonb, '[]'::jsonb,
  'published', true, j->'template' from r
on conflict (slug) where deleted_at is null do update set name = excluded.name, tagline = excluded.tagline, description = excluded.description,
  category = excluded.category, tags = excluded.tags, files = excluded.files, pages = excluded.pages,
  status = excluded.status, published_to_web = excluded.published_to_web, template = excluded.template
returning id, slug;`);
