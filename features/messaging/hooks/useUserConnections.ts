"use client";

/**
 * useUserConnections Hook
 *
 * Aggregates "connections" from multiple sources:
 * 1. Past conversations - Users you've messaged before (OPT IN, see below)
 * 2. Organization members - Members of your organizations
 * 3. Invitation-related users - People in pending invitations (sent to your orgs)
 *
 * Returns deduplicated, alphabetically sorted list of connected users.
 *
 * 🚨 A PEOPLE LIST IS SCOPED TO THE ORGANIZATION THE SURFACE IS ABOUT (FIX-7B, 2026-09-20).
 *
 * The seventh-pass verdict opened a share dialog in a brand-new organization with exactly two
 * people in it and was offered "people from all over the database - including four of your own
 * personal email addresses and named contacts belonging to other companies". Both halves of
 * that were this hook:
 *
 *   · it read EVERY organization the caller belongs to, whatever organization the thing being
 *     shared, assigned or invited into actually lives in, and
 *   · it folded in every participant of every conversation the caller has ever had, which is
 *     bounded by NO organization at all.
 *
 * So: a caller that names an `organizationId` gets THAT organization's members and nobody else,
 * and past conversations are OPT IN (`includeConversations`) rather than always on. The one
 * surface that legitimately wants people-you-have-talked-to is the one about conversations.
 * Every other caller - share, assign, invite, approve - names its organization.
 */

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useConversations } from "@ai-matrx/messaging/react";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { invitationsService } from "@/features/organizations/service/invitationsService";
import { canManageInvitations } from "@/features/organizations/types";
import type { OrganizationWithRole } from "@/features/organizations/types";
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

