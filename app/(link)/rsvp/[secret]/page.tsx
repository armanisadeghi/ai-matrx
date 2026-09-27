// app/(link)/rsvp/[secret]/page.tsx — THE ANSWER TO A MEETING INVITATION.
//
// Every invitation email carries three links here (Yes / No / Maybe, the answer
// in `?answer=`). It lives in `(link)` for that group's reason: a link somebody
// was SENT, often to a person with no account, who came to answer one question —
// no marketing header, no app shell. The page itself is `RsvpLanding`.
//
// The title names nothing about the meeting: a tab title and a link preview are
// where an invitation's contents leak into somebody else's screenshot.

import type { Metadata } from "next";
import { RsvpLanding } from "@/features/meet/components/rsvp/RsvpLanding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meeting invitation",
  robots: { index: false, follow: false },
};

export default async function RsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ secret: string }>;
  searchParams: Promise<{ answer?: string | string[] }>;
}) {
  const [{ secret }, { answer }] = await Promise.all([params, searchParams]);
  return (
    <RsvpLanding
      secret={secret}
      initialAnswer={typeof answer === "string" ? answer : null}
    />
  );
}
