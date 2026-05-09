"use client";

/**
 * AgentAppTagsInput
 *
 * Chip-style multi-tag input. Replaces the comma-separated text field.
 *
 * - Type a tag, press Enter or comma to commit it.
 * - Each tag renders as a removable pill with an X.
 * - Backspace at empty input removes the last tag.
 * - Enforces uniqueness (case-insensitive) and trims whitespace.
 */

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentAppTagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Optional max — UX-only, doesn't break existing rows. */
  maxTags?: number;
}

export function AgentAppTagsInput({
  value,
  onChange,
  placeholder = "Add a tag and press Enter…",
  disabled = false,
  maxTags,
}: AgentAppTagsInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = useCallback(
    (raw: string) => {
      const tag = raw.trim();
      if (!tag) return;
      if (maxTags && value.length >= maxTags) return;
      // case-insensitive dedupe
      const exists = value.some((v) => v.toLowerCase() === tag.toLowerCase());
      if (exists) return;
      onChange([...value, tag]);
      setInput("");
    },
    [value, onChange, maxTags],
  );

  const removeAt = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(input);
        return;
      }
      if (e.key === "Backspace" && input === "" && value.length > 0) {
        e.preventDefault();
        removeAt(value.length - 1);
      }
    },
    [input, value.length, addTag, removeAt],
  );

  const handleBlur = () => {
    if (input.trim()) addTag(input);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Clicking the container focuses the input — except when clicking a chip's
    // remove button.
    if (e.target instanceof HTMLElement && e.target.closest("[data-chip-x]")) {
      return;
    }
    inputRef.current?.focus();
  };

  return (
    <div
      role="group"
      onClick={handleContainerClick}
      className={cn(
        "min-h-9 w-full flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border border-input bg-background transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium"
        >
          <span className="break-all">{tag}</span>
          {!disabled && (
            <button
              type="button"
              data-chip-x
              onClick={() => removeAt(i)}
              className="rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
              aria-label={`Remove tag ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : ""}
        disabled={disabled}
        className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
}
