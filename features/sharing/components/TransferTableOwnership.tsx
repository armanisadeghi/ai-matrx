"use client";

/**
 * features/sharing/components/TransferTableOwnership.tsx — lane SHARE-LANE-2.
 *
 * THE ORGANIZATION'S GOVERNANCE OVER A PERSONAL TABLE, AS ONE DIALOG.
 *
 * An owner or admin of an organization does NOT open a Table somebody set to "Only people I
 * share it with" (the access kernel refuses them like any other member — the Google Workspace /
 * Notion model: of course the admin cannot read her private notes). What they may do instead is
 * TRANSFER it: explicit, with a reason, recorded in the organization's audit log, and told to both
 * people. The previous owner stays named as an editor, and the Table stays personal — now to its
 * new owner. The door is `custom.table_transfer_owner`; this dialog is its only client.
 *
 * Two hosts open it:
 *   · the member's row in organization settings ("Transfer their personal tables…"), which passes
 *     no ids and lets the dialog ask `custom.member_personal_tables` (ids and a count, never names);
 *   · the no-access page of a Table ("You are not named on this table. Transfer ownership…"),
 *     which passes the one id it is standing on.
 */

import { useEffect, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchMemberPersonalTables,
  transferTableOwner,
} from "@/features/sharing/service/tableTransfer";

export interface TransferPerson {
  id: string;
  name: string;
}

export interface TransferTableOwnershipProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  /** The Table's current owner. */
  from: TransferPerson;
  /** The Tables to move. Omitted: every personal Table `from` keeps in this organization. */
  tableIds?: string[];
  /** Who may receive it: the organization's current members. */
  people: TransferPerson[];
  /** The person pressing the button (listed first, as "Me"). */
  viewerId: string;
  onDone?: () => void;
}

type Loaded =
  | { state: "loading" }
  | { state: "ready"; ids: string[] }
  | { state: "failed"; why: string };

export function TransferTableOwnership({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  from,
  tableIds,
  people,
  viewerId,
  onDone,
}: TransferTableOwnershipProps) {
  // The dialog is mounted by its host only while open, so its state starts fresh each time.
  const [fetched, setFetched] = useState<Loaded>({ state: "loading" });
  const [to, setTo] = useState<string>(viewerId);
  const [reason, setReason] = useState("");
  const [needReason, setNeedReason] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string[]>([]);
  const [refused, setRefused] = useState<string[]>([]);

  // A string key, so a fresh array from the host on every render does not refetch.
  const idsKey = tableIds ? tableIds.join(",") : null;
  useEffect(() => {
    if (!open || idsKey !== null) return;
    let live = true;
    void fetchMemberPersonalTables(organizationId, from.id).then((r) => {
      if (!live) return;
      setFetched(
        r.data
          ? { state: "ready", ids: r.data.tableIds }
          : { state: "failed", why: r.error ?? "The organization did not answer." },
      );
    });
    return () => {
      live = false;
    };
  }, [open, organizationId, from.id, idsKey]);
  const loaded: Loaded =
    idsKey !== null ? { state: "ready", ids: idsKey ? idsKey.split(",") : [] } : fetched;

  const me = people.find((p) => p.id === viewerId);
  const recipients = [
    ...(viewerId !== from.id ? [{ id: viewerId, name: me ? `Me (${me.name})` : "Me" }] : []),
    ...people.filter((p) => p.id !== from.id && p.id !== viewerId),
  ];

  const ids = loaded.state === "ready" ? loaded.ids : [];
  const n = ids.length;
  const done = said.length > 0 && refused.length === 0;

  const transfer = async () => {
    if (!reason.trim()) {
      setNeedReason(true);
      return;
    }
    setBusy(true);
    const ok: string[] = [];
    const no: string[] = [];
    for (const id of ids) {
      const r = await transferTableOwner(id, to, reason.trim());
      if (r.success) ok.push(r.message ?? "Transferred.");
      else no.push(r.error ?? "The transfer was refused.");
    }
    setSaid(ok);
    setRefused(no);
    setBusy(false);
    if (ok.length > 0) onDone?.();
  };

  const noun = n === 1 ? "table" : "tables";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="matrx-touch-targets sm:max-w-lg" data-table-transfer>
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            {loaded.state === "loading"
              ? `Looking for the personal tables ${from.name} keeps in ${organizationName}…`
              : loaded.state === "failed"
                ? loaded.why
                : n === 0
                  ? `${from.name} keeps no personal tables in ${organizationName}.`
                  : `${from.name} keeps ${n} personal ${noun} in ${organizationName}. You cannot open ${n === 1 ? "it" : "them"}: ${n === 1 ? "it is" : "they are"} shared only with the people named on ${n === 1 ? "it" : "them"}. Transferring makes someone else the owner; ${from.name} stays on as an editor. Both of you are told, and the transfer is kept in the organization's audit log.`}
          </DialogDescription>
        </DialogHeader>

        {loaded.state === "ready" && n > 0 && !done && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-to">New owner</Label>
              <select
                id="transfer-to"
                className="h-11 rounded-md border bg-background px-3 text-base sm:h-9 sm:text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                data-transfer-to
              >
                {recipients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-reason">Why</Label>
              <Textarea
                id="transfer-reason"
                className="text-base sm:text-sm"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (e.target.value.trim()) setNeedReason(false);
                }}
                placeholder={`For example: ${from.name} is leaving and their open work stays with the team.`}
                data-transfer-reason
              />
              {needReason && (
                <p className="text-xs text-destructive" data-transfer-need-reason>
                  Say why. The reason is kept in the audit log and told to both people.
                </p>
              )}
            </div>
          </div>
        )}

        {said.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm" data-transfer-said>
            {said.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
        {refused.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-destructive" data-transfer-refused>
            {refused.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}

        <DialogFooter>
          {loaded.state === "ready" && n > 0 && !done ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void transfer()} disabled={busy} data-transfer-go>
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                )}
                {n === 1 ? "Transfer the table" : `Transfer ${n} tables`}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
