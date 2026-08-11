import { cache } from "react";
import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { createClient } from "@/utils/supabase/server";
import type { UserListWithItems } from "@/features/user-lists/types";
import { ListDetailClient } from "@/features/user-lists/components/ListDetailClient";

/**
 * Per-list detail/editor route — the canonical deep link for a picklist
 * (`/lists/<id>`). This is the URL `ListMetaHeader`'s share button copies and
 * the target of every `ListCard` / tree-nav / `CreateListDialog` navigation, so
 * it must resolve. Owner read via the `get_user_list_with_items` RPC; renders
 * the same interactive `ListDetailClient` used everywhere else.
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

const loadList = cache(
  async (listId: string): Promise<UserListWithItems | null> => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.rpc("get_user_list_with_items", {
        p_list_id: listId,
      });
      if (error || !data) return null;
      // get_user_list_with_items returns Json directly (no row schema in
      // database.types.ts to guard against) — this is the sanctioned
      // Json-direct RPC cast per the type-safety skill's supabase-patterns.
      const list = data as unknown as UserListWithItems;

      // The RPC's payload has NO `user_id` (list_id, list_name, description,
      // created_at, updated_at, is_public, public_read, items_grouped only),
      // so `ListDetailClient`'s `userId === list.user_id` ownership test was
      // comparing against undefined and resolving to false for EVERYONE — the
      // owner included. That silently hid the header's "Edit list" / "Delete
      // list" actions on this route, and it is the signal the surface's
      // `list_is_owner` value and every write handler gate on. Read the owner
      // off the table and attach it.
      const { data: ownerRow } = await supabase
        .schema("workbench")
        .from("udt_structured_lists")
        .select("user_id")
        .eq("id", listId)
        .maybeSingle();
      return { ...list, user_id: ownerRow?.user_id ?? undefined };
    } catch {
      return null;
    }
  },
);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const list = await loadList(id);
  // The read coming back empty tells us nothing about WHY (denied / deleted /
  // never existed / session gone), so the tab title must not pick one. The
  // page body says the true thing via <AccessGate>.
  if (!list) return { title: "Picklist | AI Matrx" };
  return {
    title: `${list.list_name} | Picklists | AI Matrx`,
    description: list.description ?? undefined,
  };
}

export default async function ListDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [list, supabase] = await Promise.all([loadList(id), createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Guests: the owner-scoped RPC always returns null without a session, so
    // a signed-out visitor following a shared link would otherwise hit a 404.
    // Show the sign-in gate and bring them back here after login.
    return (
      <ModuleSignInGate
        title="Picklists"
        route={`/lists/${id}`}
        description="Sign in to view and edit this picklist."
        icon={ListChecks}
      />
    );
  }

  // `notFound()` was an assertion we had no basis for: the owner-scoped RPC
  // returns null for a picklist that was shared-then-unshared, soft-deleted,
  // or simply someone else's, and a 404 told all of them the same lie. The
  // gate resolves which it is and offers a request when it's a real record.
  if (!list) {
    return (
      <div className="h-full overflow-hidden">
        <AccessGate
          token="structured_list"
          id={id}
          fallbackHref="/lists"
          fallbackLabel="Your picklists"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ListDetailClient list={list} userId={user?.id ?? null} asRoute />
    </div>
  );
}
