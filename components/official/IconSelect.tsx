"use client";

import * as React from "react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IconSelectItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  value: string;
}

export interface IconSelectProps {
  items: IconSelectItem[];
  icon?: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  /** When true, renders a searchable popover list instead of a plain select. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

const triggerBaseClassName =
  "h-7 w-7 px-0 bg-gray-200 dark:bg-gray-900 border-none justify-center focus:outline-none focus:ring-0";

function IconSelectTrigger({
  icon,
  triggerClassName,
  disabled,
}: Pick<IconSelectProps, "icon" | "triggerClassName" | "disabled">) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      className={cn(triggerBaseClassName, triggerClassName)}
    >
      {icon}
    </Button>
  );
}

/**
 * IconSelect - A simple icon-only select component based on the NavigationSelectIcon
 * that was proven to work correctly across the application.
 */
const IconSelect = ({
  items,
  icon,
  value,
  onValueChange,
  triggerClassName = "",
  contentClassName = "",
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search...",
}: IconSelectProps) => {
  const [open, setOpen] = useState(false);

  if (searchable) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <IconSelectTrigger
            icon={icon}
            triggerClassName={triggerClassName}
            disabled={disabled}
          />
        </PopoverTrigger>
        <PopoverContent
          className={cn("w-64 p-0", contentClassName)}
          align="start"
        >
          <Command>
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-9 text-sm"
            />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup className="max-h-72 overflow-auto">
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.label}
                    onSelect={() => {
                      onValueChange?.(item.value);
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center">
                      {item.icon && <span className="mr-2">{item.icon}</span>}
                      {item.label}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        className={cn(triggerBaseClassName, triggerClassName)}
        hideArrow={true}
      >
        {icon}
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.value}>
              <div className="flex items-center">
                {item.icon && <span className="mr-2">{item.icon}</span>}
                {item.label}
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default IconSelect;
