"use client";

// features/hr/people/profile/PlatformAccessSection.tsx
//
// The one place in the product where an employee can be given a login.
//
// 🚨 AN EMPLOYEE IS NOT REQUIRED TO HAVE ONE. SPEC-ACCESS T-17: kiosk-only staff
// are first-class, and nothing may assume `login_user_id IS NOT NULL`. So this is
// an OFFER, never a step — no warning, no incomplete badge, no nag. A record with
// no login is a complete record.
//
// 🚨 §1.3 GATES THIS SECTION AT THE WIRE, NOT HERE. `hr_employee_profile` sends
// `login_user_id` only to `self` and `hr_admin` (migration `hr_l1_18`); for anyone
// else the KEY IS ABSENT, and `"login_user_id" in header` is therefore the
// server's own permission verdict rather than a second guess at it. Do not
// substitute a truthiness test — `login_user_id: null` from a permitted viewer
// means "no login yet", which is exactly the case that must render.
//
// 🚨 THE TOKEN IS SHOWN TO THE ISSUING ADMIN, AND THAT IS DELIBERATE. The
// platform's own invite surfaces never expose it because they assume Resend
// delivers the mail; where mail is not configured that leaves no way to hand
// anybody a link, which is why no employee login existed in this system until
// now. The link is single-use and expiring, and it only reaches a caller who has
// already passed `identity.write`. It is presented as what it is: as good as the
// invitation itself, for that person and nobody else.

import { useState } from "react";
import { Copy, KeyRound, Mail, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { inviteHrEmployeeLogin } from "../../service";
import type { HrEmployeeInviteAck, HrEmployeeProfile } from "../../types";
import { formatFullDate } from "../shared/HrStatusChip";

export function PlatformAccessSection({
  profile,
  className,
}: {
  profile: HrEmployeeProfile;
  className?: string;
}) {
  const header = profile.header;

  // The server's verdict, not ours. See the §1.3 note above.
  const maySeeAccountState = "login_user_id" in header;
  const canInvite = profile.capabilities.includes("identity.write");

  const [email, setEmail] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<HrEmployeeInviteAck | null>(null);

  if (!maySeeAccountState) return null;

  // Already has one. The header carries the door to the member record; there is
  // nothing to do here, so this section says so once and stays out of the way.
  if (header.login_user_id) {
    return (
      <section className={cn("space-y-2", className)}>
        <h3 className="text-sm font-semibold text-foreground">Platform access</h3>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          This person signs in to AI Matrx. Their account is linked to this
          record, which is what gives them their own HR access.
        </p>
      </section>
    );
  }

  // No login, and the viewer cannot issue one. Say the true thing plainly rather
  // than showing a disabled button — a control nobody can use is noise.
  if (!canInvite) {
    return (
      <section className={cn("space-y-2", className)}>
        <h3 className="text-sm font-semibold text-foreground">Platform access</h3>
        <p className="text-xs text-muted-foreground">
          This person does not sign in to AI Matrx. That is a normal state — many
          people are paid, scheduled and clocked in without ever having an
          account.
        </p>
      </section>
    );
  }

  const issue = async () => {
    setIssuing(true);
    const result = await inviteHrEmployeeLogin({
      employeeId: profile.header.employee_id,
      email: email.trim() || null,
    });
    setIssuing(false);

    if (!result.ok) {
      // The server's own sentence. Never rewritten into something friendlier —
      // "this person already has a login" and "there is no address to send to"
      // are different problems with different fixes.
      toast.error(result.error.message);
      return;
    }
    setIssued(result.data);
    toast.success(`Invitation issued to ${result.data.email ?? "this person"}`);
  };

  if (issued) {
    const link =
      typeof window !== "undefined" && issued.acceptPath
        ? `${window.location.origin}${issued.acceptPath}`
        : (issued.acceptPath ?? "");

    return (
      <section className={cn("space-y-3", className)}>
        <h3 className="text-sm font-semibold text-foreground">Platform access</h3>
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="flex items-start gap-2 text-xs text-foreground">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              Invitation issued to{" "}
              <span className="font-medium">{issued.email}</span>
              {issued.expiresAt ? (
                <> — it stops working after {formatFullDate(issued.expiresAt)}.</>
              ) : null}
            </span>
          </p>

          {/* The server's own sentence about delivery, rendered, not paraphrased. */}
          {issued.notice ? (
            <p className="text-[0.6875rem] text-muted-foreground">
              {issued.notice}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={link}
              aria-label="Invitation link"
              className="h-8 font-mono text-[0.6875rem]"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                void navigator.clipboard
                  .writeText(link)
                  .then(() => toast.success("Invitation link copied"))
                  .catch(() => toast.error("Could not copy the link"));
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            This link is single-use and is as good as the invitation itself. Send
            it to {issued.displayName ?? "this person"} and to nobody else.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold text-foreground">Platform access</h3>
      <p className="text-xs text-muted-foreground">
        This person does not sign in to AI Matrx. Inviting them lets them see
        their own record, their pay stubs and their schedule — it does not change
        anything about their employment, and they are not required to accept.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          value={email}
          placeholder={
            typeof profile.personal.work_email === "string"
              ? profile.personal.work_email
              : "name@company.com"
          }
          aria-label="Email address to invite"
          className="h-8 max-w-xs text-xs"
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="button" size="sm" disabled={issuing} onClick={() => void issue()}>
          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
          {issuing ? "Inviting…" : "Invite to sign in"}
        </Button>
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">
        Leave the address blank to use their work email. They will only get a
        login once they accept it themselves.
      </p>
    </section>
  );
}
