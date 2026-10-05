"use client";

// features/esign/signing/SignedDone.tsx — what a signer sees once they have signed.
//
// The end of the walk is a confirmation, not a dead end (DocuSign's "You're done" page): it says
// the signature is recorded and where things stand, hands over the signed copy, and — for someone
// who signed from an emailed link with no account — invites them to keep their documents in a free
// account (the growth door: every outsider signature is a person who just used the product). A
// signed-in signer goes back to their envelopes instead.

import Link from "next/link";
import { CheckCircle2, FileSignature, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { loginHref, signUpHref } from "@/utils/auth/auth-destination";

import { SignedCopy } from "./SignedCopy";
import type { SigningDoor } from "./signingService";

export function SignedDone({
  door,
  title,
  everyoneSigned,
  signedAt,
}: {
  door: SigningDoor;
  title: string;
  /** True once the envelope is complete; otherwise others still have to sign. */
  everyoneSigned: boolean;
  signedAt: string | null;
}) {
  const outsider = door.kind === "outsider";
  const when = signedAt ? new Date(signedAt) : new Date();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-5 text-center">
        <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-500" />
        <div className="text-base font-semibold text-foreground">You signed {title}</div>
        <div className="text-sm text-muted-foreground">
          {everyoneSigned ? "Everyone has signed." : "We will email you when everyone has signed."}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Recorded {when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </div>
      </div>

      {everyoneSigned ? (
        <SignedCopy door={door} />
      ) : (
        <p className="text-sm text-muted-foreground">Your signed copy arrives by email when it is complete.</p>
      )}

      {outsider ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileSignature className="h-4 w-4" />
            Keep your signed documents
          </div>
          <p className="text-sm text-muted-foreground">Free AI Matrx account. Send your own for signature too.</p>
          <Button asChild>
            <Link href={signUpHref("/esign")}>Create free account</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={loginHref("/esign")}>I have an account</Link>
          </Button>
        </div>
      ) : (
        <Button variant="outline" asChild>
          <Link href="/esign">Back to E-Signatures</Link>
        </Button>
      )}
    </div>
  );
}
