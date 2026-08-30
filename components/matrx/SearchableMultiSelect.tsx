"use client";

import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

export type Option = {
  value: string;
  label: string;
};

interface SearchableMultiSelectProps {
  options: Option[];
  selectedValues?: string[];
  onSelectionChange?: (selectedValues: string[]) => void;
  onOptionSelect?: (option: Option, isSelected: boolean) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  className?: string;
}

const SearchableMultiSelect: React.FC<SearchableMultiSelectProps> = ({
  options,
  selectedValues: controlledValues,
  onSelectionChange,
  onOptionSelect,
  placeholder = "Select options",
  searchPlaceholder = "Search...",
  noResultsText = "No results found.",
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [internalSelectedValues, setInternalSelectedValues] = useState<
    string[]
  >([]);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedValues = controlledValues ?? internalSelectedValues;
  const selectedCount = selectedValues.length;

  useEffect(() => {
    const updatePosition = () => {
      if (triggerRef.current && open) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const searchLower = search.toLowerCase().trim();
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  const handleSelect = useCallback(
    (option: Option) => {
      const newSelectedValues = selectedValues.includes(option.value)
        ? selectedValues.filter((v) => v !== option.value)
        : [...selectedValues, option.value];

      if (!controlledValues) {
        setInternalSelectedValues(newSelectedValues);
      }

      onSelectionChange?.(newSelectedValues);
      onOptionSelect?.(option, !selectedValues.includes(option.value));
    },
    [selectedValues, controlledValues, onSelectionChange, onOptionSelect]
  );

  const displayValue = useMemo(() => {
    if (selectedCount === 0) return placeholder;
    if (selectedCount === 1) {
      const selected = options.find((opt) => opt.value === selectedValues[0]);
      return selected?.label || placeholder;
    }
    return `${selectedCount} items selected`;
  }, [selectedCount, selectedValues, options, placeholder]);

  return (
    <div className="w-full">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full min-w-0 bg-elevation1 rounded-md p-2 text-sm inline-flex items-center justify-between border-2 border-elevation3",
          className
        )}
      >
        <span className="truncate text-sm">{displayValue}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
            className="bg-elevation1 rounded-md border border-elevation3 shadow-lg z-[9999] mt-1"
          >
            <Command className="bg-elevation1" shouldFilter={false}>
              <div className="relative p-2">
                <Input
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="text-sm pr-8"
                />
                <Search className="h-4 w-4 absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none opacity-50" />
              </div>
              <CommandEmpty className="text-sm py-2 px-2">
                {noResultsText}
              </CommandEmpty>
              <CommandGroup className="max-h-60 overflow-auto">
                {filteredOptions.map((option) => {
                  const isSelected = selectedValues.includes(option.value);

                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => handleSelect(option)}
                      className={cn(
                        "text-ellipsis overflow-hidden hover:bg-primary hover:text-primary-foreground flex items-center gap-2",
                        isSelected && "bg-primary/10"
                      )}
                    >
                      <div
                        className="flex items-center gap-2 flex-1"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSelect(option);
                        }}
                      >
                        <div
                          className={cn(
                            "h-4 w-4 border rounded flex items-center justify-center",
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted"
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="truncate">{option.label}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Command>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SearchableMultiSelect;
