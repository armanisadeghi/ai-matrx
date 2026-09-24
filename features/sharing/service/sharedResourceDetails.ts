// features/sharing/service/sharedResourceDetails.ts — the title and link a "shared with you"
// email names for one resource, read AS THE SHARER (the route's own session client). Server-only.
// Moved out of app/api/sharing/notify/route.ts (a route file may export only its handlers) so it
// can be tested against the dev clone.

import type { createClient } from "@/utils/supabase/server";
// 🚨 THE ONE HELPER. A share link is followed COLD, out of an email, by somebody who
// may be working in a different organization — the exact arrival TAILS-3 measured
// landing on "Select an organization first". Never build `?org=` by hand here.
import { linkCarriesItsOrganization } from "@/lib/organizations/linkCarriesItsOrganization";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ResourceDetails {
  title: string;
  url: string;
}

/**
 * Get resource details for email
 */
export async function getResourceDetails(
  supabase: SupabaseServerClient,
  resourceType: string,
  resourceId: string,
): Promise<ResourceDetails | null> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.aimatrx.com";

  try {
    switch (resourceType) {
      case "prompt": {
        // TODO(prompt-to-agent-sweep): public.prompts is graveyarded.
        // Re-wire to agent.definition (same UUIDs) when the migration completes.
        console.warn(
          "[sharing/notify] prompt sharing notification skipped — public.prompts graveyarded",
        );
        return null;
      }

      case "canvas": {
        // BUG FOUND: this previously queried `public.canvases`, a table that
        // does not exist anywhere in the schema (canvas content lives in
        // `canvas.canvas_items`). Every canvas share notification silently
        // failed (caught below, returned null -> caller 404s "Resource
        // details not found"). Repointed to the real table.
        const { data } = await supabase
          .schema("canvas")
          .from("canvas_items")
          .select("title, organization_id")
          .eq("id", resourceId)
          .single();

        return data
          ? {
              title: data.title || "Untitled Canvas",
              url: await linkCarriesItsOrganization(
                `${siteUrl}/canvases/${resourceId}`,
                data.organization_id,
              ),
            }
          : null;
      }

      case "collection": {
        // BUG FOUND: `public.collections` does not exist anywhere in the
        // schema — this resource type has no backing table today. Every
        // "collection" share notification silently failed the same way as
        // the canvas case above. No replacement table identified; leaving
        // this branch returning null (existing observable behavior) rather
        // than guessing at a destination table.
        console.warn(
          "[sharing/notify] collection sharing notification skipped — no backing table in current schema",
        );
        return null;
      }

      case "note": {
        const { data } = await supabase
          .schema("workbench")
          .from("notes")
          .select("label, organization_id")
          .eq("id", resourceId)
          .single();

        return data
          ? {
              title: data.label || "Untitled Note",
              url: await linkCarriesItsOrganization(
                `${siteUrl}/notes/${resourceId}`,
                data.organization_id,
              ),
            }
          : null;
      }

      // A TABLE, WHEREVER IT LIVES (lane INTEG-CLIENTS, CUTOVER-PLAN rev 3 F14). The older
      // screen shares as "dataset", the record-store screen as "record"; a moved table keeps its
      // id, so the store is asked first and the older store answers only what the store does not
      // hold. Before this branch both types fell to the default: "Shared dataset" linking
      // /datasets/<id>, a page that does not exist.
      case "dataset":
      case "udt_datasets":
      case "record": {
        const inStore = await sharedStoreItem(supabase, resourceId);
        if (inStore) {
          return {
            title: inStore.title,
            url: await linkCarriesItsOrganization(`${siteUrl}${inStore.path}`, inStore.organizationId),
          };
        }
        if (resourceType === "record") return null;
        const { data } = await supabase
          .schema("workbench")
          .from("udt_datasets")
          .select("table_name, organization_id")
          .eq("id", resourceId)
          .is("deleted_at", null)
          .maybeSingle();
        return data
          ? {
              title: data.table_name || "Untitled table",
              url: await linkCarriesItsOrganization(`${siteUrl}/data/${resourceId}`, data.organization_id ?? null),
            }
          : null;
      }

      default:
        // No backing table is known for this resource type, so no organization is
        // known either. The helper is still the one that decides — it returns the link
        // unchanged rather than inventing an organization, which is the rule's own
        // contract, and the day this branch learns its table it needs no new code.
        return {
          title: `Shared ${resourceType}`,
          url: await linkCarriesItsOrganization(
            `${siteUrl}/${resourceType}s/${resourceId}`,
            null,
          ),
        };
    }
  } catch (error) {
    console.error("Error fetching resource details:", error);
    return null;
  }
}

/**
 * What the record store says a shared id is, read as the sharer: `custom.where_id_opens` answers
 * the page and the organization FROM THE OBJECT (never the sharer's active organization) and only
 * for an id the sharer may open; a Table's name is its Table-kernel record. A record that is not a
 * Table is named by its table ("A row in …"). Null when the store does not hold the id.
 */
async function sharedStoreItem(
  supabase: SupabaseServerClient,
  id: string,
): Promise<{ title: string; path: string; organizationId: string } | null> {
  const custom = supabase.schema("custom" as never) as unknown as {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const opened = await custom.rpc("where_id_opens", { p_id: id });
  const where = opened.data as { kind?: string; organization_id?: string; path?: string | null; resolved_id?: string } | null;
  if (opened.error || !where?.organization_id || !where.path) return null;
  if (where.kind !== "table" && where.kind !== "record") {
    // A dashboard, a digest, a form …: the store's own page for it, named by what it is.
    const what = (where.kind ?? "item").replace(/_/g, " ");
    return { title: `A shared ${what}`, path: where.path, organizationId: where.organization_id };
  }

  const kernel = await custom.rpc("table_kernel_id");
  if (kernel.error || typeof kernel.data !== "string") return null;
  // A record's page is /data-v2/<its table>?record=<id>; the table is named, not the row.
  const tableId = where.kind === "table" ? (where.resolved_id ?? id) : where.path.split("/data-v2/")[1]?.split("?")[0];
  if (!tableId) return null;
  const read = await custom.rpc("read_records_by_ids", {
    p_organization_id: where.organization_id,
    p_table_id: kernel.data,
    p_record_ids: [tableId],
    p_by_id: true,
  });
  const doc = ((read.data ?? []) as Array<{ document?: { name?: string } }>)[0]?.document;
  const tableName = doc?.name?.trim() || "Untitled table";
  return {
    title: where.kind === "table" ? tableName : `A row in ${tableName}`,
    path: where.path,
    organizationId: where.organization_id,
  };
}
