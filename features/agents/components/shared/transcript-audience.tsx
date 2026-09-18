"use client";

// features/agents/components/shared/transcript-audience.tsx
//
// 🚨 A CONVERSATION WITH A PERSON IS NOT A DEBUGGER'S VIEW OF ITSELF.
//
// Cold walk, 2026-09-16: on the Rulebook interview, the dedicated /interview
// page and the Conductor's "Build with me" thread, EVERY turn printed the
// machine talking to itself in the middle of what is supposed to read as a
// conversation — raw bound-variable chips in the composer (`content`,
// `surface`, `rulebook_id`, `lane`, "···16"), and mid-thread rows reading
// "Kind: rulebook_tool_result", "Action: add_rules", "6 fields did not apply —
// show", "+43 more fields", "Using tool rulebook", and on the Conductor
// "Workflow Catalog · 2 calls" over a raw node/edge table. An earlier reviewer
// logged it as seen once and not reproduced; it reproduced on every turn.
//
// Fixing it per surface is what produced three separate half-fixes already.
// The class fact is that ONE transcript renderer serves two completely
// different readers:
//
//   • the BUILDER (default) — /chat, the agent builder, every creator and
//     admin surface. The machinery IS the subject. Nothing changes for them.
//   • the EXPERT — a brilliant, absolutely non-technical Subject Matter Expert
//     being interviewed about her own judgment. She never asked for a tool
//     call. Showing her one is the product telling her, every turn, that "in
//     your own words" is not true.
//
// So the host DECLARES its audience once, and every machine frame downstream
// asks. The declaration is the platform primitive; the surfaces are consumers.
//
// THE ESCAPE HATCH IS THE ADMIN/CREATOR GATE, NOT A SECOND CODE PATH: with
// creator mode on, an admin standing in front of the very same expert-facing
// screen still sees every frame, because that is where internal frames belong.
//
// NOTHING FAILS SILENTLY: hiding a machine frame from an Expert never means
// hiding that work is happening. A tool still in flight renders one quiet,
// plain-English "Working…" line; what disappears is the payload, never the
// fact.

import { createContext, useContext } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectShowCreatorPanel } from "@/lib/redux/preferences/creatorDebugSlice";

/**
 * Who is reading this transcript.
 *
 * "builder" is the default everywhere and means today's behaviour exactly —
 * a surface that says nothing keeps every frame it has always had.
 */
export type TranscriptAudience = "builder" | "expert";

const TranscriptAudienceContext = createContext<TranscriptAudience>("builder");

export function TranscriptAudienceProvider({
  audience,
  children,
}: {
  audience: TranscriptAudience;
  children: React.ReactNode;
}) {
  return (
    <TranscriptAudienceContext.Provider value={audience}>
      {children}
    </TranscriptAudienceContext.Provider>
  );
}

/** The declared audience of the transcript this component sits inside. */
export function useTranscriptAudience(): TranscriptAudience {
  return useContext(TranscriptAudienceContext);
}

/**
 * THE ONE QUESTION every machine frame asks before rendering: may this reader
 * see the machinery?
 *
 * True for a builder audience (unchanged), and true for an Expert audience
 * whenever the viewer has creator mode on — the admin debug context is exactly
 * where these frames are supposed to live.
 */
export function useMachineFramesVisible(): boolean {
  const audience = useTranscriptAudience();
  // `selectShowCreatorPanel` stays THE answer to "is creator mode on"; the
  // only thing added here is tolerating a store that has not mounted the
  // slice. This hook runs inside the platform's most widely mounted renderer,
  // and a throw there would blank every transcript on the screen rather than
  // merely mis-answer an escape-hatch question. Absent slice = not a creator.
  const creatorMode = useAppSelector((state) =>
    (state as Partial<{ creatorDebug: unknown }>).creatorDebug
      ? selectShowCreatorPanel(state as Parameters<typeof selectShowCreatorPanel>[0])
      : false,
  );
  return audience === "builder" || creatorMode;
}

/**
 * What an Expert sees in place of a tool that is still working. A person is
 * never left wondering whether anything is happening — only spared the
 * payload.
 */
export const EXPERT_WORKING_LABEL = "Working…";
