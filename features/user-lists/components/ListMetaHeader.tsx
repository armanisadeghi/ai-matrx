"use client";

import React from "react";
import {
  Globe,
  Lock,
  Users,
  Settings,
  Share2,
  Trash2,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserListWithItems } from "../types";
import { getListVisibility } from "../types";
import type { FullListBookmark } from "../types";
import { BookmarkCopyButton } from "./BookmarkCopyButton";

interface ListMetaHeaderProps {
  list: UserListWithItems;
  isOwner: boolean;
  itemCount: number;
  groupCount: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

const VISIBILITY_CONFIG = {
  public: {
    label: "Public",
    icon: Globe,
    className: "text-green-600 dark:text-green-400",
  },
  authenticated: {
    label: "Users Only",
    icon: Users,
    className: "text-blue-600 dark:text-blue-400",
  },
  private: {
    label: "Private",
    icon: Lock,
    className: "text-amber-600 dark:text-amber-400",
  },
};

export function ListMetaHeader({
  list,
  isOwner,
  itemCount,
  groupCount,
  onEdit,
  onDelete,
}: ListMetaHeaderProps) {
  const audience = getListVisibility({
    is_public: list.is_public,
    public_read: list.public_read,
  });
  const visConfig = VISIBILITY_CONFIG[audience];
  const VisIcon = visConfig.icon;

  const bookmark: FullListBookmark = {
    type: "full_list",
    list_id: list.list_id,
    list_name: list.list_name,
    description: `Reference to entire list "${list.list_name}"`,
  };

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/lists/${list.list_id}`
      : `/lists/${list.list_id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
  };

  return (
    <div className="flex flex-col gap-2 px-3 py-3 border-b border-border bg-card/50">
      {/* Top row: title + actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-[clamp(1.125rem,1rem+0.5vw,1.375rem)] font-semibold text-foreground leading-tight truncate">
            {list.list_name}
          </h1>
          {list.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {list.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          <BookmarkCopyButton
            bookmark={bookmark}
            label={`Entire list "${list.list_name}"`}
            size="md"
          />

          {isOwner && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">List settings</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Edit list
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Share2 className="h-3.5 w-3.5 mr-2" />
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Meta row: stats + audience */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium",
            visConfig.className,
          )}
        >
          <VisIcon className="h-3 w-3" />
          {visConfig.label}
        </span>

        <span className="text-muted-foreground/40">·</span>

        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {itemCount}
          </span>{" "}
          {itemCount === 1 ? "item" : "items"}
        </span>

        {groupCount > 1 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {groupCount}
              </span>{" "}
              groups
            </span>
          </>
        )}
      </div>
    </div>
  );
}
