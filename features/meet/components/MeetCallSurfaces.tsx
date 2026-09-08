"use client";

// features/meet/components/MeetCallSurfaces.tsx
//
// 🚨 THE TWO CALL SURFACES, MOUNTED ONLY WHERE THE PACKAGE IS DEFINED TO WORK —
// AND A PACKAGE DEFECT THIS FILE IS STANDING IN FOR.
//
// WHAT IS WRONG (verified live against `@ai-matrx/meet` 0.2.0 on this app's dev
// server, 2026-09-08): `<IncomingCallHost />` and `<CallButton />` both call
// `useCalls()`, which calls `useRequiredMeetHost()`, which THROWS when the
// provider has no runtime. `<MeetProvider>` is deliberately inert until
// `client`, `organizationId` and an identity are all real — which is every
// server render, every signed-out visitor, and every moment before the active
// organization hydrates.
//
// So the exact three lines the package README tells every consumer to write
//
//     <MeetProvider …>
//       <IncomingCallHost />
//       {children}
//
// crash the whole tree with a 500 on the server, on every route, for every
// visitor who is not yet signed in with an org selected. Measured here:
// `GET /meet/<slug> 500` before this guard existed.
//
// This is NOT the host catching a package error or branching on a quirk (C22).
// It is mounting a component only in the state its own contract requires — the
// package's `useMeetHost()` (the non-throwing twin it exports for exactly this)
// is the state test. The RIGHT fix is in the package: `useCalls` should tolerate
// an absent host the way `useMeetSnapshot` already does, and then both
// components render nothing on their own. That belongs to register item
// **MRI-A5** (`@ai-matrx/meet` 0.3.0); when it lands, these wrappers are deleted
// and the package's components are mounted directly.

import { CallButton, IncomingCallHost, useMeetHost } from "@ai-matrx/meet/react";
import type { CallablePerson } from "@ai-matrx/meet/react";

/** The ringing stack. Renders nothing while there is no runtime to ring on. */
export function MeetIncomingCalls() {
  const host = useMeetHost();
  if (host === null) return null;
  return <IncomingCallHost />;
}

/**
 * A call control beside a person. Absent — never disabled-looking — when there
 * is no runtime, and absent by the package's own rule when the viewer is a
 * guest (`calls.canCall` is false by construction, D6).
 */
export function PersonCallButton({ person }: { person: CallablePerson }) {
  const host = useMeetHost();
  if (host === null) return null;
  return <CallButton person={person} />;
}
