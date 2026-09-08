"use client";

import React from "react";
import Link from "next/link";
import { Globe, Lock, Users, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserList } from "../types";
import { getListVisibility } from "../types";
import { listCalendarAge } from "@/features/user-lists/calendar-age";

const VISIBILITY_CONFIG = {
  public: {
    label: "Public",
    icon: Globe,
    className:
      "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20",
  },
  authenticated: {
    label: "Users",
    icon: Users,
    className:
      "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  private: {
    label: "Private",
    icon: Lock,
    className:
      "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
};


interface MobileListGridProps {
  lists: UserList[];
}

export function MobileListGrid({ lists }: MobileListGridProps) {
  return (
    <div className="md:hidden grid grid-cols-1 gap-3 p-4">
      {lists.map((list) => {
        const visibility = getListVisibility(list);
        const visConfig = VISIBILITY_CONFIG[visibility];
        const VisIcon = visConfig.icon;

        return (
          <Link
            key={list.id}
            href={`/lists/${list.id}`}
            className={cn(
              "group flex flex-col gap-2 p-4 rounded-xl",
              "bg-card border border-border",
              "hover:border-primary/30 hover:shadow-sm transition-all duration-150",
              "active:scale-[0.99]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {list.list_name}
                </p>
                {list.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {list.description}
                  </p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
            </div>

            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                  visConfig.className,
                )}
              >
                <VisIcon className="h-2.5 w-2.5" />
                {visConfig.label}
              </span>
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {list.item_count ?? 0} items
              </span>
              <span className="text-xs text-muted-foreground/60 ml-auto">
                {listCalendarAge(list.updated_at ?? list.created_at)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
