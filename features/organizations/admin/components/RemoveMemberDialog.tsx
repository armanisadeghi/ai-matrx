"use client";

/**
 * Remove a member from an organization.
 *
 * 🚨 DD-140 (2026-09-12). This dialog used to offer "reassign this person's resources to another
 * member", driven by `org_admin_reassign_member_resources` — a SECURITY DEFINER RPC gated only on
 * "are you an org admin" that rewrote the OWNER column of every shareable registered table:
 * private AI conversations, direct messages, HR restricted notes, I-9s, tax withholding,
 * background checks, compensation. Nothing stopped the admin naming THEMSELVES as the recipient,
 * and the trigger whose job is to refuse ownership rewrites never fired inside a definer. One
 * click took a colleague's private work.
 *
 * The RPC is closed. The control is GONE rather than dead or disabled: a real offboarding transfer
 * is a separate audited door (per-table rules, a time box, an audit row, and a notification to the
 * person whose work moved), and it does not exist yet. The dialog says plainly what happens to the
 * member's resources instead of implying they can be moved.
 */
import React, { useState } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { orgAdminMemberHref } from "../routes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeMember } from "../service";
import type { OrgMemberResource } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  /**
   * The org SLUG — the segment the `(core)` org-admin routes actually use. Optional so an existing
   * caller that has not threaded it through still compiles; when absent the member's name renders
   * as text rather than pointing at a route that would not resolve.
   */
  orgSlug?: string;
  sourceUserId: string;
  sourceLabel: string;
  resources: OrgMemberResource[];
  onDone: () => void;
}

export function RemoveMemberDialog({
  open,
  onOpenChange,
  orgId,
  orgSlug,
  sourceUserId,
  sourceLabel,
  resources,
  onDone,
}: Props) {
  const [busy, setBusy] = useState(false);

  const totalResources = resources.reduce((sum, r) => sum + r.count, 0);

  const submit = async () => {
    setBusy(true);
    try {
      await removeMember(orgId, sourceUserId);
      toast.success("Member removed.");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  /**
   * THE DOOR LAW on a DESTRUCTIVE dialog: this is about to remove this person from the
   * organization, and their name was plain text with their id right there in props. Links to the
   * member's page in THIS shell, never to the platform admin console — see routes.ts for why.
   */
  const memberHref = orgSlug ? orgAdminMemberHref(orgSlug, sourceUserId) : null;
  const sourceName = memberHref ? (
    <Link
      href={memberHref}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
      title={`Open ${sourceLabel} in a new tab`}
    >
      {sourceLabel}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{sourceLabel}</span>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove member</DialogTitle>
          <DialogDescription>
            Remove {sourceName} from this organization. They lose access to this
            organization immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/*
            THE DESTRUCTIVE-CLICK LAW: say what happens to their work, out loud, before the click —
            and say honestly that moving it to someone else is not something this screen can do.
          */}
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {totalResources > 0 ? (
              <>
                {sourceLabel} owns {totalResources} org-scoped resource
                {totalResources === 1 ? "" : "s"} across {resources.length} type
                {resources.length === 1 ? "" : "s"} in this organization.{" "}
                <span className="text-foreground">
                  Those resources stay exactly where they are and keep {sourceLabel} as their
                  owner.
                </span>{" "}
                Transferring another person&apos;s work to someone else is an audited action with
                its own approval — it changes who owns their private conversations and records —
                and it is not available from this screen. Ask for the offboarding transfer if you
                need their work moved.
              </>
            ) : (
              <>{sourceLabel} owns no org-scoped resources in this organization.</>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} variant="destructive">
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Remove member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
