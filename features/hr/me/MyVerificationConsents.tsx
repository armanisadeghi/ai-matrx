// features/hr/me/MyVerificationConsents.tsx
//
// ROUTE 2 — `/hr/me` · the subject's half of verification letters
// (SPEC-EMPLOYEES §4.9, SPEC-NOTIFICATIONS §2 `hr.people.verification_consent_requested`).
//
// 🚨 WHY THIS EXISTS AT ALL. A verification letter that states income needs the subject's
// consent, and until hr_l1_54 there was no surface on which they could give it and no door
// through which they could even see the ask. HR's queue showed `awaiting_consent`; the person
// whose pay was about to be disclosed to a lender saw nothing, was told nothing, and had no
// control. The consent gate was real in the database and imaginary in the product.
//
// 🚨 IT MOUNTS OUTSIDE `useHrContext().active`, ON PURPOSE.
// `hr_my_context().active` resolves through `hr._l1_self_employment(uid, org, TODAY)`, which is
// DATE-SCOPED and NULL for a PRE-START hire — and a pre-start hire is exactly who gets asked to
// verify income, because that is when people apply for loans and apartments. Gating this panel
// on `active` would hide it from the population it was built for. The door scopes itself by
// LOGIN LINKAGE (hr_l1_52's identity law), so this component needs no employer context and
// deliberately takes none.
//
// 🚨 CONSENT IS THE SUBJECT'S AND THERE IS NO HR OVERRIDE. The door refuses `not_the_subject`
// to everybody else, HR admins included — proven, after a measured fail-open where an outsider
// consented on someone else's letter. Nothing here may grow an "on behalf of" path.
//
// 🚨 A DECIDED REQUEST SHOWS ITS OUTCOME AND NO CONTROLS (SPEC-UI-IA §4.2) — not disabled
// buttons. A decision already made is not an action awaiting a nudge.

"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import {
  fetchHrMyVerificationConsents,
  setHrVerificationConsent,
  type HrMyVerificationConsent,
} from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";

/** The letter says pay. That is the whole reason consent is being asked for. */
function whatIsDisclosed(kind: string): string {
  return kind === "income_only"
    ? "your pay"
    : "your employment and your pay";
}

/** WHO it goes to. Never "a third party" when we hold a name. */
function whoIsAsking(row: HrMyVerificationConsent): string {
  return (
    row.requester_organization?.trim() ||
    row.requester_name?.trim() ||
    "a third party"
  );
}

function onDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function MyVerificationConsents() {
  const [rows, setRows] = useState<HrMyVerificationConsent[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  // 🚨 THE HOST HOLDS THE FAILURE. A refusal rendered inside a card that then re-renders
  // away is a refusal nobody reads; this survives the list changing under it.
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchHrMyVerificationConsents();
    if (!result.ok) {
      // A refusal here must NOT become "nothing is waiting on you" — that is the one
      // wrong thing this panel could say. It says what happened instead.
      setFailure(hrErrorSentence(result, "Requests waiting on your consent"));
      setRows([]);
      return;
    }
    setFailure(null);
    setRows(result.data.requests ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(row: HrMyVerificationConsent, granted: boolean) {
    if (saving) return;
    setSaving(row.id);
    const result = await setHrVerificationConsent({
      letterId: row.id,
      granted,
    });
    setSaving(null);
    if (!result.ok) {
      const sentence = hrErrorSentence(result, "Recording your decision");
      setFailure(sentence);
      toast.error(sentence);
      return;
    }
    setFailure(null);
    toast.success(
      granted
        ? "Recorded. Your pay can be confirmed to them."
        : "Recorded. Your pay will not be shared.",
    );
    void load();
  }

  // Nothing waiting and nothing to report: render NOTHING. An empty card on a profile page
  // teaches people to ignore the place their consent will one day be asked for.
  if (!failure && rows.length === 0) return null;

  return (
    <section
      aria-labelledby="my-verification-consents"
      className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-6"
    >
      {failure ? (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-foreground"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{failure}</span>
        </p>
      ) : null}

      {rows.length > 0 ? (
        <h2 id="my-verification-consents" className="sr-only">
          Requests to confirm your pay
        </h2>
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => {
          const asker = whoIsAsking(row);
          const busy = saving === row.id;

          if (row.decided) {
            return (
              <div
                key={row.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm text-foreground">
                  {row.granted
                    ? `You agreed to let ${row.employer_name} confirm ${whatIsDisclosed(row.verification_kind)} to ${asker}.`
                    : `You did not agree to share ${whatIsDisclosed(row.verification_kind)} with ${asker}. Nothing was sent.`}
                </p>
                {row.employee_consent_at ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recorded {onDate(row.employee_consent_at)}
                  </p>
                ) : null}
              </div>
            );
          }

          return (
            <div
              key={row.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start gap-2">
                <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {asker} asked {row.employer_name} to confirm{" "}
                    {whatIsDisclosed(row.verification_kind)}.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nothing about your pay is shared unless you agree to it
                    here. {row.employer_name} cannot decide this for you.
                  </p>
                  {row.requester_email ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      It would go to {row.requester_email}
                      {row.requester_name && row.requester_organization
                        ? ` (${row.requester_name})`
                        : ""}
                      .
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Asked {onDate(row.requested_at)} · this request lapses on{" "}
                    {onDate(row.expires_at)} if you do not answer.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void decide(row, true)}
                  className="min-h-11 sm:min-h-9"
                >
                  Share my pay with {asker}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void decide(row, false)}
                  className="min-h-11 sm:min-h-9"
                >
                  Do not share it
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
