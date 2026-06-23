import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  if (!list) return { title: "List Not Found" };
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

  if (!list) notFound();

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <ListDetailClient list={list} userId={user?.id ?? null} />
    </div>
  );
}
