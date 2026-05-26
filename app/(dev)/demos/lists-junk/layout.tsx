import { createClient } from "@/utils/supabase/server";
import type { UserList, UserListSummaryRaw } from "@/features/user-lists/types";
import { normalizeUserList } from "@/features/user-lists/types";
import { ListsLayoutClient } from "@/features/user-lists/components/ListsLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/lists", {
  title: "Lists",
  description: "Manage your named collections and choice lists",
});

async function getLists(): Promise<UserList[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.rpc("get_user_lists_summary", {
      p_user_id: user.id,
    });
    if (error) return [];
    return ((data as unknown as UserListSummaryRaw[]) ?? []).map(
      normalizeUserList,
    ) as UserList[];
  } catch {
    return [];
  }
}

export default async function ListsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lists = await getLists();

  return <ListsLayoutClient lists={lists}>{children}</ListsLayoutClient>;
}
