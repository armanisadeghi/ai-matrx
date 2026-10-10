"use client";

/**
 * Take over a member — ACCESS LADDER T-16 / T-16d (common-docs/policies/access-ladder.md).
 *
 * Private is the owner alone. An organization owner or admin's ONLY way into a member's private
 * data is a take-over, and there are two, which the database picks for this member
 * (public.org_admin_take_over_options) and this ONE dialog offers automatically:
 *
 *   account — the member belongs to this organization alone (a managed account, the Google
 *     Workspace / Microsoft 365 model): they are signed out everywhere, every other way in is
 *     closed, the admin sets a new password and signs in as the account
 *     (public.org_admin_take_over_account).
 *   records — the member also belongs to other organizations, so the account is their own:
 *     ownership of everything they hold IN THIS ORGANIZATION (their Private records here included,
 *     Confidential never) moves to a member the admin names, default the admin. Their sign-in and
 *     every other organization are untouched (public.org_admin_take_over_member_records).
 *
 * Both need a reason category and a written reason that is sent to the person; both are recorded
 * on the person's own access log and this organization's log. Every refusal is the database's
 * own sentence, shown verbatim.
 */
import React, { useEffect, useState } from "react";
import { FolderInput, KeyRound, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// A confirmation of an irreversible act is an AlertDialog: it blocks the page on purpose.
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  getTakeOverOptions,
  listOrgMembers,
  listTakeOverPurposes,
  takeOverAccount,
  takeOverMemberRecords,
  type TakeOverOptions,
  type TakeOverPurpose,
} from "../service";
import type { OrgAdminMember } from "../types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string;
  userId: string;
  label: string;
  onDone: () => void;
}

const MIN_PASSWORD = 12;
/** The Select's value for "me" — the database's default recipient (p_to_user_id omitted). */
const ME = "__me__";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function TakeOverAccountDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  userId,
  label,
  onDone,
}: Props) {
  const myId = useAppSelector(selectUserId);
  const [options, setOptions] = useState<TakeOverOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [purposes, setPurposes] = useState<TakeOverPurpose[] | null>(null);
  const [purposesError, setPurposesError] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgAdminMember[] | null>(null);
  const [purpose, setPurpose] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [recipient, setRecipient] = useState(ME);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setOptions(null);
    setOptionsError(null);
    getTakeOverOptions(orgId, userId)
      .then((o) => {
        if (!live) return;
        setOptions(o);
        if (o.mode === "records") {
          listOrgMembers(orgId)
            .then((rows) => live && setMembers(rows))
            .catch(() => live && setMembers([]));
        }
      })
      .catch((err: unknown) => live && setOptionsError(errorText(err, "The take-over options could not be loaded.")));
    return () => {
      live = false;
    };
  }, [open, orgId, userId]);

  useEffect(() => {
    if (!open || purposes) return;
    let live = true;
    listTakeOverPurposes()
      .then((rows) => live && setPurposes(rows))
      .catch((err: unknown) => live && setPurposesError(errorText(err, "The reason list could not be loaded.")));
    return () => {
      live = false;
    };
  }, [open, purposes]);

  const mode = options?.mode ?? null;
  const recipients = (members ?? []).filter((m) => m.userId !== userId && m.userId !== myId);

  const submit = async () => {
    if (!mode) return;
    setBusy(true);
    setRefusal(null);
    try {
      if (mode === "account") {
        const result = await takeOverAccount({ orgId, userId, purpose, reason, newPassword: password });
        if (!result.takenOver) {
          setRefusal(result.message);
          return;
        }
        toast.success(result.message);
        setPassword("");
      } else {
        const result = await takeOverMemberRecords({
          orgId,
          userId,
          purpose,
          reason,
          toUserId: recipient === ME ? null : recipient,
        });
        if (!result.takenOver) {
          setRefusal(result.message);
          return;
        }
        if (result.notMoved > 0) toast.warning(result.message);
        else toast.success(result.message);
      }
      onOpenChange(false);
      onDone();
    } catch (err) {
      setRefusal(errorText(err, "The take-over could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === "records"
              ? `Take over ${label}'s records in ${orgName}`
              : `Take over ${label}'s account`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "records"
              ? `${label} also belongs to other organizations, so their account is their own. You can take over what they hold in this organization. It happens the moment you confirm:`
              : "This is the only way into a member's private data. It happens the moment you confirm:"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {optionsError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive-ink">
            {optionsError}
          <ErrorAlchemyMenu error={optionsError} /></p>
        ) : !mode ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking which take-over applies…
          </div>
        ) : mode === "account" ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{label} is signed out on every device, and their password stops working.</li>
            <li>
              Their reset links, second sign-in factor and outside sign-ins (such as Google) are
              removed.
            </li>
            <li>You sign in as the account with the new password you set here.</li>
            <li>
              {label} is told who did it and the reason you write, and it stays on their access
              record and this organization&apos;s log permanently.
            </li>
          </ul>
        ) : (
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Everything {label} owns in this organization, including their private AI chats
                here, now belongs to the person you choose below.
              </li>
              <li>
                Their sign-in is not touched, and nothing they hold in other organizations moves.
                Confidential records, such as HR files and saved passwords, stay with them.
              </li>
              <li>
                {label} is told who did it and the reason you write, and it stays on their access
                record and this organization&apos;s log permanently.
              </li>
            </ul>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              {options && options.total > 0 ? (
                <>
                  <div className="mb-2 font-medium text-foreground">
                    What moves ({options.total} {options.total === 1 ? "record" : "records"})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {options.records.map((r) => (
                      <span
                        key={r.token}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs"
                      >
                        {r.label}
                        <span className="font-medium text-muted-foreground">{r.count}</span>
                        {r.dataClass === "private" ? (
                          <span className="text-muted-foreground">· private</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {label} owns nothing in this organization right now. Taking over still tells
                  them and is recorded.
                </span>
              )}
            </div>
          </div>
        )}

        {mode ? (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="takeover-purpose">Reason category</Label>
              {purposesError ? (
                <p className="text-sm text-destructive">{purposesError}<ErrorAlchemyMenu error={purposesError} /></p>
              ) : (
                <Select value={purpose} onValueChange={setPurpose} disabled={!purposes}>
                  <SelectTrigger id="takeover-purpose">
                    <SelectValue placeholder={purposes ? "Choose a reason" : "Loading reasons…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(purposes ?? []).map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="takeover-reason">Why, in your own words (sent to {label})</Label>
              <Textarea
                id="takeover-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
            {mode === "account" ? (
              <div className="space-y-1.5">
                <Label htmlFor="takeover-password">New password for the account</Label>
                <Input
                  id="takeover-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="takeover-recipient">Give their records to</Label>
                <Select value={recipient} onValueChange={setRecipient}>
                  <SelectTrigger id="takeover-recipient">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ME}>Me</SelectItem>
                    {recipients.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.displayName || m.email || m.userId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {refusal ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive-ink">
                {refusal}
              <ErrorAlchemyMenu error={refusal} /></p>
            ) : null}
          </div>
        ) : null}

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {mode ? (
            <Button icon={busy ? (
                <Loader2 className="animate-spin" />
              ) : mode === "account" ? (
                <KeyRound />
              ) : (
                <FolderInput />
              )} onClick={submit} disabled={busy} variant="danger">
              {mode === "account" ? "Take over account" : "Take over records"}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
