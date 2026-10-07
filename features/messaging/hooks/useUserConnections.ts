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

import {
  forgetOrganizationMemberRows,
  readOrganizationMemberRows,
  type OrganizationMemberRow,
} from "@/features/organizations/service/orgMemberRows";
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
import { formatDurationMs } from "@ai-matrx/kit/format";

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

/**
 * 🚨 A PEOPLE LIST ANSWERS WITHIN SECONDS (PB-07, 2026-10-01).
 *
 * The Share dialog sat on "Loading contacts…" for minutes: it named no organization, so this hook
 * read the roster of EVERY organization the viewer belongs to — one request after another, about
 * 120 ms each, sixty organizations deep for a test admin — and a roster request that never
 * answered held the list forever. Now the rosters are read a few at a time, the whole read has a
 * deadline, a roster that misses it is NAMED as unread (never silently dropped), and the hook
 * itself stops loading at its own deadline and says so, with Retry.
 */
export const ROSTER_READ_CONCURRENCY = 6;
/** The whole roster sweep's budget; a roster still unanswered is reported as unread. */
export const ROSTER_SWEEP_DEADLINE_MS = 5_000;
/** The hook's own ceiling — covers the organizations read and anything else upstream. */
export const CONNECTIONS_LOAD_DEADLINE_MS = 8_000;
const DEADLINE_MISSED = Symbol("deadline-missed");

/** One source of the roster that could not be read while others could. */
export interface ConnectionReadFailure {
  /** The organization (or source) in the person's words. */
  source: string;
  error: string;
}

