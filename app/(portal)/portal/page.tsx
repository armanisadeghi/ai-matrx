/**
 * `/portal` — the departed-member portal, across every organization the caller has left.
 *
 * Takes no argument, so the door lists every organization that holds a departed record for
 * this person. A person can have left more than one; each renders its own panel with its own
 * state and its own enabled aspects, because the two organizations' choices are unrelated.
 */

import { ContinuedAccessPortal } from "@/features/continued-access/ContinuedAccessPortal";

export const metadata = { title: "Your portal" };

export default function PortalPage() {
  return <ContinuedAccessPortal />;
}
