"use client";

// features/sharing/outside/OutsideSharePanel.tsx
//
// THE ROUTE FROM THE REFUSAL TO THE REMEDY.
//
// 🚨 WHAT THIS REPLACES (lane PEEK-SHARE §3, measured not guessed). The Share
// dialog printed the store's refusal — *"That person is not in this
// organization, so they cannot be given access to this table yet"* — listed
// three ways forward, and offered no way to take any of them. A person had to
// leave the dialog, find an organization setting, and come back. That is a dead
// end with good manners.
//
// WHAT IT IS. One section inside the ONE share dialog, for a table in the
// record store. It draws exactly what the store says it may draw
// (`custom.table_share_outside` answers `lane_open`, `may_invite`,
// `my_level` and `levels`), so no control here is ever live
// when the door behind it would refuse — and when a control is absent the panel
// says, in a sentence, who can do the thing instead. Absent or honest, never
// dead.
//
// IT IS NOT A SECOND SHARE SURFACE. The grant it produces is an ordinary
// `iam.permissions` row on the Table, read by the same ladder as every other
// share; the pending state is an `iam.invitations` row, the platform's one
// invitation primitive. Nothing new was invented to hold either.

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Globe2,
  Link2,
  Loader2,
  MailWarning,
  RotateCw,
  Send,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";

import {
  absoluteInviteUrl,
  shareWithOutsidePerson,
  readOutsideShare,
  resendOutside,
  revokeOutside,
  type OutsideShareState,
} from "./outsideShareService";

/** The one sentence a shut lane gets. Exported so the test asserts the words. */
export const LANE_CLOSED_SAY =
  "This organization's administrator has turned off sharing with people outside it.";

export interface OutsideSharePanelProps {
  organizationId: string;
  tableId: string;
  tableName: string;
  /**
   * 🚨 SO THE LIST ABOVE CANNOT CONTRADICT THE ROWS BELOW (FIX-10C, VERIFIER-10
   * F13). The grant list up the page knows only about grants, which is correct
   * and was still how "Not shared with anyone" came to stand directly over an
   * invited person. This panel tells its host how many people are invited and
   * not yet joined; the host passes that to the grant list's empty state.
   */
  onPendingChange?: ((count: number) => void) | undefined;
  /**
   * An address already inside the organization is GRANTED the table rather than
   * invited (FIX-10C, VERIFIER-10 F7), and that grant belongs in the list at the
   * top of this dialog, not here. So the host is told to re-read it — otherwise
   * the person gets a sentence saying it happened and an unchanged screen.
   */
  onGranted?: (() => void) | undefined;
}

