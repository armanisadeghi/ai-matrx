// app/(link)/b/manage/[ref]/page.tsx — THE VISITOR'S OWN APPOINTMENT.
//
// The link in their confirmation. 128 unguessable bits, minted at confirm, and
// NOT the record id — a person who booked must be able to move or cancel their
// own time without an account and without being able to name anybody else's.
// Cal.com does exactly this, and it is the difference between a booking product
// and a form that happens to collect a date.
//
// Server-rendered like the booking page, in the same `(link)` group and for the
// same reason: this is a link somebody was sent, not a page of our website.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { managedBooking } from "@/features/booking/service";

import { ManageBooking } from "./ManageBooking";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your appointment · AI Matrx",
  // A person's own appointment link is never indexed, and it carries their
  // booking in the URL — so it is kept out of referrers too.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const booking = await managedBooking(ref);
  if (!booking) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 pb-safe pt-8 matrx-touch-targets">
      <h1 className="text-xl font-medium">{booking.title}</h1>
      <ManageBooking booking={booking} />
    </main>
  );
}
