"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { X, Copy, Check } from "lucide-react";
import { cleanUrl } from "@/utils/url-utils";

interface TextArrayInputProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  chipClassName?: string;
  uniqueFilter?: boolean;
  showCopyIcon?: boolean;
  shouldCleanUrl?: boolean;
}

const TextArrayInput = ({
  value: externalValue,
  onChange,
  placeholder = "Add items (press Enter)",
  className = "",
  chipClassName = "bg-primary text-primary-foreground",
  uniqueFilter = true,
  showCopyIcon = true,
  shouldCleanUrl = false,
}: TextArrayInputProps) => {
  const [internalValue, setInternalValue] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [copied, setCopied] = useState(false);

  const value = externalValue || internalValue;

  const handleCopy = async () => {
    const textToCopy = value.join(", ");
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleChange = (newItems: string[]) => {
    const processedItems = uniqueFilter ? [...new Set(newItems)] : newItems;

    if (onChange) {
      onChange(processedItems);
    } else {
      setInternalValue(processedItems);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      const newItems = inputValue
        .split(",")
        .map((item) => {
          const trimmed = item.trim();
          return shouldCleanUrl && trimmed ? cleanUrl(trimmed) : trimmed;
        })
        .filter((item) => item.length > 0);

      const newValue = [...value, ...newItems];
      handleChange(newValue);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  const removeItem = (indexToRemove: number) => {
    const newValue = value.filter((_, index) => index !== indexToRemove);
    handleChange(newValue);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <form onSubmit={handleSubmit} className="w-full relative">
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pr-10"
        />
        {showCopyIcon && value.length > 0 && (
          <button
            type="button"
            onClick={handleCopy}
            className="absolute right-2 top-1/2 -translate-y-1/2 
                            hover:bg-muted p-1 rounded-md transition-colors duration-200"
            aria-label="Copy values"
          >
            {copied ? (
              <Check size={16} className="text-green-500" />
            ) : (
              <Copy size={16} className="text-muted-foreground" />
            )}
          </button>
        )}
      </form>

      <div className="flex flex-wrap gap-2">
        {value.length === 0 ? (
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-sm 
                        bg-muted text-muted-foreground"
          >
            None Added
          </span>
        ) : (
          value.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm 
                                cursor-default hover:opacity-90 transition-all duration-200 
                                ${chipClassName}`}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest("button")) {
                  console.log("Chip clicked:", item);
                }
              }}
            >
              {item}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(index);
                }}
                className="hover:bg-primary-foreground/20 rounded-full p-0.5
                                    transition-colors duration-200 cursor-pointer"
                aria-label={`Remove ${item}`}
              >
                <X size={14} />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
};

export default TextArrayInput;
