"use client";

/**
 * Text input with a filtered suggestion dropdown — pick from known DB values
 * or type a custom override. Used for schema / table / token fields.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface OverrideComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when the user picks a suggestion (not on free typing). */
  onSelect?: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  monospace?: boolean;
  disabled?: boolean;
  /** Max suggestions shown — keeps long lists usable. */
  maxVisible?: number;
  emptyHint?: string;
}

export function OverrideCombobox({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  className,
  inputClassName,
  monospace = false,
  disabled = false,
  maxVisible = 40,
  emptyHint = "Type a custom value…",
}: OverrideComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const base = q
      ? options.filter((opt) => opt.toLowerCase().includes(q))
      : options;
    return base.slice(0, maxVisible);
  }, [value, options, maxVisible]);

  useEffect(() => {
    setHighlight(0);
  }, [filtered.length, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    onSelect?.(next);
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (filtered.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      if (filtered.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        pick(filtered[highlight]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "h-8 pr-7 text-base",
            monospace && "font-mono",
            inputClassName,
          )}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            requestAnimationFrame(() => setOpen(false));
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || options.length === 0}
          className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          title="Show suggestions"
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && !disabled ? (
        <div className="absolute top-full z-50 mt-0.5 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {emptyHint}
            </div>
          ) : (
            filtered.map((opt, i) => (
              <button
                key={opt}
                type="button"
                className={cn(
                  "flex w-full items-center px-2 py-1.5 text-left text-xs hover:bg-accent",
                  monospace && "font-mono",
                  i === highlight && "bg-accent",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(opt);
                }}
              >
                {opt}
              </button>
            ))
          )}
          {options.length > maxVisible && filtered.length >= maxVisible ? (
            <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
              Refine search to see more…
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
