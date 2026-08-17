"use client";

// features/audio/RecordingOriginProvider.tsx
//
// The React half of the recording-origin stamp (`./recordingOrigin.ts`).
//
// WHY A CONTEXT AND NOT A PROP. The mic lives at the bottom of a deep, SHARED
// chain — ProTextarea → smart input → InputActionButtons → AgentMicrophoneButton
// → MicrophoneIconButton → MicrophoneIconButtonCore → useVoiceCapture — and that
// chain is used by every text surface in the platform. Threading an `origin`
// prop through all of it would touch a dozen shared components for the benefit
// of one surface and give every future surface the same tax. A surface instead
// WRAPS its subtree: any recording started inside it is stamped, everything
// outside is untouched, and a surface that declares nothing behaves exactly as
// it did before (the default is null).
//
// Deliberately tiny — createContext + a provider + a hook, nothing else — so
// wrapping a surface never pulls the audio system into its bundle. The lazy
// audio system's ONE-BOUNDARY LAW is unaffected: this module imports no audio
// code at all.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { RecordingOrigin } from "./recordingOrigin";

const RecordingOriginContext = createContext<RecordingOrigin | null>(null);

export interface RecordingOriginProviderProps {
  /**
   * The origin every recording started inside this subtree carries. Pass null
   * to explicitly clear an inherited origin (a nested surface that genuinely
   * does not belong to the outer record).
   */
  origin: RecordingOrigin | null;
  children: ReactNode;
}

export function RecordingOriginProvider({
  origin,
  children,
}: RecordingOriginProviderProps) {
  // Callers usually build the object inline; memoise on its fields so the
  // context value is referentially stable across renders.
  const value = useMemo(
    () => origin,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structural identity, not reference identity
    [
      origin?.surface,
      origin?.conversationId,
      origin?.entityToken,
      origin?.entityId,
      origin?.label,
      origin?.href,
    ],
  );
  return (
    <RecordingOriginContext.Provider value={value}>
      {children}
    </RecordingOriginContext.Provider>
  );
}

/**
 * The origin declared by the nearest surface, or null when the surface hasn't
 * declared one. Read by `useVoiceCapture`; any consumer may read it too.
 */
export function useRecordingOrigin(): RecordingOrigin | null {
  return useContext(RecordingOriginContext);
}
