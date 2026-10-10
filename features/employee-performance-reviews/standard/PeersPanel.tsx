"use client";

// Peer feedback on a review page: who was asked (and who answered), asking more people, the
// manager's approve / decline of the employee's suggestions, and the manager's choice to share the
// peer feedback with the employee. Offered only while this employer has peer feedback turned on.

import { useEffect, useState } from "react";
import { Check, Send, X } from "lucide-react";
import { Badge, Button } from "@ai-matrx/design-system/controls";

import { EmploymentPicker } from "@/features/hr/people/relations/components/EmploymentPicker";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";

import { peerRefusalMessage } from "./messages";
import { NOMINATION_LABEL, canNominatePeers, pendingNominations } from "./peers";
import { decidePeers, nominatePeers, readPeersEnabled, sharePeerFeedback } from "./service";
import { formatDay } from "./status";
import type { ReviewDetail } from "./types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function PeersPanel({ detail, onChanged }: { detail: ReviewDetail; onChanged: () => void }) {
  const { review, peerNominations } = detail;
  const userId = useAppSelector(selectUserId);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<Array<{ employmentId: string; name: string }>>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);

  useEffect(() => {
    if (!userId || !review.organizationId) return;
    let live = true;
    void readPeersEnabled(review.organizationId, userId).then((v) => live && setEnabled(v));
    return () => {
      live = false;
    };
  }, [review.organizationId, userId]);

  const canAsk = canNominatePeers({ seats: review.seats, peersEnabled: enabled === true, review });
  const isManager = review.seats.includes("manager");
  const pending = pendingNominations(peerNominations);
  // Nothing to show when peer feedback is off and nobody was ever asked.
  if (enabled !== true && peerNominations.length === 0) return null;

  const run = async (op: () => Promise<{ ok: boolean; message?: string }>, done: string) => {
    if (busy) return;
    setBusy(true);
    const r = await op();
    setBusy(false);
    if (!r.ok) toast.error(r.message ?? "That did not work.");
    else {
      toast.success(done);
      onChanged();
    }
  };

  const send = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    const r = await nominatePeers(review.reviewId, picked.map((p) => p.employmentId));
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    setRefused(r.data.refused.map((x) => peerRefusalMessage(picked.find((p) => p.employmentId === x.employmentId)?.name ?? null, x.reason)));
    if (r.data.nominated.length > 0) toast.success(isManager ? "Feedback requested" : "Suggestions sent to your manager");
    setPicked([]);
    setPickerKey((k) => k + 1);
    onChanged();
  };

  return (
    <section aria-label="Peer feedback" className="space-y-3 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Peer feedback</p>
        {detail.peerFeedbackSharedAt ? <Badge tone="primary">Shared {formatDay(detail.peerFeedbackSharedAt)}</Badge> : null}
        {isManager ? (
          <Button
            className="ml-auto"
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => sharePeerFeedback(review.reviewId, detail.peerFeedbackSharedAt === null), detail.peerFeedbackSharedAt === null ? "Peer feedback shared" : "Peer feedback hidden again")}
          >
            {detail.peerFeedbackSharedAt === null ? `Share peer feedback with ${review.employeeName}` : "Stop sharing"}
          </Button>
        ) : null}
      </div>

      {peerNominations.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {peerNominations.map((n) => (
            <li key={n.nominationId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{n.peerName}</span>
              <Badge tone={n.status === "approved" ? "success" : n.status === "declined" ? "neutral" : "warning"}>{NOMINATION_LABEL[n.status] ?? n.status}</Badge>
              {n.responseStatus ? <span className="text-muted-foreground">{n.responseStatus === "submitted" ? "Answered" : "Not answered yet"}</span> : null}
              {isManager && n.status === "pending" ? (
                <span className="ml-auto flex gap-1">
                  <Button icon={<Check />} variant="outline" disabled={busy} onClick={() => void run(() => decidePeers(review.reviewId, [n.nominationId], true), "Peer asked")}>
                    Approve
                  </Button>
                  <Button icon={<X />} variant="quiet" disabled={busy} onClick={() => void run(() => decidePeers(review.reviewId, [n.nominationId], false), "Peer declined")}>
                    Decline
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {isManager && pending.length > 1 ? (
        <Button variant="outline" disabled={busy} onClick={() => void run(() => decidePeers(review.reviewId, pending.map((n) => n.nominationId), true), "Peers asked")}>
          Approve all {pending.length}
        </Button>
      ) : null}

      {canAsk ? (
        <div className="max-w-md space-y-2">
          <EmploymentPicker
            key={pickerKey}
            value={null}
            onChange={() => undefined}
            onChosen={(p) => setPicked((l) => (l.some((x) => x.employmentId === p.employmentId) ? l : [...l, p]))}
            placeholder={isManager ? "Ask a colleague for feedback" : "Suggest a colleague"}
          />
          {picked.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {picked.map((p) => (
                <li key={p.employmentId} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                  {p.name}
                  <Button icon={<X />} variant="quiet" aria-label={`Remove ${p.name}`} onClick={() => setPicked((l) => l.filter((x) => x.employmentId !== p.employmentId))} />
                </li>
              ))}
            </ul>
          ) : null}
          <Button icon={<Send />} variant="primary" disabled={picked.length === 0 || busy} onClick={() => void send()}>
            {isManager ? "Ask for feedback" : "Send to my manager"}
          </Button>
        </div>
      ) : null}
      {refused.length > 0 ? (
        <ul role="alert" className="list-disc pl-5 text-sm">
          {refused.map((m) => (
            <li key={m}>{m}</li>
          ))}
        <ErrorAlchemyMenu /></ul>
      ) : null}
    </section>
  );
}
