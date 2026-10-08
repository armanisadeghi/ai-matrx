// app/(link)/sign/e/[envelopeId]/page.tsx — A PLATFORM USER SIGNS AN ENVELOPE SENT TO THEM.
//
// The internal signing route of SPEC-ESIGN §6.0 (U-03): the link e-sign notices send a platform
// user. Same surface as the outsider's `/x/sign`, behind the person's own session instead of a
// code. It sits OUTSIDE every module shell, so the signer sees the document and nothing else.
//
// A signed-out visitor is sent to sign in and lands back here (utils/auth/FEATURE.md); whether
// they are the right person is the database's answer (esign._ctx_internal), shown as one sentence.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InternalEntry } from "@/features/esign/signer/InternalEntry";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign a document",
  robots: { index: false, follow: false },
};

export default async function InternalSignPage({
  params,
}: {
  params: Promise<{ envelopeId: string }>;
}) {
  const { envelopeId } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect(await currentRequestLoginHref(`/sign/e/${envelopeId}`));
  return (
    <div className="h-dvh">
      <InternalEntry envelopeId={envelopeId} />
    </div>
  );
}
