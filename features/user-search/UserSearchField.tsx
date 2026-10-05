"use client";

import { Search } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useOpenUserSearchWindow } from "./useOpenUserSearchWindow";
import type { UserSearchCandidate } from "./types";

export interface UserSearchFieldProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  onUserSelect: (user: UserSearchCandidate) => void;
  directory?: "admin" | "provided";
  candidates?: UserSearchCandidate[];
  excludeUserIds?: string[];
  title?: string;
  placeholder?: string;
  disabled?: boolean;
  inputType?: "text" | "email";
  className?: string;
  inputClassName?: string;
  onEnter?: () => void;
  ariaLabel?: string;
}

export function UserSearchField({
  id,
  value,
  onValueChange,
  onUserSelect,
  directory = "provided",
  candidates = [],
  excludeUserIds = [],
  title = "Search users",
  placeholder = "Search by name, email, phone, organization, or ID…",
  disabled = false,
  inputType = "text",
  className,
  inputClassName,
  onEnter,
  ariaLabel = "Open advanced user search",
}: UserSearchFieldProps) {
  const openUserSearch = useOpenUserSearchWindow();
  const openSearch = () =>
    openUserSearch({
      title,
      initialQuery: value,
      directory,
      candidates,
      excludeUserIds,
      onSelected: ({ user }) => onUserSelect(user),
    });

  return (
    <div className={cn("flex min-w-0 gap-2", className)}>
      <Input
        id={id}
        type={inputType}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          // A host with its own Enter action keeps it; everywhere else Enter does what a person
          // expects after typing a name — opens the search on what they typed (2026-10-05: Enter
          // on a typed name did nothing, and the magnifier was the only way in).
          if (onEnter) onEnter();
          else openSearch();
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("min-w-0 flex-1", inputClassName)}
        autoComplete="off"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="shrink-0"
        onClick={openSearch}
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}
