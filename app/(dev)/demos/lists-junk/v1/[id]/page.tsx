import React from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { UserListWithItems } from "@/features/user-lists/types";
import { ListDetailClient } from "@/features/user-lists/components/ListDetailClient";

interface ListDetailPageProps {
  params: Promise<{ id: string }>;
}

async function getListDetail(listId: string): Promise<{
  list: UserListWithItems | null;
  userId: string | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [rpcResult, ownerResult] = await Promise.all([
      supabase.rpc("get_user_list_with_items", { p_list_id: listId }),
      supabase
        .from("udt_picklists")
        .select("user_id")
        .eq("id", listId)
        .single(),
    ]);

    if (rpcResult.error || !rpcResult.data)
      return { list: null, userId: user?.id ?? null };

    const list = rpcResult.data as unknown as UserListWithItems;
    if (!ownerResult.error && ownerResult.data) {
      list.user_id = ownerResult.data.user_id;
    }

    return { list, userId: user?.id ?? null };
  } catch {
    return { list: null, userId: null };
  }
}

export default async function ListDetailPage({ params }: ListDetailPageProps) {
  const { id } = await params;
  const { list, userId } = await getListDetail(id);

  if (!list) {
    notFound();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mobile back button */}
      <div className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <a
          href="/lists"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
        >
          ← My Lists
        </a>
      </div>

      <div className="flex-1 overflow-hidden">
        <ListDetailClient list={list} userId={userId} />
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: ListDetailPageProps) {
  const { id } = await params;
  const { list } = await getListDetail(id);
  if (!list) return { title: "List not found | AI Matrx" };
  return {
    title: `${list.list_name} | AI Matrx`,
    description:
      list.description ?? `View and manage the "${list.list_name}" list`,
  };
}