interface UseUserConnectionsReturn {
  connections: ConnectionUser[];
  isLoading: boolean;
  /** Nothing could be read at all — the list is not an answer. */
  error: string | null;
  /**
   * Some sources read and some did not: `connections` holds what was read and
   * this names what is missing. Surfaces show the rows plus a StaleDataNotice
   * ("Couldn't read the people in Acme") — never a silently short list.
   */
  partialFailures: ConnectionReadFailure[];
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
  const {
    organizations,
    loading: orgsLoading,
    error: orgsError,
    refresh: refreshOrganizations,
  } = useUserOrganizations();

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
  }));
  const fetchKey =
    currentUserId && !orgsLoading
      ? JSON.stringify([currentUserId, invitationOrganizationId ?? null, nonce, scope])
      : null;

  const [resolved, setResolved] = useState<{
    key: string;
    orgConnections: ConnectionUser[];
    error: string | null;
    partialFailures: ConnectionReadFailure[];
  } | null>(null);

  useEffect(() => {
    if (!fetchKey) return;
    let active = true;
    const [userId, invitationOrgId, refreshCount, orgs] = JSON.parse(fetchKey) as [
      string,
      string | null,
      number,
      ScopeOrg[],
    ];
    void (async () => {
      try {
        const { users: orgConnections, failures } = await fetchOrgConnections(supabase, {
          currentUserId: userId,
          organizations: orgs,
          invitationOrganizationId: invitationOrgId,
          // A superseded sweep stops at the next organization instead of finishing the lot.
          isActive: () => active,
          // A refresh re-reads; a first load reuses a roster another picker just read.
          fresh: refreshCount > 0,
        });
        if (active) setResolved({ key: fetchKey, orgConnections, error: null, partialFailures: failures });
      } catch (err) {
        if (!active) return;
        console.error("Error aggregating connections:", err);
        setResolved({
          key: fetchKey,
          orgConnections: [],
          error: err instanceof Error ? err.message : "Failed to load connections",
          partialFailures: [],
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
  const waiting = currentUserId
    ? (includeConversations && convoLoading) || orgsLoading || current === null
    : false;

  // THE HOOK'S OWN DEADLINE: whatever upstream stalls (the organizations read, auth that never
  // hydrates, a request that never answers), the list stops loading and says so.
  const attemptKey = `${currentUserId ?? ""}:${organizationId ?? ""}:${nonce}`;
  const [stalledKey, setStalledKey] = useState<string | null>(null);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setStalledKey(attemptKey), CONNECTIONS_LOAD_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [waiting, attemptKey]);
  const stalled = waiting && stalledKey === attemptKey;
  const isLoading = waiting && !stalled;

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

  // Re-read every organization in scope (and the organization list, if that is what failed).
  const refresh = async () => {
    if (orgsError || stalled) refreshOrganizations();
    setNonce((value) => value + 1);
  };
  const partialFailures = current?.partialFailures ?? [];

  return {
    connections,
    isLoading,
    // A roster failure is a full read failure only when no source supplied a row. In particular,
    // conversation rows are merged above and must turn a failed roster read into a visible
    // partial-read notice rather than silently hiding it.
    error: stalled
      ? "Contacts did not load in time"
      : !isLoading && orgsError && connections.length === 0
        ? `Couldn't load your organizations: ${orgsError}`
        : connections.length === 0 && partialFailures.length > 0
          ? `Couldn't load ${describeConnectionFailures(partialFailures)}`
          : current?.error ?? null,
    partialFailures,
    refresh,
  };
}

interface ScopeOrg {
  id: string;
  name: string;
  role: OrganizationWithRole["role"];
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
    fresh = false,
    concurrency = ROSTER_READ_CONCURRENCY,
    deadlineMs = ROSTER_SWEEP_DEADLINE_MS,
  }: {
    currentUserId: string;
    organizations: ScopeOrg[];
    invitationOrganizationId: string | null;
    isActive: () => boolean;
    /** An explicit refresh re-reads rather than reusing a settled roster. */
    fresh?: boolean;
    concurrency?: number;
    deadlineMs?: number;
  },
): Promise<{ users: ConnectionUser[]; failures: ConnectionReadFailure[] }> {
  const usersMap = new Map<string, ConnectionUser>();
  /** Organizations whose roster could not be read. */
  const failures: Array<{ orgName: string; error: unknown }> = [];

  // `organizations` is already narrowed to THE ONE ORGANIZATION when the surface named one.
  // It is the caller's own membership list, so narrowing can only ever REMOVE other
  // organizations' people — it can never reach an organization the caller is not in.
  //
  // Read a few rosters at a time against ONE deadline for the whole sweep (see
  // ROSTER_SWEEP_DEADLINE_MS). Rows are merged in membership order afterwards, so the result is
  // the same as the old one-after-another read, minus the wait.
  let expired = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof DEADLINE_MISSED>((resolve) => {
    deadlineTimer = setTimeout(() => {
      expired = true;
      resolve(DEADLINE_MISSED);
    }, deadlineMs);
  });
  const missedDeadline = () => new Error(`did not answer within ${formatDurationMs(deadlineMs, { style: "long", parts: 2 })}`);
  const rosters: Array<OrganizationMemberRow[] | null> = new Array(organizations.length).fill(null);
  // Indexed so failures are reported in membership order, whichever answered first.
  const rosterFailures: unknown[] = new Array(organizations.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    while (next < organizations.length && isActive()) {
      const index = next++;
      const org = organizations[index];
      if (expired) {
        // Never started: the sweep is out of time, so it is named unread rather than asked.
        rosterFailures[index] = missedDeadline();
        continue;
      }
      try {
        // THE ONE ROSTER READ — joined while in flight, reused for 30 s, so
        // every picker on a page shares one request per organization.
        const answer = await Promise.race([
          readOrganizationMemberRows(org.id, { client: supabase, fresh }),
          deadline,
        ]);
        if (answer === DEADLINE_MISSED) {
          // A read still in flight is joined by the next caller; drop it so Retry asks again.
          forgetOrganizationMemberRows(org.id);
          rosterFailures[index] = missedDeadline();
          continue;
        }
        rosters[index] = answer;
      } catch (membersError) {
        console.error(`Error fetching members for org ${org.id}:`, membersError);
        rosterFailures[index] = membersError;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, organizations.length) }, () => worker()),
  );
  clearTimeout(deadlineTimer);

  for (const [index, org] of organizations.entries()) {
    if (!isActive()) break;
    if (rosterFailures[index] !== undefined) {
      failures.push({ orgName: org.name, error: rosterFailures[index] });
      continue;
    }
    const members = rosters[index];
    if (!members) continue;
    try {
      // Add members (excluding current user)
      (members as unknown as OrgMemberRow[]).forEach((member) => {
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
        !canManageInvitations(org.role)
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
        failures.push({ orgName: `${org.name} (pending invitations)`, error: new Error(invResult.error.message) });
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
      failures.push({ orgName: org.name, error: err });
    }
  }

  // Keep roster failures separate from roster rows. Conversation participants merge after this
  // function returns, so deciding that an empty roster is a total failure here would discard
  // the fact that the caller still has usable connection rows from conversations.
  return {
    users: Array.from(usersMap.values()),
    failures: failures.map((f) => ({
      source: f.orgName,
      error: f.error instanceof Error ? f.error.message : String(f.error),
    })),
  };
}

/** "Acme, Beta Co" — the sources a partial read could not reach, for a notice's `what`. */
export function describeConnectionFailures(failures: ConnectionReadFailure[]): string {
  return `the people in ${failures.map((f) => f.source).join(", ")}`;
}

export default useUserConnections;
