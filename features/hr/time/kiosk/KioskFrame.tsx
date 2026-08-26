/**
 * features/hr/time/kiosk/KioskFrame.tsx — the full-viewport shell every kiosk screen sits in.
 *
 * 🚨 **NO CHROME, NO DOORS, NO AI** (L3-65, SPEC-TIME §2.8, UI-IA §5.6). No app shell, no nav, no
 * global search, no Assist strip, no user session, and **no route to any other HR surface**. That
 * absence is a security property, not a dead end — a break-room tablet that can reach anything else
 * in HR is a break-room tablet anyone can browse. `no-dead-ends` names the kiosk as its one
 * deliberate exception; do not "fix" it.
 *
 * 🚨 **TABLET, LANDSCAPE AND PORTRAIT** (L3-67, UI-IA §7). Not a phone surface. The frame centres a
 * bounded column and lets it grow — a wall tablet rotated on its mount must not reflow into
 * something a person has to lean in to read.
 *
 * `h-dvh` rather than `h-screen` (`ios-mobile-first`): on an iPad in a browser the visual viewport
 * is the only honest measure, and `100vh` puts the primary control under the chrome.
 */

"use client";

import type { ReactNode } from "react";

export interface KioskFrameProps {
  children: ReactNode;
  /** The location this tablet records for, when the server named one. Orientation, not navigation. */
  locationName?: string | null;
  /** Sits at the top of every screen. Large, because it is read from across a room. */
  organizationName?: string | null;
  /** Set on the brick and refusal screens — the whole viewport becomes the message. */
  tone?: "default" | "stop";
}

export function KioskFrame({
  children,
  locationName,
  organizationName,
  tone = "default",
}: KioskFrameProps) {
  return (
    <div
      className={`flex h-dvh flex-col overflow-hidden ${
        tone === "stop" ? "bg-card" : "bg-textured"
      }`}
    >
      {(organizationName || locationName) && (
        <header className="flex shrink-0 items-baseline justify-between gap-4 px-8 pt-6">
          <span className="text-xl font-semibold text-foreground">{organizationName}</span>
          {locationName && (
            <span className="text-lg text-muted-foreground">{locationName}</span>
          )}
        </header>
      )}
      {/*
        `min-h-0 flex-1` bounds the scroll area only because every ancestor above is `flex flex-col`
        — including the (kiosk) layout's own wrapper. Breaking that chain anywhere above turns a
        tablet in portrait into a screen whose primary control is off the bottom.
      */}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-6 pb-safe">
        <div className="flex w-full max-w-2xl flex-col items-stretch gap-6">{children}</div>
      </main>
    </div>
  );
}
