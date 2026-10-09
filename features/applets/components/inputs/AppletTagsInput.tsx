"use client";

/**
 * AppletTagsInput
 *
 * Chip-style multi-tag input. Replaces the comma-separated text field.
 *
 * - Type or dictate a tag (ProInput: mic + read-aloud), press Enter or comma to commit it.
 * - Each tag renders as a removable pill with an X.
 * - Backspace at empty input removes the last tag.
 * - Enforces uniqueness (case-insensitive) and trims whitespace.
 */

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProInput } from "@/components/official/ProInput";

interface AppletTagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Optional max — UX-only, doesn't break existing rows. */
  maxTags?: number;
}

export function AppletTagsInput({
  value,
  onChange,
  placeholder = "Add a tag and press Enter…",
  disabled = false,
  maxTags,
}: AppletTagsInputProps) {
  const [input, setInput] = useState("");

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

  return (
    <div
      role="group"
      aria-label="Tags"
      // focusout bubbles: leaving the box commits what was typed or dictated.
      onBlur={handleBlur}
      className={cn(
        "flex w-full flex-col gap-1.5",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {value.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium"
            >
              <span className="break-all">{tag}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {/* The platform's writing box: mic + read-aloud; Enter or comma adds the tag. */}
      <ProInput
        aria-label="Add a tag"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : "Add another tag"}
        disabled={disabled}
      />
    </div>
  );
}
