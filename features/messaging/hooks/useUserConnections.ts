"use client";

/**
 * useUserConnections Hook
 *
 * Aggregates "connections" from multiple sources:
 * 1. Past conversations - Users you've messaged before
 * 2. Organization members - Members of your organizations
 * 3. Invitation-related users - People in pending invitations (sent to your orgs)
 *
 * Returns deduplicated, alphabetically sorted list of connected users.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useConversations } from "@/hooks/useSupabaseMessaging";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { UserBasicInfo } from "../types";
import type { DbRpcRow } from "@/types/supabase-rpc";

export interface ConnectionUser extends UserBasicInfo {
  source: "conversation" | "organization" | "invitation";
  sourceDetails?: string; // e.g., org name for organization connections
}

interface OrgMemberRow {
  id: string;
  invited_by: string;
  joined_at: string;
  organization_id: string;
  role: string;
  user_avatar_url: string;
  user_display_name: string;
  user_email: string;
  user_id: string;
}
type _CheckOrgMemberRow =
  OrgMemberRow extends DbRpcRow<"get_organization_members_with_users">
    ? true
    : false;
declare const _orgMemberRow: _CheckOrgMemberRow;
true satisfies typeof _orgMemberRow;

interface LookupUserByEmailRow {
  user_id: string;
  user_email: string;
}
type _CheckLookupRow =
  LookupUserByEmailRow extends DbRpcRow<"lookup_user_by_email"> ? true : false;
declare const _lookupRow: _CheckLookupRow;
true satisfies typeof _lookupRow;

type _CheckDmUserInfo =
  UserBasicInfo extends DbRpcRow<"get_dm_user_info"> ? true : false;
declare const _dmUserInfo: _CheckDmUserInfo;
true satisfies typeof _dmUserInfo;

interface UseUserConnectionsReturn {
  connections: ConnectionUser[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUserConnections(): UseUserConnectionsReturn {
  const [connections, setConnections] = useState<ConnectionUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const user = useAppSelector(selectUser);
  const currentUserId = user?.id;

  // Get conversations for past message contacts
  const { conversations, isLoading: convoLoading } = useConversations(
    currentUserId || null,
  );

  // Get user's organizations
  const { organizations, loading: orgsLoading } = useUserOrganizations();

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Extract unique users from conversations
  const conversationUsers = useMemo((): ConnectionUser[] => {
    if (!currentUserId || !conversations) return [];

    const usersMap = new Map<string, ConnectionUser>();

    conversations.forEach((conv) => {
      conv.participants?.forEach((participant) => {
        if (participant.user_id !== currentUserId && participant.user) {
          // Don't overwrite if already exists (dedup)
          if (!usersMap.has(participant.user_id)) {
            usersMap.set(participant.user_id, {
              user_id: participant.user_id,
              email: participant.user.email,
              display_name: participant.user.display_name,
              avatar_url: participant.user.avatar_url,
              source: "conversation",
            });
          }
        }
      });
    });

    return Array.from(usersMap.values());
  }, [conversations, currentUserId]);

  // Fetch organization members and invitations
  const fetchOrgConnections = useCallback(async (): Promise<
    ConnectionUser[]
  > => {
    if (!currentUserId || !organizations || organizations.length === 0) {
      return [];
    }

    const usersMap = new Map<string, ConnectionUser>();

    // Fetch members for each organization
    for (const org of organizations) {
      try {
        // Fetch members via RPC
        const { data: members, error: membersError } = await supabase.rpc(
          "get_organization_members_with_users",
          { p_org_id: org.id },
        );

        if (membersError) {
          console.error(
            `Error fetching members for org ${org.id}:`,
            membersError,
          );
          continue;
        }

        // Add members (excluding current user)
        ((members as unknown as OrgMemberRow[]) || []).forEach((member) => {
          if (member.user_id !== currentUserId) {
            const existingUser = usersMap.get(member.user_id);
            // Only add if not already in map, or update sourceDetails
            if (!existingUser) {
              usersMap.set(member.user_id, {
                user_id: member.user_id,
                email: member.user_email || null,
                display_name: member.user_display_name || null,
                avatar_url: member.user_avatar_url || null,
                source: "organization",
                sourceDetails: org.name,
              });
            }
          }
        });

        // Fetch pending invitations for this org
        // Note: Invitations are by email, we'll try to match to existing users
        const { data: invitations, error: invError } = await graveyardDb(
          supabase,
        )
          .from("organization_invitations")
          .select("email, invited_by")
          .eq("organization_id", org.id)
          .gt("expires_at", new Date().toISOString());

        if (invError) {
          console.error(
            `Error fetching invitations for org ${org.id}:`,
            invError,
          );
          continue;
        }

        // For invitations, we can try to look up if these emails belong to existing users
        for (const invite of invitations || []) {
          // Try to find user by email using lookup
          const { data: lookupResult } = await supabase.rpc(
            "lookup_user_by_email",
            { lookup_email: invite.email.toLowerCase() },
          );

          if (lookupResult && lookupResult.length > 0) {
            const lookupRows =
              lookupResult as unknown as LookupUserByEmailRow[];
            const invitedUserId = lookupRows[0].user_id;
            if (
              invitedUserId !== currentUserId &&
              !usersMap.has(invitedUserId)
            ) {
              // Get full user info
              const { data: userInfo } = await supabase.rpc(
                "get_dm_user_info",
                {
                  p_user_id: invitedUserId,
                },
              );

              const dmRows = userInfo as unknown as UserBasicInfo[];
              if (dmRows && dmRows[0]) {
                usersMap.set(invitedUserId, {
                  user_id: invitedUserId,
                  email: dmRows[0].email,
                  display_name: dmRows[0].display_name,
                  avatar_url: dmRows[0].avatar_url,
                  source: "invitation",
                  sourceDetails: `Invited to ${org.name}`,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error processing org ${org.id}:`, err);
      }
    }

    return Array.from(usersMap.values());
  }, [currentUserId, organizations, supabase]);

  // Main aggregation effect
  useEffect(() => {
    let mounted = true;

    const aggregateConnections = async () => {
      if (!currentUserId) {
        setConnections([]);
        setIsLoading(false);
        return;
      }

      // Wait for conversations and orgs to load
      if (convoLoading || orgsLoading) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get org connections
        const orgConnections = await fetchOrgConnections();

        if (!mounted) return;

        // Merge all connections with deduplication
        // Priority: conversation > organization > invitation
        const mergedMap = new Map<string, ConnectionUser>();

        // Add conversation users first (highest priority)
        conversationUsers.forEach((user) => {
          mergedMap.set(user.user_id, user);
        });

        // Add org connections (won't overwrite conversation users)
        orgConnections.forEach((user) => {
          if (!mergedMap.has(user.user_id)) {
            mergedMap.set(user.user_id, user);
          }
        });

        // Sort alphabetically by display_name, then by email
        const sortedConnections = Array.from(mergedMap.values()).sort(
          (a, b) => {
            const nameA = (a.display_name || a.email || "").toLowerCase();
            const nameB = (b.display_name || b.email || "").toLowerCase();
            return nameA.localeCompare(nameB);
          },
        );

        if (!mounted) return;

        setConnections(sortedConnections);
      } catch (err) {
        if (!mounted) return;
        console.error("Error aggregating connections:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load connections",
        );
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    aggregateConnections();

    return () => {
      mounted = false;
    };
  }, [
    currentUserId,
    conversationUsers,
    fetchOrgConnections,
    convoLoading,
    orgsLoading,
  ]);

  // Refresh function
  const refresh = useCallback(async () => {
    setIsLoading(true);
    // Re-trigger the effect by forcing state update
    setConnections([]);
  }, []);

  return {
    connections,
    isLoading,
    error,
    refresh,
  };
}

export default useUserConnections;
