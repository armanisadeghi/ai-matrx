import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { UserListWithItems } from "@/features/user-lists/types";
import { ListDetailClient } from "@/features/user-lists/components/ListDetailClient";
import { ActiveListRegistrar } from "@/features/user-lists/components/ActiveListRegistrar";

interface PageProps {
  params: Promise<{ id: string }>;
}

const getListWithItems = cache(
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
  const list = await getListWithItems(id);
  if (!list) return { title: "List Not Found" };
  return {
    title: `${list.list_name} | My Lists | AI Matrx`,
    description: list.description ?? undefined,
  };
}

export default async function ListDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [list, supabase] = await Promise.all([
    getListWithItems(id),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!list) notFound();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ActiveListRegistrar data={list} />
      <ListDetailClient list={list} userId={user?.id ?? null} />
    </div>
  );
}
