"use client";

import React, { useMemo, useState } from "react";
import { X, Users, Building2, MessageSquare, Mail } from "lucide-react";
import {
  useUserConnections,
  type ConnectionUser,
} from "@/features/messaging/hooks/useUserConnections";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { UserSearchField } from "@/features/user-search/UserSearchField";

const SOURCE_ICON: Record<ConnectionUser["source"], typeof Users> = {
  conversation: MessageSquare,
  organization: Building2,
  invitation: Mail,
};

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

interface TaskAssigneePickerProps {
  assigneeId: string | null;
  onChange: (userId: string | null) => void;
  /** Controlled size. "sm" for inline chip, "md" for form row. */
  size?: "sm" | "md";
  className?: string;
}

export default function TaskAssigneePicker({
  assigneeId,
  onChange,
  size = "md",
  className,
}: TaskAssigneePickerProps) {
  const { connections, isLoading } = useUserConnections();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const current = useMemo(
    () => connections.find((c) => c.user_id === assigneeId) ?? null,
    [connections, assigneeId],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return connections;
    const q = search.toLowerCase();
    return connections.filter(
      (c) =>
        c.display_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [connections, search]);

  const select = (userId: string | null) => {
    onChange(userId);
    setOpen(false);
    setSearch("");
  };

  const h = size === "sm" ? "h-6" : "h-8";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full inline-flex items-center gap-2 px-2 rounded-md border border-border bg-card hover:border-foreground/30 hover:bg-accent/30 transition-colors text-left",
            h,
            className,
          )}
        >
          {current ? (
            <>
              <Avatar className={cn(size === "sm" ? "w-4 h-4" : "w-5 h-5")}>
                <AvatarImage src={current.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                  {getInitials(current.display_name, current.email)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate text-xs font-medium text-foreground">
                {current.display_name || current.email}
              </span>
              <span
                className="text-muted-foreground hover:text-foreground shrink-0"
                role="button"
                aria-label="Unassign"
                onClick={(e) => {
                  e.stopPropagation();
                  select(null);
                }}
              >
                <X className="w-3 h-3" />
              </span>
            </>
          ) : assigneeId ? (
            <span className="flex-1 text-xs font-mono truncate text-muted-foreground">
              {assigneeId}
            </span>
          ) : (
            <>
              <div
                className={cn(
                  "rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center shrink-0",
                  size === "sm" ? "w-4 h-4" : "w-5 h-5",
                )}
              >
                <Users
                  className={cn(
                    "text-muted-foreground",
                    size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3",
                  )}
                />
              </div>
              <span className="flex-1 text-xs text-muted-foreground">
                Unassigned
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border/50 p-2">
          <UserSearchField
            value={search}
            onValueChange={setSearch}
            onUserSelect={(user) => select(user.id)}
            candidates={connections.map((user) => ({
              id: user.user_id,
              email: user.email,
              displayName: user.display_name,
              avatarUrl: user.avatar_url,
              phone: null,
              adminLevel: null,
              organizations: [],
              source: user.source,
              createdAt: null,
              lastSignInAt: null,
            }))}
            title="Choose task assignee"
            placeholder="Search people..."
            inputClassName="h-8 text-xs"
            ariaLabel="Open advanced assignee search"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {current && (
            <button
              type="button"
              onClick={() => select(null)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 transition-colors"
            >
              <div className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center shrink-0">
                <X className="w-2.5 h-2.5" />
              </div>
              <span className="flex-1 text-left italic">Unassign</span>
            </button>
          )}

          {isLoading ? (
            <p className="text-center text-xs text-muted-foreground py-4">
              Loading people...
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">
              {search ? "No matches" : "No connections yet"}
            </p>
          ) : (
            filtered.map((user) => {
              const SourceIcon = SOURCE_ICON[user.source];
              const isSelected = user.user_id === assigneeId;
              return (
                <button
                  key={user.user_id}
                  type="button"
                  onClick={() => select(user.user_id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                    isSelected
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-accent/40 text-foreground/90",
                  )}
                >
                  <Avatar className="w-6 h-6 shrink-0">
                    <AvatarImage src={user.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {getInitials(user.display_name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-medium truncate">
                      {user.display_name || user.email || "Unknown"}
                    </p>
                    {user.display_name && user.email && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {user.email}
                      </p>
                    )}
                  </div>
                  <SourceIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
