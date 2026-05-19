"use client";

import React, { useState } from "react";
import {
  X,
  Plus,
  Copy,
  Check,
  Zap,
  ChevronDown,
  ChevronUp,
  ListFilter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EntityBaseFieldProps } from "../entityBaseFieldProps";
import { cn } from "@/utils/cn";

interface EntityUUIDArrayProps extends EntityBaseFieldProps {
  value: string[];
}

const EntityUUIDArray = React.forwardRef<HTMLDivElement, EntityUUIDArrayProps>(
  (
    {
      entityKey,
      dynamicFieldInfo: field,
      value = [],
      onChange,
      density = "normal",
      animationPreset = "subtle",
      size = "default",
      className,
      variant = "default",
      disabled = false,
      floatingLabel = true,
      labelPosition = "default",
      ...props
    },
    ref,
  ) => {
    const [inputValue, setInputValue] = useState("");
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const customProps = field.componentProps as Record<string, unknown>;
    const showExternal = customProps?.displayMode === "external";

    // UUID validation regex
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const generateUUID = () => {
      const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        },
      );
      setInputValue(uuid);
    };

    const handleAdd = (e?: React.MouseEvent) => {
      e?.preventDefault();

      if (!inputValue.trim()) return;

      if (!uuidRegex.test(inputValue)) {
        alert("Please enter a valid UUID");
        return;
      }

      if (!value.includes(inputValue)) {
        onChange([...value, inputValue]);
        setInputValue("");
      }
    };

    const handleRemove = (uuid: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      onChange(value.filter((v) => v !== uuid));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    };

    const copyToClipboard = async (uuid: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      try {
        await navigator.clipboard.writeText(uuid);
        setCopiedId(uuid);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    const densityConfig = {
      compact: {
        wrapper: "gap-1 py-0.5",
        input: "text-sm h-8",
        button: "h-6 w-6",
        icon: "h-3 w-3",
      },
      normal: {
        wrapper: "gap-2 py-1",
        input: "text-base h-10",
        button: "h-7 w-7",
        icon: "h-4 w-4",
      },
      comfortable: {
        wrapper: "gap-3 py-1.5",
        input: "text-lg h-12",
        button: "h-8 w-8",
        icon: "h-5 w-5",
      },
    };

    const uniqueId = `${entityKey}-${field.name}`;

    const renderInput = (
      <div className="relative">
        <Input
          id={uniqueId}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add UUID..."
          disabled={disabled}
          className={cn("font-mono pr-28", densityConfig[density].input)}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(densityConfig[density].button, "p-0")}
            onClick={generateUUID}
            disabled={disabled}
          >
            <Zap className={densityConfig[density].icon} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(densityConfig[density].button, "p-0")}
            onClick={() => handleAdd()}
            disabled={disabled || !inputValue}
          >
            <Plus className={densityConfig[density].icon} />
          </Button>
        </div>
      </div>
    );

    const renderDropdown = !showExternal && value.length > 0 && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between font-normal mt-1"
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <ListFilter className={densityConfig[density].icon} />
              <span>
                {value.length} UUID{value.length !== 1 ? "s" : ""} stored
              </span>
            </div>
            <ChevronDown className={densityConfig[density].icon} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {value.map((uuid) => (
            <DropdownMenuItem
              key={uuid}
              className="flex justify-between items-center"
            >
              <span className="font-mono truncate flex-1">{uuid}</span>
              <div className="flex gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(densityConfig[density].button, "p-0")}
                  onClick={(e) => copyToClipboard(uuid, e)}
                  disabled={disabled}
                >
                  {copiedId === uuid ? (
                    <Check className={densityConfig[density].icon} />
                  ) : (
                    <Copy className={densityConfig[density].icon} />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(densityConfig[density].button, "p-0")}
                  onClick={(e) => handleRemove(uuid, e)}
                  disabled={disabled}
                >
                  <X className={densityConfig[density].icon} />
                </Button>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const renderExternalView = showExternal && value.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {value.map((uuid) => (
          <div
            key={uuid}
            className={cn(
              "bg-secondary text-secondary-foreground px-3 py-1 rounded-md flex items-center gap-2 font-mono",
              densityConfig[density].input,
            )}
          >
            <span className="truncate max-w-48">{uuid}</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                className={cn(densityConfig[density].button, "p-0")}
                onClick={(e) => copyToClipboard(uuid, e)}
                disabled={disabled}
              >
                {copiedId === uuid ? (
                  <Check className={densityConfig[density].icon} />
                ) : (
                  <Copy className={densityConfig[density].icon} />
                )}
              </Button>
              <Button
                variant="ghost"
                className={cn(densityConfig[density].button, "p-0")}
                onClick={(e) => handleRemove(uuid, e)}
                disabled={disabled}
              >
                <X className={densityConfig[density].icon} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );

    return (
      <div ref={ref} className={cn("space-y-2", className)} {...props}>
        {field.displayName && (
          <Label
            htmlFor={uniqueId}
            className={cn(
              densityConfig[density].input,
              disabled ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {field.displayName}
          </Label>
        )}
        {renderInput}
        {renderDropdown}
        {renderExternalView}
      </div>
    );
  },
);

EntityUUIDArray.displayName = "EntityUUIDArray";

export default EntityUUIDArray;

// Original: https://claude.ai/chat/fcee92e8-64e7-4835-af21-9e949c4dba07
