"use client";

import React from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRequestRecovery } from "../providers/RequestRecoveryProvider";
import { cn } from "@/lib/utils";

interface RequestRecoveryButtonProps {
  className?: string;
  /** If true, render nothing when there are no recovered items. Default true. */
  hideWhenEmpty?: boolean;
}

export function RequestRecoveryButton({
  className,
  hideWhenEmpty = true,
}: RequestRecoveryButtonProps) {
  const { items, hasItems, hasNewItems, open } = useRequestRecovery();
  if (hideWhenEmpty && !hasItems) return null;

  return (
    <Button
      icon={<Inbox />}
      variant="quiet"
      onClick={open}
      className={cn("relative", className)}
      title={`${items.length} recovered submission${items.length === 1 ? "" : "s"}`}
    >
      <span>Recovery</span>
      <span
        className={cn(
          "inline-flex items-center justify-center min-w-[1.25rem] h-[1.25rem] text-[10px] font-semibold rounded-full px-1",
          hasNewItems
            ? "bg-blue-500 text-white"
            : "bg-muted text-muted-foreground",
        )}
      >
        {items.length}
      </span>
    </Button>
  );
}
