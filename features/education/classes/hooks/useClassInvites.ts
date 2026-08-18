// features/education/classes/hooks/useClassInvites.ts
//
// The teacher's invite controls — the WP6 "get students in under a minute"
// affordance. Three lanes, all reusing canon:
//   1. Join code — edu_class_join_code (get/rotate/disable) via ../service.
//   2. Email invites — the canonical iam.invitations system via
//      invitationsService (scope targets, member role). Row first, then the
//      email fires through /api/education/class-invite (fire-and-forget).
//   3. Paste/CSV — the caller extracts emails (extractEmails) and calls
//      sendInvites with the batch; each address is one canonical invitation.

"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { invitationsService } from "@/features/organizations/service/invitationsService";
import type { Invitation } from "@/features/organizations/service/invitationsService";
import {
  getJoinCode,
  rotateJoinCode,
  disableJoinCode,
  sendClassInviteEmail,
} from "../service";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Pull every email address out of free text — a pasted list, a CSV export from
 * any SIS/LMS, a TSV, one-per-line, comma-separated; format doesn't matter.
 * Lowercased + deduped, order preserved.
 */
export function extractEmails(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(EMAIL_RE)) {
    const email = match[0].toLowerCase();
    if (!seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

export interface SendInvitesResult {
  sent: number;
  failed: { email: string; reason: string }[];
}

export interface UseClassInvitesReturn {
  /** The live join code, or null when disabled/not yet created. */
  code: string | null;
  codeLoading: boolean;
  /** Pending (and recent) canonical invitations for this class. */
  invites: Invitation[];
  invitesLoading: boolean;
  sending: boolean;
  refreshInvites: () => Promise<void>;
  ensureCode: () => Promise<void>;
  rotateCode: () => Promise<void>;
  disableCode: () => Promise<void>;
  /** One canonical invitation + email per address. Returns the tally. */
  sendInvites: (emails: string[]) => Promise<SendInvitesResult>;
  revokeInvite: (invitationId: string) => Promise<void>;
  resendInvite: (invitationId: string) => Promise<void>;
}

export function useClassInvites(
  classId: string | null,
  enabled = true,
): UseClassInvitesReturn {
  const [code, setCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const refreshInvites = useCallback(async () => {
    if (!classId || !enabled) return;
    setInvitesLoading(true);
    try {
      const result = await invitationsService.listForTarget("scope", classId);
      setInvites(result.ok ? result.data.invitations : []);
    } finally {
      setInvitesLoading(false);
    }
  }, [classId, enabled]);

  const ensureCode = useCallback(async () => {
    if (!classId || !enabled) return;
    setCodeLoading(true);
    try {
      setCode(await getJoinCode(classId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the join code.");
    } finally {
      setCodeLoading(false);
    }
  }, [classId, enabled]);

  useEffect(() => {
    void ensureCode();
    void refreshInvites();
  }, [ensureCode, refreshInvites]);

  const rotateCode = useCallback(async () => {
    if (!classId) return;
    setCodeLoading(true);
    try {
      setCode(await rotateJoinCode(classId));
      toast.success("New join code created. The old one no longer works.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rotate the code.");
    } finally {
      setCodeLoading(false);
    }
  }, [classId]);

  const disableCodeCb = useCallback(async () => {
    if (!classId) return;
    setCodeLoading(true);
    try {
      await disableJoinCode(classId);
      setCode(null);
      toast.success("Join code turned off.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not turn off the code.");
    } finally {
      setCodeLoading(false);
    }
  }, [classId]);

  const sendInvites = useCallback(
    async (emails: string[]): Promise<SendInvitesResult> => {
      if (!classId) return { sent: 0, failed: [] };
      setSending(true);
      const failed: { email: string; reason: string }[] = [];
      let sent = 0;
      try {
        for (const email of emails) {
          const result = await invitationsService.create({
            targetType: "scope",
            targetId: classId,
            email,
            role: "member",
          });
          if (result.ok) {
            sent += 1;
            // Fire-and-forget — the row exists even if the email fails.
            void sendClassInviteEmail(result.data.invitation.id);
          } else {
            failed.push({ email, reason: result.error.message });
          }
        }
      } finally {
        setSending(false);
      }
      await refreshInvites();
      return { sent, failed };
    },
    [classId, refreshInvites],
  );

  const revokeInvite = useCallback(
    async (invitationId: string) => {
      const result = await invitationsService.revoke(invitationId);
      if (result.ok) {
        toast.success("Invitation withdrawn.");
      } else {
        toast.error(result.error.message);
      }
      await refreshInvites();
    },
    [refreshInvites],
  );

  const resendInvite = useCallback(
    async (invitationId: string) => {
      const result = await invitationsService.resend(invitationId);
      if (result.ok) {
        await sendClassInviteEmail(invitationId);
        toast.success("Invitation re-sent.");
      } else {
        toast.error(result.error.message);
      }
      await refreshInvites();
    },
    [refreshInvites],
  );

  return {
    code,
    codeLoading,
    invites,
    invitesLoading,
    sending,
    refreshInvites,
    ensureCode,
    rotateCode,
    disableCode: disableCodeCb,
    sendInvites,
    revokeInvite,
    resendInvite,
  };
}
