// app/(link)/secure/[token]/page.tsx — A SECURE LINK SOMEBODY WAS SENT.
//
// The recipient half of secure delivery (aidream `services/secure_delivery/FEATURE.md`): a
// single-use link on one channel, a code on the other, the item shown once. It lives in `(link)`
// for that group's reason — a link somebody SENT, opened on a phone by a person with no account —
// so there is no marketing chrome and no app shell around it, and never a sign-in wall.
//
// NOTHING IS READ ON THE SERVER. The page draws the recipient runner, which asks aidream directly
// (the app's one transport, `callApi`); there is no identity to forward, and rendering the link on
// the server would put the secret in a server render log for no gain.

import type { Metadata } from "next";

import { SecureDeliveryRecipient } from "@/features/sharing/secure/SecureDeliveryRecipient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // THE TITLE NAMES NOTHING: a tab title and a link preview are where contents leak.
  title: "Secure delivery",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SecureDeliveryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SecureDeliveryRecipient token={token} />;
}
