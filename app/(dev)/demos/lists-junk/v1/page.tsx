import React from "react";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { Plus, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserList, UserListSummaryRaw } from "@/features/user-lists/types";
import { normalizeUserList } from "@/features/user-lists/types";
import { MobileListGrid } from "@/features/user-lists/components/MobileListGrid";

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

export default async function ListsPage() {
  const lists = await getLists();

  if (lists.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 py-20 px-4 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
          <ListFilter className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">
            No lists yet
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Create named collections of items to use in workflows, agent tools,
            and more.
          </p>
        </div>
        <Link href="/lists/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create your first list
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Mobile header — sidebar is hidden on mobile */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="text-base font-semibold text-foreground">My Lists</h1>
        <Link href="/lists/new">
          <Button size="sm" className="h-8 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </Link>
      </div>

      {/* Desktop: prompt to select a list from the sidebar */}
      <div className="hidden md:flex flex-col items-center justify-center gap-4 h-full py-20 text-center px-8">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
          <ListFilter className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            Select a list
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Choose a list from the sidebar or create a new one to get started.
          </p>
        </div>
      </div>

      {/* Mobile card grid — client component so Turbopack handles key props correctly */}
      <MobileListGrid lists={lists} />
    </div>
  );
}
