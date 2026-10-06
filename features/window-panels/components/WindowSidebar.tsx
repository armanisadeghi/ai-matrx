"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface WindowSidebarItem {
  value: string;
  label: string;
  icon: React.ElementType;
  description?: string;
}

interface WindowSidebarProps<T extends string = string> {
  items: WindowSidebarItem[];
  activeItem: T;
  onSelect: (value: T) => void;
  className?: string;
}

export function WindowSidebar<T extends string = string>({
  items,
  activeItem,
  onSelect,
  className,
}: WindowSidebarProps<T>) {
  return (
    <ScrollArea className={cn("flex-1 w-full", className)}>
      <div className="py-2">
        {items.map((item) => {
          const Icon = item.icon as React.FC<{ className?: string }>;
          const isActive = item.value === activeItem;
          return (
            <button
              key={item.value}
              onClick={() => onSelect(item.value as T)}
              title={item.description}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors",
                isActive
                  ? "bg-primary/10 text-primary-ink border-r-2 border-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

export default WindowSidebar;
