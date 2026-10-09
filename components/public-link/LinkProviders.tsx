// components/public-link/LinkProviders.tsx — the app's providers around a sent link (`/f`, `/sign`, `/b`, …).
//
// `app/(link)/layout.tsx` is bare on purpose: each link route takes the providers it needs from its OWN
// layout. Every route of the group except the Applet takes this one — the whole app's `Providers` plus the
// ONE canvas front door (lazy: nothing loads until an item exists). The Applet at `/applets/<slug>` takes
// `AppletProviders` instead, so a stranger opening it does not download the whole app first.
import type { ReactNode } from "react";

import { Providers } from "@/app/Providers";
import { ShellCanvasColumn } from "@/features/canvas/host/ShellCanvasColumn";

export function LinkProviders({ children }: { children: ReactNode }) {
  return (
    <Providers>
      {children}
      <ShellCanvasColumn />
    </Providers>
  );
}
