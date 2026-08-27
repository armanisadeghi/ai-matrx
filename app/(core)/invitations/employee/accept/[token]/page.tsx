"use client";

// app/(core)/invitations/employee/accept/[token]/page.tsx
//
// Where a person becomes an employee WITH A LOGIN. Route emitted by
// `public.hr_employee_invite` as `accept_path`.
//
// 🚨 THE ACCEPTING ACCOUNT IS THE ACCOUNT THAT GETS LINKED, which is the entire
// security property of this page. `hr_invite_accept` runs as `auth.uid()` and
// sets `hr.employee.login_user_id` to whoever is signed in — so an administrator
// must never "accept on someone's behalf", and the page never offers to. If the
// signed-in address is not the invited one, we say so and stop rather than
// linking the wrong person to somebody's HR record permanently.
//
// 🚨 SIGN-IN FIRST, ACCEPTANCE SECOND — never the reverse. A signed-out visitor
// is sent to `/login?redirectTo=<here>`; they come back and the accept happens
// then. Accepting cannot be done anonymously because there is no account to link.
//
// 🚨 `hr_linked: false` IS A SUCCESS. It means the token was an ordinary
// organization invitation with no employee attached — the membership is real and
// the person is in. We follow the server's `door` rather than assuming `/hr/me`.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, BadgeCheck, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { acceptHrEmployeeInvite } from "@/features/hr/service";
import { isHrDenied } from "@/features/hr/types";

export default function AcceptEmployeeInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [checking, setChecking] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        // Come back here afterwards — the token is in the path, so the round
        // trip through the login screen loses nothing.
        router.push(
          `/login?redirectTo=${encodeURIComponent(
            `/invitations/employee/accept/${token}`,
          )}`,
        );
        return;
      }
      setEmail(user.email ?? null);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  const accept = useCallback(async () => {
    setAccepting(true);
    const result = await acceptHrEmployeeInvite(token);
    setAccepting(false);

    if (!result.ok) {
      // `invitation_not_usable` covers used, withdrawn, expired, and addressed
      // to a different account — the server deliberately does not distinguish
      // them, because doing so tells a stranger holding a stray link which of
      // those it is. We name the account instead: that is the part the person
      // can actually act on, and the usual cause.
      const detail = isHrDenied(result)
        ? (result.detail ?? result.reason)
        : result.message;
      setError(
        `${detail}${
          email
            ? ` You are signed in as ${email} — if the invitation was sent to a different address, sign in with that one.`
            : ""
        }`,
      );
      return;
    }

    if (result.data.hrLinked) {
      toast.success("You're in — this is your own employee record.");
    } else {
      toast.success("Invitation accepted.");
    }
    router.push(result.data.door ?? "/dashboard");
  }, [email, router, token]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center bg-textured p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-textured p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            This invitation can&apos;t be opened
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Go to your dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-textured p-4">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <BadgeCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Your employee record is waiting
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Accepting links this account
          {email ? (
            <>
              {" "}
              — <span className="font-medium text-foreground">{email}</span> —
            </>
          ) : (
            " "
          )}{" "}
          to your employee record, so you can see your own details, pay and
          schedule. It links the account you are signed in as right now, so if
          that is not you, sign out first.
        </p>
        <Button
          className="w-full"
          disabled={accepting}
          onClick={() => void accept()}
        >
          {accepting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Accepting…
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Accept and open my record
            </>
          )}
        </Button>
      </Card>
    </div>
  );
}
