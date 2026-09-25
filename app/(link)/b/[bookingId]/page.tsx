// app/(link)/b/[bookingId]/page.tsx — THE PUBLIC BOOKING PAGE. PRODUCTS row 14.
//
// A person with no account opens an unguessable link, picks a day, picks a time
// in their own timezone, gives their name and their email, and has an
// appointment. It becomes an ordinary record in a real Table, stamped with the
// page it came through, and whoever owns the page is told.
//
// IT IS IN `(link)` AND NOT `(public)`, for the reason that group's layout
// gives: `(public)` is the MARKETING SITE, and a clinic's booking page wearing
// our Download / Sign in header invites a stranger to download our product
// instead of booking the appointment their doctor asked them to book.
//
// SERVER-RENDERED. The questions, the Field definitions, the hours and WHICH
// TIMES ARE FREE are resolved here, on the server, through
// `custom.booking_public` — so the first paint is the real picker at its real
// size, and the browser never holds a key to the record store.
//
// THE TIMES ARE THE STORE'S. The grid comes from the organization's
// availability, in the organization's timezone, past its lead time, inside its
// daily cap, and `custom.booking_hold` checks any asked-for time against the
// SAME function. The browser renders those instants in the VISITOR's timezone —
// which is a display concern and nothing else.
//
// 404 IS THE ANSWER TO FOUR DIFFERENT QUESTIONS, on purpose: a page that never
// existed, one never published, and one that is a plain form rather than a
// booking page all resolve to nothing. Telling them apart would let a link be
// used to learn something is there. A page in an organization whose store is
// switched OFF used to be a fourth, and STORE-OFF (2026-09-22) took it out of
// that set: the person holding this link was sent it by the business whose
// calendar it is, so the door names the switch instead of disappearing.

import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicLinkNotice } from "@/components/public-link/PublicLinkNotice";
import { publicBooking } from "@/features/booking/service";

import { BookingPicker } from "./BookingPicker";

// What is free moves minute by minute, and nothing here is cacheable across people.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}): Promise<Metadata> {
  const { bookingId } = await params;
  const page = await publicBooking(bookingId).catch(() => null);
  if (!page) {
    return { title: "Book a time · AI Matrx", robots: { index: false, follow: false } };
  }
  const intro = page.presentation?.intro ?? undefined;
  return {
    title: `${page.title} · AI Matrx`,
    ...(intro ? { description: intro } : {}),
    // A booking link is meant to be sent to the people who should use it, not
    // found by strangers searching. The owner shares it; we do not index it.
    robots: { index: false, follow: false },
    openGraph: { title: page.title, ...(intro ? { description: intro } : {}), type: "website" },
  };
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const page = await publicBooking(bookingId);
  if (!page) notFound();

  // CLOSED, FULL AND SWITCHED OFF ARE NOT ERRORS, and they are not 404s either:
  // the link is real and the person following it deserves a sentence rather than
  // a dead end. The words are the STORE's, so the page and the door can never
  // disagree. `unavailable` is STORE-OFF's (2026-09-22): a booking page whose
  // organization has switched the record store off used to 404 at the customer
  // who was sent it.
  if (page.state !== "open") {
    return <PublicLinkNotice title={page.title} message={page.message} />;
  }

  return (
    // NOTHING ON THIS PAGE BUT THE BOOKING. Centred the way Calendly and Cal.com
    // centre theirs, with the page's own name said once, here.
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 pb-safe pt-8 matrx-touch-targets">
      <h1 className="text-xl font-medium">{page.title}</h1>
      {page.presentation?.intro ? (
        <p className="mt-1 text-sm text-muted-foreground">
          <RichContentServer level="inline" source={page.presentation.intro} />
        </p>
      ) : null}
      <BookingPicker page={page} />
    </main>
  );
}
