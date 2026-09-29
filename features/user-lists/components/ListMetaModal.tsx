"use client";

import React from "react";
import { Globe, Lock, Users, Package, Tag, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { UserList } from "../types";
import { getListVisibility } from "../types";
import { useIsMobile } from "@/hooks/use-mobile";

interface ListMetaModalProps {
  list: UserList | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VISIBILITY_CONFIG = {
  public: {
    label: "Public",
    icon: Globe,
    badgeClass: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  },
  authenticated: {
    label: "Users Only",
    icon: Users,
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  private: {
    label: "Private",
    icon: Lock,
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetaContent({ list }: { list: UserList }) {
  const audience = getListVisibility(list);
  const visConfig = VISIBILITY_CONFIG[audience];
  const VisIcon = visConfig.icon;

  return (
    <div className="space-y-4 pt-2">
      {list.description ? (
        <p className="text-sm text-foreground leading-relaxed">{list.description}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">No description</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Visibility
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border w-fit",
              visConfig.badgeClass,
            )}
          >
            <VisIcon className="h-3 w-3" />
            {visConfig.label}
          </span>
        </div>

        {list.item_count !== undefined && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Items
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              {list.item_count}
            </span>
          </div>
        )}

        {list.group_count !== undefined && list.group_count > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Groups
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {list.group_count}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Created
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDate(list.created_at)}
          </span>
        </div>

        {list.updated_at && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Updated
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(list.updated_at)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ListMetaModal({ list, open, onOpenChange }: ListMetaModalProps) {
  const isMobile = useIsMobile();

  if (!list) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="text-base">{list.list_name}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 pb-safe">
            <MetaContent list={list} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{list.list_name}</DialogTitle>
        </DialogHeader>
        <MetaContent list={list} />
      </DialogContent>
    </Dialog>
  );
}
