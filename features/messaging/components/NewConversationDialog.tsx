"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Loader2,
  User,
  Mail,
  MessageCircle,
  Building2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useDebounce } from "@/features/tasks/hooks/useDebounce";
import {
  useUserConnections,
  type ConnectionUser,
} from "../hooks/useUserConnections";
import type { UserBasicInfo } from "../types";
import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";
import type { DbRpcRow } from "@/types/supabase-rpc";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
}

interface SearchResult extends UserBasicInfo {
  match_score?: number;
}
type _CheckSearchResult =
  DbRpcRow<"search_users_intelligent"> extends SearchResult ? true : false;
declare const _searchResult: _CheckSearchResult;
true satisfies typeof _searchResult;

interface LookupUserByEmailRow {
  user_id: string;
  user_email: string;
}
type _CheckLookupUserByEmailRow =
  LookupUserByEmailRow extends DbRpcRow<"lookup_user_by_email"> ? true : false;
declare const _lookupUserByEmailRow: _CheckLookupUserByEmailRow;
true satisfies typeof _lookupUserByEmailRow;

export function NewConversationDialog({
  open,
  onOpenChange,
  onConversationCreated,
}: NewConversationDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const user = useAppSelector(selectUser);
  const currentUserId = user?.id;

  const { connections, isLoading: connectionsLoading } = useUserConnections();

  // Use ref to avoid recreating supabase client on every render
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  /**
   * Create or find existing conversation
   * Realtime subscription in MessagingInitializer handles Redux updates
   */
  const createConversation = useCallback(
    async (participantId: string): Promise<string> => {
      if (!currentUserId) throw new Error("User not authenticated");

      // First check if conversation already exists
      const { data: existingConv } = await supabase.rpc(
        "find_dm_direct_conversation",
        {
          p_user1_id: currentUserId,
          p_user2_id: participantId,
        },
      );

      if (existingConv) {
        return existingConv;
      }

      // Create new conversation
      const organizationId = await resolvePersonalOrgId();
      const { data: newConv, error: createError } = await supabase
        .schema("communication").from("dm_conversations")
        .insert({
          type: "direct",
          created_by: currentUserId,
          organization_id: organizationId,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Add both participants - this triggers realtime subscription in MessagingInitializer
      const { error: participantError } = await supabase
        .schema("communication").from("dm_conversation_participants")
        .insert([
          {
            conversation_id: newConv.id,
            user_id: currentUserId,
            role: "owner",
            organization_id: organizationId,
          },
          {
            conversation_id: newConv.id,
            user_id: participantId,
            role: "member",
            organization_id: organizationId,
          },
        ]);

      if (participantError) throw participantError;

      return newConv.id;
    },
    [currentUserId, supabase],
  );

  // Debounce search query (300ms)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Perform search when debounced query changes
  useEffect(() => {
    const performSearch = async () => {
      const query = debouncedSearchQuery.trim();

      // Clear results if query is too short
      if (query.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      if (!currentUserId) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setError(null);

      try {
        // Use the intelligent search function
        const { data, error: searchError } = await supabase.rpc(
          "search_users_intelligent",
          {
            search_term: query,
            current_user_id: currentUserId,
            max_results: 10,
          },
        );

        if (searchError) {
          console.error("Search error:", searchError);
          // Fallback to basic email lookup
          const { data: fallbackData } = await supabase.rpc(
            "lookup_user_by_email",
            { lookup_email: query.toLowerCase() },
          );

          if (fallbackData && fallbackData.length > 0) {
            const fallbackRows =
              fallbackData as unknown as LookupUserByEmailRow[];
            const results: SearchResult[] = [];
            for (const row of fallbackRows) {
              if (row.user_id !== currentUserId) {
                const { data: userInfo } = await supabase.rpc(
                  "get_dm_user_info",
                  { p_user_id: row.user_id },
                );
                const userRows = userInfo as unknown as UserBasicInfo[];
                if (userRows && userRows[0]) {
                  results.push(userRows[0]);
                }
              }
            }
            setSearchResults(results);
          } else {
            setSearchResults([]);
          }
        } else {
          // Transform search results
          const searchRows = (data as unknown as SearchResult[]) || [];
          const results: SearchResult[] = searchRows.map((row) => ({
            user_id: row.user_id,
            email: row.email,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            match_score: row.match_score,
          }));
          setSearchResults(results);
        }
      } catch (err) {
        console.error("Search failed:", err);
        setError("Search failed. Please try again.");
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchQuery, currentUserId, supabase]);

  // Handle user selection (start conversation)
  const handleSelectUser = useCallback(
    async (selectedUser: UserBasicInfo | ConnectionUser) => {
      if (!currentUserId || isCreating) return;

      setIsCreating(true);
      setCreatingUserId(selectedUser.user_id);
      setError(null);

      try {
        const conversationId = await createConversation(selectedUser.user_id);
        onConversationCreated(conversationId);
        onOpenChange(false);

        // Reset state
        setSearchQuery("");
        setSearchResults([]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create conversation",
        );
      } finally {
        setIsCreating(false);
        setCreatingUserId(null);
      }
    },
    [
      currentUserId,
      createConversation,
      onConversationCreated,
      onOpenChange,
      isCreating,
    ],
  );

  // Get initials from name
  const getInitials = (user: UserBasicInfo | ConnectionUser): string => {
    const name = user.display_name || user.email;
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get source icon for connection
  const getSourceIcon = (source: ConnectionUser["source"]) => {
    switch (source) {
      case "conversation":
        return <MessageCircle className="h-3 w-3" />;
      case "organization":
        return <Building2 className="h-3 w-3" />;
      case "invitation":
        return <UserPlus className="h-3 w-3" />;
      default:
        return null;
    }
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
      setError(null);
    }
  }, [open]);

  const isActiveSearch = searchQuery.trim().length >= 2;
  const showSearchResults =
    isActiveSearch &&
    (isSearching ||
      searchResults.length > 0 ||
      debouncedSearchQuery.length >= 2);
  const showNoResults =
    isActiveSearch &&
    !isSearching &&
    searchResults.length === 0 &&
    debouncedSearchQuery === searchQuery;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Select a contact or search for a user to start messaging.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 px-4 pb-4">
          {/* Search Input - Always visible */}
          <div className="relative flex-shrink-0 mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-base" // text-base for iOS zoom prevention
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="text-sm text-destructive mb-3 flex-shrink-0">
              {error}
            </div>
          )}

          {/* Main Content Area */}
          <ScrollArea className="flex-1 -mx-4 px-4">
            {/* Search Results Section */}
            {showSearchResults && (
              <div className="mb-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Search Results
                </h3>
                {isSearching ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="rounded-lg border divide-y">
                    {searchResults.map((result) => (
                      <UserListItem
                        key={result.user_id}
                        user={result}
                        isCreating={creatingUserId === result.user_id}
                        disabled={isCreating}
                        onSelect={handleSelectUser}
                        getInitials={getInitials}
                      />
                    ))}
                  </div>
                ) : showNoResults ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <User className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No users found matching "{searchQuery}"
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Connections Section */}
            {!showSearchResults && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Your Connections
                </h3>
                {connectionsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : connections.length > 0 ? (
                  <div className="rounded-lg border divide-y">
                    {connections.map((connection) => (
                      <UserListItem
                        key={connection.user_id}
                        user={connection}
                        isCreating={creatingUserId === connection.user_id}
                        disabled={isCreating}
                        onSelect={handleSelectUser}
                        getInitials={getInitials}
                        sourceIcon={getSourceIcon(connection.source)}
                        sourceDetails={connection.sourceDetails}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <User className="h-12 w-12 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">
                      No connections yet
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Search for users above to start a conversation
                    </p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Extracted user list item component for reusability
interface UserListItemProps {
  user: UserBasicInfo | ConnectionUser;
  isCreating: boolean;
  disabled: boolean;
  onSelect: (user: UserBasicInfo | ConnectionUser) => void;
  getInitials: (user: UserBasicInfo | ConnectionUser) => string;
  sourceIcon?: React.ReactNode;
  sourceDetails?: string;
}

function UserListItem({
  user,
  isCreating,
  disabled,
  onSelect,
  getInitials,
  sourceIcon,
  sourceDetails,
}: UserListItemProps) {
  return (
    <button
      onClick={() => onSelect(user)}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 p-3 text-left transition-colors",
        "hover:bg-muted/50 active:bg-muted",
        "min-h-[56px]", // Minimum tap target size
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage
          src={user.avatar_url || undefined}
          alt={user.display_name || user.email || ""}
        />
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {getInitials(user)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium leading-tight truncate">
            {user.display_name || "Unknown User"}
          </p>
          {sourceIcon && (
            <span className="text-muted-foreground flex-shrink-0">
              {sourceIcon}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
          <Mail className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{user.email || "No email"}</span>
        </div>
        {sourceDetails && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
            {sourceDetails}
          </p>
        )}
      </div>

      {isCreating && (
        <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
      )}
    </button>
  );
}

export default NewConversationDialog;
