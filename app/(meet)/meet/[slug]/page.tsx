// app/(meet)/meet/[slug]/page.tsx
//
// THE DURABLE MEETING LINK (R3/D12). One slug resolves before, during and after
// the meeting, and it works for anyone — a signed-in member joins as
// themselves, a link-follower enters a name and waits in the lobby (D6).
//
// Server Component. It resolves NOTHING about the meeting itself: the slug is
// resolved client-side through the package's repository, which calls the
// `communication.meet_meeting_by_slug` RPC — granted to `anon` as well as
// `authenticated`, which is what makes the guest lane real rather than
// aspirational. Doing that read here would need a second, server-side Supabase
// path for a row the client can already ask for.

import type { Metadata } from "next";
import { MeetingSurface } from "@/features/meet/components/MeetingSurface";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata: Metadata = {
  title: "Meeting — AI Matrx",
  description: "Join this AI Matrx meeting.",
  // A meeting link is private by nature. It is not a page for a crawler.
  robots: { index: false, follow: false },
};

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Request-cached — the layout above already validated this session.
  const { isAuthenticated } = await getServerAuth();
  return <MeetingSurface slug={slug} isAuthenticated={isAuthenticated} />;
}
