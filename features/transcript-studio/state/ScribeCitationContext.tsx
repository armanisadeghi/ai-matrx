"use client";

// features/transcript-studio/state/ScribeCitationContext.tsx
//
// Supplies the active scribe session id to anything rendered beneath it — most
// importantly the `<audiocite>` render block embedded in an agent's reply. The
// agent cites a moment with just `start`/`end` seconds; the *which session*
// comes from here, so citations stay clean and the model never has to juggle
// ids. A citation may still carry an explicit `session="…"` attribute (portable
// outside the scribe screen); the attribute wins when present, this context is
// the fallback.

import { createContext, useContext, type ReactNode } from "react";

const ScribeCitationContext = createContext<string | null>(null);

export function ScribeCitationProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  return (
    <ScribeCitationContext.Provider value={sessionId}>
      {children}
    </ScribeCitationContext.Provider>
  );
}

/** The active scribe session id, or null when not inside a scribe surface. */
export function useScribeCitationSessionId(): string | null {
  return useContext(ScribeCitationContext);
}
