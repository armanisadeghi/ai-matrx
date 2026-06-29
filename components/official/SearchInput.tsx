"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface SearchInputProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  debounceTime?: number;
  showClearButton?: boolean;
  showSubmitButton?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  "aria-label"?: string;
}

export function SearchInput({
  value,
  defaultValue = "",
  onValueChange,
  onSearch,
  placeholder = "Search...",
  loading = false,
  debounceTime = 300,
  showClearButton = true,
  showSubmitButton = false,
  autoFocus = false,
  disabled = false,
  className,
  inputClassName,
  buttonClassName,
  "aria-label": ariaLabel = "Search",
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;
  const searchValue = currentValue.trim();
  const didMountRef = useRef(false);
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    if (!onSearchRef.current) return undefined;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      onSearchRef.current?.(currentValue);
    }, debounceTime);
    return () => window.clearTimeout(timer);
  }, [currentValue, debounceTime]);

  const setNextValue = (nextValue: string) => {
    if (!isControlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch?.(currentValue);
  };

  const handleClear = () => {
    setNextValue("");
    onSearch?.("");
    inputRef.current?.focus();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex min-w-0 items-center gap-2", className)}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          type="search"
          value={currentValue}
          onChange={(event) => setNextValue(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "h-9 pl-9",
            showClearButton && searchValue && "pr-9",
            inputClassName,
          )}
        />
        {showClearButton && searchValue ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {showSubmitButton ? (
        <Button
          type="submit"
          disabled={disabled || loading}
          aria-label="Submit search"
          className={cn("h-9 w-10 px-0", buttonClassName)}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      ) : null}
    </form>
  );
}

export default SearchInput;
