"use client";

/**
 * ItemActionsDrawer — the long-press action sheet for one capture item.
 * Rendered by every list surface (ItemsSheet, the /all mobile list) so
 * long-press always offers the same four actions: open view mode, continue
 * capturing, hand off to processing (Mark ready / Reprocess — the status
 * transition IS the workflow trigger), and delete.
 */

import React from "react";
import { Camera, CheckCircle2, Eye, RefreshCw, Trash2 } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export interface ItemActionsTarget {
  id: string;
  code: string | null;
  status: "capturing" | "captured" | "processed";
}

export function ItemActionsDrawer({
  target,
  onOpenChange,
  onView,
  onCapture,
  onMarkReady,
  onDelete,
}: {
  /** The item the sheet acts on; null = closed. */
  target: ItemActionsTarget | null;
  onOpenChange: (open: boolean) => void;
  onView: (target: ItemActionsTarget) => void;
  onCapture: (target: ItemActionsTarget) => void;
  onMarkReady: (target: ItemActionsTarget) => void;
  onDelete: (target: ItemActionsTarget) => void;
}) {
  const act = (fn: (t: ItemActionsTarget) => void) => () => {
    if (!target) return;
    onOpenChange(false);
    fn(target);
  };

  return (
    <Drawer open={target !== null} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="pb-1">
          <DrawerTitle className="truncate">
            {target?.code ?? "Captured item"}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Actions for this item
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-1 px-4 pb-4 pb-safe">
          <ActionRow
            icon={<Eye className="h-5 w-5" />}
            label="View details"
            onClick={act(onView)}
          />
          <ActionRow
            icon={<Camera className="h-5 w-5" />}
            label="Continue capturing"
            onClick={act(onCapture)}
          />
          <ActionRow
            icon={
              target?.status === "processed" ? (
                <RefreshCw className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )
            }
            label={
              target?.status === "processed"
                ? "Reprocess"
                : "Mark ready for processing"
            }
            onClick={act(onMarkReady)}
          />
          <ActionRow
            icon={<Trash2 className="h-5 w-5" />}
            label="Delete item"
            destructive
            onClick={act(onDelete)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex min-h-[52px] w-full items-center gap-3 rounded-lg px-3 text-base " +
        (destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted")
      }
    >
      {icon}
      {label}
    </button>
  );
}
