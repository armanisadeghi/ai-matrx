import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// Dev-only diagnostic for the agent-shortcuts stack.
// Returns row counts + samples from every table the context menu depends on,
// plus the agx_context_menu_view output for the caller's visibility.

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = supabase as unknown as {
      from: (name: string) => any;
      rpc: (name: string, args?: any) => any;
    };

    const [
      categoriesCount,
      shortcutsCount,
      contentBlocksCount,
      agxAgentCount,
      categoriesSample,
      shortcutsSample,
      contentBlocksSample,
      viewRows,
    ] = await Promise.all([
      client
        .from("shortcut_categories")
        .select("*", { count: "exact", head: true }),
      client.from("agx_shortcut").select("*", { count: "exact", head: true }),
      client.from("content_blocks").select("*", { count: "exact", head: true }),
      client.from("agx_agent").select("*", { count: "exact", head: true }),
      client
        .from("shortcut_categories")
        .select(
          "id,label,placement_type,parent_category_id,is_active,user_id,organization_id",
        )
        .limit(10),
      client
        .from("agx_shortcut")
        .select(
          "id,label,category_id,agent_id,is_active,user_id,organization_id",
        )
        .limit(10),
      client
        .from("content_blocks")
        .select(
          "id,label,block_id,category_id,is_active,user_id,organization_id",
        )
        .limit(10),
      client.from("agx_context_menu_view").select("*"),
    ]);

    const result = {
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
      counts: {
        shortcut_categories: categoriesCount.count ?? 0,
        agx_shortcut: shortcutsCount.count ?? 0,
        content_blocks: contentBlocksCount.count ?? 0,
        agx_agent: agxAgentCount.count ?? 0,
      },
      samples: {
        shortcut_categories: categoriesSample.data ?? {
          error: categoriesSample.error?.message,
        },
        agx_shortcut: shortcutsSample.data ?? {
          error: shortcutsSample.error?.message,
        },
        content_blocks: contentBlocksSample.data ?? {
          error: contentBlocksSample.error?.message,
        },
      },
      view: {
        row_count: Array.isArray(viewRows.data) ? viewRows.data.length : 0,
        error: viewRows.error?.message ?? null,
        data: viewRows.data ?? null,
      },
      interpretation: (() => {
        const notes: string[] = [];
        if ((categoriesCount.count ?? 0) === 0) {
          notes.push(
            "shortcut_categories is EMPTY — the context menu has no categories to render. Create categories in /administration/system-agents/categories or they must exist in the DB.",
          );
        }
        if ((shortcutsCount.count ?? 0) === 0) {
          notes.push(
            "agx_shortcut is EMPTY — every AI-action submenu will be disabled (no items). This is the root cause of 'disabled submenus' in /ssr/context-menu. Seed shortcuts via /administration/system-agents/shortcuts or create them programmatically.",
          );
        }
        if ((contentBlocksCount.count ?? 0) === 0) {
          notes.push(
            "content_blocks is EMPTY — the Content Blocks submenu will be disabled.",
          );
        }
        if (viewRows.error) {
          notes.push(
            `agx_context_menu_view query errored: ${viewRows.error.message}. The view may not exist or RLS is blocking.`,
          );
        }
        if (
          (categoriesCount.count ?? 0) > 0 &&
          (shortcutsCount.count ?? 0) === 0 &&
          (contentBlocksCount.count ?? 0) === 0
        ) {
          notes.push(
            "Categories exist but no shortcuts or content blocks. Menu renders category headers with nothing underneath — hence disabled submenus.",
          );
        }
        if (notes.length === 0) {
          notes.push(
            "Data looks healthy. If menu still renders disabled, check RLS visibility for this user.",
          );
        }
        return notes;
      })(),
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "diagnostic failed",
        details: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
