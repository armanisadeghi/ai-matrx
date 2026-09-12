"use client";

// features/emergency-access/components/PendingDoorQueue.tsx
//
// THE APPROVER'S QUEUE — the owner's half of the two-person rule.
//
// A `private`-class record needs an organization admin's request AND that
// organization's owner's approval. Two named people, never one — the door
// refuses even an owner who is approving their own request.
//
// 🚨 BOTH BUTTONS NAME THEIR CONSEQUENCE BEFORE THE CLICK, because both are
// consequential and neither can be taken back. Approving opens a living
// person's private data to somebody else and tells that person it happened.
// Refusing is recorded permanently and that person is told it was asked for and
// refused. A generic "Are you sure?" would fail this; the dialog says what
// happens, to whom, and for how long.
//
// 🚨 THE ANSWER IS THE DATABASE'S SENTENCE. Whatever `iam.emergency_door_approve`
// or `_deny` returns as `message` is what the screen says, verbatim — on a
// grant and on a refusal alike. The door knows the real expiry and the real
// reason; this file does not, and must never guess.

import { useState } from "react";
import {
  Building2,
  CalendarClock,
  DoorOpen,
  FileText,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { supabase } from "@/utils/supabase/client";

import {
  approveEmergencyDoorRequest,
  denyEmergencyDoorRequest,
} from "../service";
import type { EmergencyDoorRequest } from "../types";
import {
  purposeLabel,
  recordKindLabel,
  requestWindowLabel,
  whenLabel,
} from "../presentation";

interface DecisionOutcome {
  granted: boolean;
  /** The door's own sentence, or a transport failure's own sentence. */
  message: string;
}

/** A person, named by the door; else the raw id; else plain words. */
function person(label: string | null, id: string | null): string {
  return label ?? id ?? "someone whose account is no longer recorded";
}

export function PendingDoorQueue({
  initialRequests,
  ownsAnOrganization,
}: {
  initialRequests: EmergencyDoorRequest[];
  /** False when this account owns no organization at all. */
  ownsAnOrganization: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<
    { requestId: string; outcome: DecisionOutcome }[]
  >([]);

  async function decide(
    request: EmergencyDoorRequest,
    decision: "approve" | "deny",
  ) {
    const who = person(request.requestedByLabel, request.requestedBy);
    const about = person(request.subjectLabel, request.subjectUserId);
    const kind = recordKindLabel(request.targetToken).toLowerCase();

    const ok = await confirm(
      decision === "approve"
        ? {
            title: `Open ${about}'s ${kind} to ${who}?`,
            description: `This mints a read-only key — about two hours, and read-only means read-only. For that window ${who} can read ${about}'s private ${kind}, and ${about} is told the moment it happens: who opened it, what they opened, the reason typed, and when the key expires. It stays on their own record permanently. Once it is open it cannot be taken back.`,
            confirmLabel: "Approve and open the door",
            cancelLabel: "Cancel",
          }
        : {
            title: `Refuse ${who}'s request?`,
            description: `${who} does not get the data. The refusal is recorded permanently, and ${about} is told that their ${kind} was asked for and that the request was refused.`,
            confirmLabel: "Refuse the request",
            cancelLabel: "Cancel",
            variant: "destructive",
          },
    );
    if (!ok) return;

    setBusyId(request.id);
    const result =
      decision === "approve"
        ? await approveEmergencyDoorRequest(supabase, {
            requestId: request.id,
            note: "",
          })
        : await denyEmergencyDoorRequest(supabase, {
            requestId: request.id,
            note: "",
          });
    setBusyId(null);

    // A failure is rendered in place with its own sentence — never a silent
    // no-op, and never a row that quietly disappears as if it had worked.
    const outcome: DecisionOutcome = result.ok
      ? { granted: result.data.granted, message: result.data.message }
      : { granted: false, message: result.message };
    setOutcomes((prior) => [...prior, { requestId: request.id, outcome }]);

    // The door can answer `granted: false` and still leave the request
    // pending — "another owner has to approve this", "this one lapsed". Only
    // an actual grant is known to have consumed the row.
    if (result.ok && result.data.granted) {
      setRequests((prior) => prior.filter((row) => row.id !== request.id));
    }
    if (result.ok && !result.data.granted && decision === "deny") {
      setRequests((prior) => prior.filter((row) => row.id !== request.id));
    }
  }

  if (!ownsAnOrganization) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          You do not own an organization
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Only an organization&apos;s owner can approve emergency access to
          somebody&apos;s private data, so there is nothing for you to answer
          here. If you should be able to, an owner of that organization can make
          you one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck
              className="h-4 w-4 shrink-0 text-success"
              aria-hidden="true"
            />
            Nobody is waiting on you
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            No one in the organizations you own has asked to open somebody&apos;s
            private data. When someone does, the request appears here, and the
            person it is about is told either way.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id}>
              <article className="rounded-lg border border-border bg-card p-4">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-warning px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-warning-foreground">
                    <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Waiting on you
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarClock
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {requestWindowLabel(request.requestExpiresAt)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Asked {whenLabel(request.createdAt)}
                  </span>
                  {request.organizationLabel ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {request.organizationLabel}
                    </span>
                  ) : null}
                </header>

                <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
                  <UserRound
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-medium break-all">
                      {person(request.requestedByLabel, request.requestedBy)}
                    </span>{" "}
                    is asking to read{" "}
                    <span className="font-medium break-all">
                      {person(request.subjectLabel, request.subjectUserId)}
                    </span>
                    &apos;s{" "}
                    <span className="font-medium">
                      {recordKindLabel(request.targetToken)}
                    </span>
                    .
                  </span>
                </p>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Reason they picked
                    </dt>
                    <dd className="text-foreground">
                      {purposeLabel(request.purpose)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Which record
                    </dt>
                    <dd className="flex items-center gap-1.5 break-all text-foreground">
                      <FileText
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {request.targetId ?? "No record id recorded"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      The sentence they typed
                    </dt>
                    <dd className="mt-1 border-l-2 border-border pl-3 text-sm italic text-foreground">
                      {request.justification?.trim() || "They typed nothing."}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => void decide(request, "approve")}
                    disabled={busyId === request.id}
                  >
                    {busyId === request.id ? "Working…" : "Approve"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void decide(request, "deny")}
                    disabled={busyId === request.id}
                  >
                    {busyId === request.id ? "Working…" : "Refuse"}
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {outcomes.length > 0 ? (
        <ul className="space-y-2">
          {outcomes.map(({ requestId, outcome }, index) => (
            <li
              key={`${requestId}-${index}`}
              className={
                outcome.granted
                  ? "rounded-lg border border-success/50 bg-success/5 p-3"
                  : "rounded-lg border border-border bg-muted/40 p-3"
              }
            >
              <p className="flex items-start gap-2 text-sm text-foreground">
                {outcome.granted ? (
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldAlert
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                {/* The door's sentence, verbatim. */}
                <span>{outcome.message}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