interface UseUserConnectionsReturn {
  connections: ConnectionUser[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface UseUserConnectionsOptions {
  /**
   * THE ORGANIZATION THIS SURFACE IS ABOUT. Naming it makes the list exactly that
   * organization's members — the people the thing being shared, assigned or invited into is
   * actually with. Omitting it falls back to every organization the caller belongs to, which
   * is correct only for a surface that belongs to no single organization.
   */
  organizationId?: string;
  /**
   * Fold in everyone the caller has ever been in a conversation with. OFF by default: a
   * conversation is bounded by no organization, so this source puts people from anywhere into
   * a list that is supposed to be about one organization. Only a surface ABOUT conversations
   * turns it on.
   */
  includeConversations?: boolean;
  /**
   * Include existing users found through pending invitations for this exact
   * organization. Omit this for ordinary contact pickers. The hook also checks
   * the caller's organization role and excludes personal organizations before
   * making the manager-only `inv_list` request.
   */
  invitationOrganizationId?: string;
}

export function useUserConnections(
  options: UseUserConnectionsOptions = {},
): UseUserConnectionsReturn {
  const { organizationId, includeConversations = false, invitationOrganizationId } = options;

  const user = useAppSelector(selectUser);
  const currentUserId = user?.id;

  // The inbox the ONE messaging engine already holds — no second read.
  const { conversations, isInitialLoading: convoLoading } = useConversations();

  // Get user's organizations
  const { organizations, loading: orgsLoading } = useUserOrganizations();

  const [supabase] = useState(createClient);
  const [nonce, setNonce] = useState(0);

  /*
   * 🚨 THE MEMBER FETCH IS KEYED ON WHAT IT READS, AND NOTHING ELSE (MSG-STORM, 2026-09-23).
   *
   * It used to re-run whenever the conversation list changed identity — which the messaging
   * store does on every emit (open, mark-read, a new message). On /messages as an account in 43
   * organizations, opening ONE conversation fired 260 member requests in overlapping sweeps and
   * starved the page. No organization's members depend on the inbox, so the fetch is keyed on
   * a string that fully describes its work (who, which organizations, invitation scope, refresh
   * count) and conversation people are merged in at render instead.
   */
  const inScope = organizationId
    ? organizations.filter((org) => org.id === organizationId)
    : organizations;
  const scope: ScopeOrg[] = inScope.map((org) => ({
    id: org.id,
    name: org.name,
    role: org.role,
    isPersonal: org.isPersonal,
  }));
  const fetchKey =
    currentUserId && !orgsLoading
      ? JSON.stringify([currentUserId, invitationOrganizationId ?? null, nonce, scope])
      : null;

  const [resolved, setResolved] = useState<{
    key: string;
    orgConnections: ConnectionUser[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!fetchKey) return;
    let active = true;
    const [userId, invitationOrgId, , orgs] = JSON.parse(fetchKey) as [
      string,
      string | null,
      number,
      ScopeOrg[],
    ];
    void (async () => {
      try {
        const orgConnections = await fetchOrgConnections(supabase, {
          currentUserId: userId,
          organizations: orgs,
          invitationOrganizationId: invitationOrgId,
          // A superseded sweep stops at the next organization instead of finishing the lot.
          isActive: () => active,
        });
        if (active) setResolved({ key: fetchKey, orgConnections, error: null });
      } catch (err) {
        if (!active) return;
        console.error("Error aggregating connections:", err);
        setResolved({
          key: fetchKey,
          orgConnections: [],
          error: err instanceof Error ? err.message : "Failed to load connections",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchKey, supabase]);

  const current = fetchKey !== null && resolved?.key === fetchKey ? resolved : null;

  // Wait for orgs to load — and for conversations only when this surface uses them, so a
  // share dialog never sits on the messaging engine's spinner for a list it will not show.
  const isLoading = currentUserId
    ? (includeConversations && convoLoading) || orgsLoading || current === null
    : false;

  let connections: ConnectionUser[] = [];
  if (currentUserId && !isLoading && current) {
    // Priority: conversation > organization > invitation
    const mergedMap = new Map<string, ConnectionUser>();
    // OFF unless the surface asked for it — see the note at the top of this file.
    if (includeConversations) {
      for (const user of conversationConnections(conversations, currentUserId)) {
        mergedMap.set(user.user_id, user);
      }
    }
    for (const user of current.orgConnections) {
      if (!mergedMap.has(user.user_id)) mergedMap.set(user.user_id, user);
    }
    // Sort alphabetically by display_name, then by email
    connections = Array.from(mergedMap.values()).sort((a, b) => {
      const nameA = (a.display_name || a.email || "").toLowerCase();
      const nameB = (b.display_name || b.email || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  // Re-read every organization in scope.
  const refresh = async () => {
    setNonce((value) => value + 1);
  };

  return {
    connections,
    isLoading,
    error: current?.error ?? null,
    refresh,
  };
}

interface ScopeOrg {
  id: string;
  name: string;
  role: OrganizationWithRole["role"];
  isPersonal: boolean;
}

// Extract unique users from conversations
function conversationConnections(
  conversations: ReturnType<typeof useConversations>["conversations"],
  currentUserId: string,
): ConnectionUser[] {
  const usersMap = new Map<string, ConnectionUser>();
  conversations.forEach((conv) => {
    conv.participants.forEach((participant) => {
      if (participant.userId === currentUserId) return;
      // Don't overwrite if already present (dedup).
      if (usersMap.has(participant.userId)) return;
      usersMap.set(participant.userId, {
        user_id: participant.userId,
        email: participant.email,
        display_name: participant.displayName,
        avatar_url: participant.avatarUrl,
        source: "conversation",
      });
    });
  });
  return Array.from(usersMap.values());
}

// Fetch organization members and invitations
async function fetchOrgConnections(
  supabase: ReturnType<typeof createClient>,
  {
    currentUserId,
    organizations,
    invitationOrganizationId,
    isActive,
  }: {
    currentUserId: string;
    organizations: ScopeOrg[];
    invitationOrganizationId: string | null;
    isActive: () => boolean;
  },
): Promise<ConnectionUser[]> {
  const usersMap = new Map<string, ConnectionUser>();

  // `organizations` is already narrowed to THE ONE ORGANIZATION when the surface named one.
  // It is the caller's own membership list, so narrowing can only ever REMOVE other
  // organizations' people — it can never reach an organization the caller is not in.
  for (const org of organizations) {
    if (!isActive()) break;
    try {
      // Fetch members via RPC
      const { data: members, error: membersError } = await supabase.rpc(
        "get_organization_members_with_users",
        { p_org_id: org.id },
      );

      if (membersError) {
        console.error(`Error fetching members for org ${org.id}:`, membersError);
        continue;
      }

      // Add members (excluding current user)
      ((members as unknown as OrgMemberRow[]) || []).forEach((member) => {
        if (member.user_id !== currentUserId && !usersMap.has(member.user_id)) {
          usersMap.set(member.user_id, {
            user_id: member.user_id,
            email: member.user_email || null,
            display_name: member.user_display_name || null,
            avatar_url: member.user_avatar_url || null,
            source: "organization",
            sourceDetails: org.name,
          });
        }
      });

      if (
        org.id !== invitationOrganizationId ||
        !canManageInvitations(org.role, org.isPersonal)
      ) {
        continue;
      }

      // Pending org invitations — via inv_list RPC (no direct grant on iam.invitations).
      const invResult = await invitationsService.listForTarget("organization", org.id);
      if (!invResult.ok) {
        console.error(
          `Error fetching invitations for org ${org.id}:`,
          invResult.error.message,
        );
        continue;
      }
      const nowIso = new Date().toISOString();
      const pendingInvites = invResult.data.invitations.filter(
        (inv) => inv.status === "pending" && inv.expiresAt > nowIso && inv.email,
      );

      // For invitations, we can try to look up if these emails belong to existing users
      for (const invite of pendingInvites) {
        if (!isActive()) break;
        if (!invite.email) continue;

        // Try to find user by email using lookup
        const { data: lookupResult } = await supabase.rpc("lookup_user_by_email", {
          lookup_email: invite.email.toLowerCase(),
        });

        if (lookupResult && lookupResult.length > 0) {
          const lookupRows = lookupResult as unknown as LookupUserByEmailRow[];
          const invitedUserId = lookupRows[0].user_id;
          if (invitedUserId !== currentUserId && !usersMap.has(invitedUserId)) {
            usersMap.set(invitedUserId, {
              user_id: invitedUserId,
              email: invite.email,
              display_name: invite.email.split("@", 1)[0],
              avatar_url: null,
              source: "invitation",
              sourceDetails: `Invited to ${org.name}`,
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error processing org ${org.id}:`, err);
    }
  }

  return Array.from(usersMap.values());
}

export default useUserConnections;
