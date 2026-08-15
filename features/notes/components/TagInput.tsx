// features/notes/components/TagInput.tsx
"use client";

import React, { useId, useState, KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  className?: string;
  /** Existing shared values to suggest while still allowing free entry. */
  suggestions?: string[];
}

export function TagInput({
  tags,
  onChange,
  className,
  suggestions = [],
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const suggestionsId = useId();

  const handleAddTag = () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && !tags.includes(trimmedValue)) {
      onChange([...tags, trimmedValue]);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === "Escape") {
      setInputValue("");
      setIsAdding(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 flex-nowrap overflow-x-auto min-w-0",
        className,
      )}
    >
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="text-xs h-5 px-1.5 pr-1 flex items-center gap-1 flex-shrink-0"
        >
          {tag}
          <button
            type="button"
            onClick={() => handleRemoveTag(tag)}
            className="hover:bg-accent rounded-full p-0.5"
            aria-label={`Remove ${tag}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}

      {isAdding ? (
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              handleAddTag();
            } else {
              setIsAdding(false);
            }
          }}
          placeholder="Type tag..."
          className="h-5 text-xs px-1.5 min-w-[6rem] w-24 bg-muted border-0 flex-shrink-0"
          autoFocus
          list={suggestions.length > 0 ? suggestionsId : undefined}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="h-5 px-1.5 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded flex-shrink-0"
        >
          <Plus className="h-3 w-3" />
          Tag
        </button>
      )}
      {suggestions.length > 0 ? (
        <datalist id={suggestionsId}>
          {suggestions
            .filter((suggestion) => !tags.includes(suggestion))
            .map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
        </datalist>
      ) : null}
    </div>
  );
}
