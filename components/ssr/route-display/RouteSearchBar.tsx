"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface RouteSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export default function RouteSearchBar({
  value,
  onChange,
  resultCount,
  totalCount,
  placeholder = "Search routes, categories…",
  autoFocus = false,
  className = "",
}: RouteSearchBarProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-20 bg-card border-border"
      />
      {value.trim() && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
          {resultCount}/{totalCount}
        </span>
      )}
    </div>
  );
}
