"use client";

// features/masterwork/MasterworkDictationOrigin.tsx
//
// One declaration point for Masterwork's dictation origins.
//
// Arman, 2026-08-17: "If any of it was audio … we should even have the audio.
// The bottom line is we need that full tracking." The generic stamp is
// `features/audio/RecordingOriginProvider`; it shipped wired on exactly TWO of
// this feature's mic surfaces (the interview and the Conductor) while 18
// Masterwork files render a ProTextarea. Every recording started in the other
// surfaces landed in the Expert's general Recordings folder with no way back to
// the Rulebook it was said about.
//
// This wrapper exists so the honest thing is also the cheap thing: pass the
// surface id and the Rulebook, and the door (`/masterwork/<id>`) and the label
// are built the same way everywhere. A surface with no Rulebook yet (the new-
// Rulebook flow) declares only its surface — an origin says as much as the
// surface HONESTLY knows and no more.

import type { ReactNode } from "react";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import type { RecordingOrigin } from "@/features/audio/recordingOrigin";

export interface MasterworkDictationOriginProps {
  /** Dotted surface id, e.g. `"masterwork.add_rule"`. */
  surface: string;
  /** The Rulebook this dictation is about, when there is one yet. */
  rulebookId?: string | null;
  /** Its name — used for the honest transcript title and the door's text. */
  rulebookName?: string | null;
  children: ReactNode;
}

export function MasterworkDictationOrigin({
  surface,
  rulebookId,
  rulebookName,
  children,
}: MasterworkDictationOriginProps) {
  const origin: RecordingOrigin = {
    surface,
    ...(rulebookId
      ? {
          entityToken: "rulebook",
          entityId: rulebookId,
          href: `/masterwork/${rulebookId}`,
        }
      : {}),
    ...(rulebookName ? { label: rulebookName } : {}),
  };
  return (
    <RecordingOriginProvider origin={origin}>{children}</RecordingOriginProvider>
  );
}
