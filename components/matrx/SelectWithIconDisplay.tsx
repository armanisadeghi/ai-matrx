"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, forwardRef } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { AdvancedTooltip } from "./Tooltip";
import { cn } from "@/utils/cn";

type Item = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>> | React.ReactNode;
  label: string;
  value: string;
  key?: string;
};

type SelectWithIconDisplayProps = {
  items: Item[];
  value?: Item[];
  onChange?: (selectedItems: Item[]) => void;
  placeholder?: string;
  maxHeight?: string;
  className?: string;
  disabled?: boolean;
};

const SelectWithIconDisplay = forwardRef<HTMLElement, SelectWithIconDisplayProps>(({
  items,
  value,
  onChange,
  placeholder = "Select items...",
  maxHeight = "max-h-60",
  className = "",
  disabled = false,
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSelectedItems, setInternalSelectedItems] = useState<Item[]>([]);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedItems = value !== undefined ? value : internalSelectedItems;

  useLayoutEffect(() => {
    const updatePosition = () => {
      if (triggerRef.current && isOpen) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleItem = (item: Item) => {
    if (disabled) return;
    const newItems = selectedItems.find((i) => i.value === item.value)
      ? selectedItems.filter((i) => i.value !== item.value)
      : [...selectedItems, item];

    if (value === undefined) {
      setInternalSelectedItems(newItems);
    }
    onChange?.(newItems);
  };

  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className={`w-full space-y-3 ${className}`}>
      {/* Select Button */}
      <div className="relative">
        <button
          ref={triggerRef}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            "w-full min-w-0 bg-elevation1 rounded-md p-2 text-sm flex items-center justify-between border border-elevation3",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <span className="truncate text-sm">{placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>

        {/* Dropdown Menu Portal */}
        {isOpen && !disabled && createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              top: `${dropdownPosition?.top ?? 0}px`,
              left: `${dropdownPosition?.left ?? 0}px`,
              width: `${dropdownPosition?.width ?? 0}px`,
              visibility: dropdownPosition ? 'visible' : 'hidden',
            }}
            className={`mt-1 bg-elevation1 border border-elevation3 rounded-md 
                       shadow-lg ${maxHeight} overflow-auto z-[9999]`}
          >
            {items.map((item) => {
              const isSelected = selectedItems.find(
                (i) => i.value === item.value
              );

              return (
                <button
                  key={item.key || item.value}
                  onClick={() => toggleItem(item)}
                  disabled={disabled}
                  className="w-full px-3 py-2 text-left text-sm
                           hover:bg-elevation3/50 flex items-center justify-between
                           first:rounded-t-md last:rounded-b-md"
                >
                  <div className="flex items-center gap-2">
                    {typeof item.icon === 'function' ? 
                      React.createElement(item.icon, { className: "w-4 h-4 opacity-70" }) :
                      item.icon
                    }
                    <span className="truncate">{item.label}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 opacity-70" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
      </div>

      {/* Selected Items Display */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedItems.map((item) => (
              <AdvancedTooltip
                key={item.value}
                text={`Click to Remove ${item.label}`}
                variant="warning"
              >
                <button
                  onClick={() => toggleItem(item)}
                  disabled={disabled}
                  className={cn(
                    "flex items-center justify-center p-1.5 rounded-md opacity-70 hover:opacity-100 transition-all duration-200 group relative",
                    disabled && "cursor-not-allowed"
                  )}
                  aria-label={`Remove ${item.label}`}
                >
                  {typeof item.icon === 'function' ? 
                    React.createElement(item.icon, { className: "w-5 h-5 group-hover:text-destructive transition-colors" }) :
                    item.icon
                  }
                  <div
                    className="absolute inset-0 flex items-center justify-center 
                             opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-12 h-12 text-muted-foreground" />
                  </div>
                </button>
              </AdvancedTooltip>
          ))}
        </div>
      )}
    </div>
  );
});

SelectWithIconDisplay.displayName = 'SelectWithIconDisplay';

export default SelectWithIconDisplay;