export function OutsideSharePanel({
  organizationId,
  tableId,
  tableName,
  onPendingChange,
  onGranted,
}: OutsideSharePanelProps) {
  const { toast } = useToast();
  const [state, setState] = useState<OutsideShareState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState("viewer");
  /** Which row's link was just copied, so the button can say so for a moment. */
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const answer = await readOutsideShare(organizationId, tableId);
      setState(answer);
      // The store already capped the list at what this person may give, so the
      // picker's default is simply the lowest rung it returned.
      setLevel((current) =>
        answer.levels.some((l) => l.level === current)
          ? current
          : (answer.levels[0]?.level ?? "viewer"),
      );
    } catch (error) {
      // 🚨 A FAILED READ IS NOT A FACT. It does not mean the lane is shut; it
      // means nobody could look. Same rule as the record store's own switch.
      setState(null);
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [organizationId, tableId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A read that FAILED says nothing about how many are pending, so it reports
  // zero rather than a guess — the same rule the panel's own error state obeys.
  useEffect(() => {
    onPendingChange?.((state?.invitations ?? []).filter((row) => !row.joined).length);
  }, [state, onPendingChange]);

  /**
   * 🚨 PUTTING THE LINK IN SOMEBODY'S HAND IS THE ORDINARY CASE, NOT A FALLBACK.
   * A plumber texts his customer the link. So this control is drawn beside every
   * pending row whether or not email works here, and it goes through THE ONE copy
   * primitive — which, when the browser refuses to write the clipboard, puts the
   * text in front of the person instead of lying that it copied.
   */
  const copyLink = useCallback(
    async (invitationId: string, acceptPath: string, who: string) => {
      const url = absoluteInviteUrl(acceptPath);
      // It routes its own terminal failure to the manual-copy dialog, which puts
      // the text in front of the person — so a `false` here means the copy has
      // NOT happened and saying "Copied" would be a lie.
      const ok = await copyToClipboard(url);
      if (!ok) return;
      setCopied(invitationId);
      toast({ title: `Link copied. Send it to ${who} however you like.` });
      window.setTimeout(
        () => setCopied((c) => (c === invitationId ? null : c)),
        2000,
      );
    },
    [toast],
  );

  const run = async (
    key: string,
    work: () => Promise<{ say: string; delivery?: { say: string } | null | undefined }>,
  ) => {
    setBusy(key);
    try {
      const answer = await work();
      // TWO facts, not one: what happened to the share, and what happened to the
      // message. Collapsing them is how "invited" came to mean "told".
      toast({ title: answer.say, description: answer.delivery?.say });
      await refresh();
    } catch (error) {
      toast({
        title: "That did not happen",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">
              We could not check who outside this organization can see {tableName}
            </p>
            <p className="mt-0.5 text-xs text-destructive/80">
              Nobody was added or removed. This does not mean sharing outside is switched
              off — we simply could not look.
            </p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{loadError}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking who outside this organization can see {tableName}…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <Globe2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium">People outside this organization</h3>
          {/* 🚨 NAMING A PERSON IS THE ONLY ACT (owner ruling, SHARE-GATE-OFF,
              2026-09-23). There is no switch to press here: sharing outside is on
              by default, and an organization administrator who turned it off did
              so on purpose in settings. So a shut lane gets ONE sentence and no
              control — never a button in front of the invite. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state.lane_open ? state.say : LANE_CLOSED_SAY}
          </p>
        </div>
      </div>

      {/* 🚨 WHAT THIS SERVER CAN ACTUALLY DO ABOUT EMAIL, said BEFORE anybody
          presses Invite — never a promise the server cannot keep. The store
          answers yes / no / unknown; only the two that are not "yes" get a
          notice, because "it emails them, and you can also copy the link"
          already reads on the invite row itself. */}
      {state.lane_open &&
      state.may_invite &&
      state.email_delivery?.answer !== "yes" ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
          <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-muted-foreground">
            {state.email_say}
          </p>
        </div>
      ) : null}

      {/* THE INVITE. */}
      {state.lane_open && state.may_invite ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="outside-email" className="text-xs">
              Their email address
            </Label>
            <Input
              id="outside-email"
              type="email"
              placeholder="name@theircompany.com"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
          </div>
          <div className="sm:w-44">
            <Label htmlFor="outside-level" className="text-xs">
              They can
            </Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger id="outside-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Exactly the rungs the store said this person may give. */}
                {state.levels.map((l) => (
                  <SelectItem key={l.level} value={l.level}>
                    {l.means}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!email.trim() || busy === "invite"}
            onClick={() =>
              void run("invite", async () => {
                const answer = await shareWithOutsidePerson(organizationId, tableId, email.trim(), level);
                setEmail("");
                // An existing account (inside or outside the organization) was
                // given the table outright — the row for that lives in the grant
                // list above, so ask the host to re-read it (FIX-10C F7,
                // MOVE-AND-OUTSIDER). Only an address with no account is invited.
                if (answer.granted) onGranted?.();
                return answer;
              })
            }
          >
            {busy === "invite" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            Share
          </Button>
        </div>
      ) : null}

      {/* WHO IS OUT THERE, and which of them has actually joined. */}
      {state.invitations.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {state.invitations.map((row) => (
            <li key={row.invitation_id} className="flex items-start gap-2 p-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{row.email}</span>
                  <span
                    className={
                      row.joined
                        ? "rounded-full bg-primary/10 px-1.5 py-0.5 text-xs"
                        : "rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {row.joined ? row.level_label : "Invited, not yet joined"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.say}</p>
              </div>
              {state.may_invite ? (
                <div className="flex flex-shrink-0 gap-1">
                  {/* 🚨 COPY THE LINK — beside the pending row, always, whether
                      or not email works here. The real case is a plumber texting
                      his customer; the email is the convenience, not the other
                      way round. Absent only when there is no link to give: an
                      accepted row has nothing left to open. */}
                  {row.accept_path ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Copy invitation link"
                      onClick={() =>
                        void copyLink(
                          row.invitation_id,
                          row.accept_path!,
                          row.email,
                        )
                      }
                    >
                      {copied === row.invitation_id ? (
                        <Check className="mr-1.5 h-4 w-4" />
                      ) : (
                        <Link2 className="mr-1.5 h-4 w-4" />
                      )}
                      <span className="text-xs">
                        {copied === row.invitation_id ? "Copied" : "Copy link"}
                      </span>
                    </Button>
                  ) : null}
                  {!row.joined ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Send a fresh link"
                      disabled={busy === `resend:${row.invitation_id}`}
                      onClick={() =>
                        void run(`resend:${row.invitation_id}`, () =>
                          resendOutside(organizationId, row.invitation_id),
                        )
                      }
                    >
                      {busy === `resend:${row.invitation_id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    title={row.joined ? "Take their access away" : "Withdraw the invitation"}
                    disabled={busy === `revoke:${row.invitation_id}`}
                    onClick={() =>
                      void (async () => {
                        // A destructive click names its consequence before it happens.
                        const ok = await confirm({
                          title: row.joined
                            ? `Take ${row.email}'s access to ${tableName} away?`
                            : `Withdraw ${row.email}'s invitation?`,
                          description: row.joined
                            ? `They lose ${tableName} immediately — anything they have open refuses the next time it asks — and, because this table is the only reason they can reach this organization at all, they lose that too. You can invite them again afterwards.`
                            : "Their link stops working. They never had access, so there is nothing to take away.",
                          confirmLabel: row.joined ? "Take it away" : "Withdraw",
                          variant: "destructive",
                        });
                        if (!ok) return;
                        await run(`revoke:${row.invitation_id}`, () =>
                          revokeOutside(organizationId, row.invitation_id),
                        );
                      })()
                    }
                  >
                    {busy === `revoke:${row.invitation_id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
