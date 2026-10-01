import { cache } from "react";
import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import type { UserListWithItems } from "@/features/user-lists/types";
import { StoreListPage } from "./StoreListPage";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * Per-list route — the canonical deep link for a picklist (`/lists/<id>`), the
 * target of every Picklists row and New picklist. Every list lives in the record
 * store as a Table of choices under the same id; `get_user_list_with_items`
 * answers it from there, and the page opens it as the store's table page.
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
      } = await getClaimsUser(supabase);
      if (!user) return null;
      const { data, error } = await supabase.rpc("get_user_list_with_items", {
        p_list_id: listId,
      });
      if (error || !data) return null;
      // get_user_list_with_items returns Json directly (no row schema in
      // database.types.ts to guard against) — this is the sanctioned
      // Json-direct RPC cast per the type-safety skill's supabase-patterns.
      return data as unknown as UserListWithItems;
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
  const [list, { user, authUnavailable }] = await Promise.all([
    loadList(id),
    getServerAuth(),
  ]);

  if (!user && authUnavailable) {
    // Could-not-verify is not signed-out. "Sign in to view this picklist" to
    // a person who IS signed in is a lie; say which one this is.
    console.warn(
      `[/lists/${id}] identity could not be verified — showing the retry notice, not the sign-in gate.`,
    );
    return (
      <div className="p-4 text-sm text-muted-foreground">
        We could not verify who you are on this request, so this picklist is not
        loading. You have not been signed out — reload in a moment.
        <ErrorAlchemyMenu />
      </div>
    );
  }

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
          token="record"
          id={id}
          fallbackHref="/lists"
          fallbackLabel="Your picklists"
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <StoreListPage listId={id} />
    </div>
  );
}
