"use client";

// /invitations/class/accept/[token] — where a class invitation email lands.
//
// The class twin of the organization accept page, on the SAME canonical
// invitation system (iam.invitations; inv_get_by_token / inv_accept via
// invitationsService). target_type='scope' — accepting atomically creates the
// active class membership the roster reads, then sends the student into the
// class hub. Survives signup: an anonymous student bounces through auth with
// this page preserved as the destination (loginHref), and the token matches on
// the invited email once they're signed in.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Check, GraduationCap, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/lib/toast";
import { invitationsService } from "@/features/organizations/service/invitationsService";
import type { Invitation } from "@/features/organizations/service/invitationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { supabase } from "@/utils/supabase/client";
import { loginHref } from "@/utils/auth/auth-destination";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

export default function AcceptClassInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const acceptPath = `/invitations/class/accept/${token}`;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        // Canonical auth-destination primitive — the student signs in (or signs
        // UP) and lands right back on this accept page.
        router.push(loginHref(acceptPath));
        return;
      }

      const unopenable = `This invitation link isn't open for ${user.email ?? "this account"}. It may have already been used or withdrawn, or it may have been sent to a different email address.`;

      const result = await invitationsService.getByToken(token);
      if (cancelled) return;
      if (isScopesRpcErr(result)) {
        setError(unopenable);
        setLoading(false);
        return;
      }
      const inv = result.data.invitation;
      if (!inv || inv.targetType !== "scope") {
        setError(unopenable);
        setLoading(false);
        return;
      }
      if (new Date(inv.expiresAt) <= new Date()) {
        setError(
          "This invitation has expired. Ask your teacher to send a new one.",
        );
        setLoading(false);
        return;
      }
      if (
        inv.email.toLowerCase() !== user.email?.toLowerCase() &&
        inv.invitedUserId !== user.id
      ) {
        setError(
          `This invitation is for ${inv.email}. Please sign in with that email address.`,
        );
        setLoading(false);
        return;
      }
      if (inv.status === "accepted") {
        // Already in — just go to the class.
        router.push(`/education/classes/${inv.targetId}`);
        return;
      }
      setInvitation(inv);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  async function accept() {
    if (!invitation) return;
    setAccepting(true);
    const result = await invitationsService.accept(token);
    if (isScopesRpcErr(result)) {
      toast.error(result.error.message);
      setError(result.error.message);
      setAccepting(false);
      return;
    }
    toast.success(
      `Welcome to ${invitation.targetName ?? "the class"}!`,
    );
    router.push(`/education/classes/${result.data.accepted.targetId}`);
  }

  const header = (
    <PageHeader>
      <div className="flex items-center w-full min-w-0 gap-0 p-0">
        <ChevronLeftTapButton
          onClick={() => router.push("/education/classes")}
          variant="transparent"
          ariaLabel="Back"
        />
        <h1 className="ml-2 text-sm font-medium text-foreground truncate">
          Class Invitation
        </h1>
      </div>
    </PageHeader>
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="h-full overflow-y-auto bg-textured flex items-center justify-center p-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (error || !invitation) {
    return (
      <>
        {header}
        <div className="h-full overflow-y-auto bg-textured flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Unable to open this invitation
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {error ??
                "We couldn't open this invitation. Check the link, or ask your teacher to send a new one."}
            </p>
            <Button
              variant="outline"
              onClick={() => router.push("/education/classes")}
            >
              Go to your classes
            </Button>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="h-full overflow-y-auto bg-textured flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <GraduationCap className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {invitation.targetName ?? "A class"}
          </h2>
          <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            Invitation for {invitation.email}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            You&apos;ve been invited to join this class. Accepting adds you to
            the roster and gives you access to everything assigned to the class.
          </p>
          <Button
            className="mt-6 w-full gap-1.5"
            disabled={accepting}
            onClick={() => void accept()}
          >
            {accepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4" />
                Accept and join
              </>
            )}
          </Button>
        </Card>
      </div>
    </>
  );
}
