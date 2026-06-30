// /education/fastfire/capture-test — admin-only proof surface for the audio core.
//
// The audio capture core (Web-Audio PCM → WAV) is the technical heart of Fast
// Fire and the one piece that needed real engineering. Before any AI grading is
// trusted, the owner proves the core works by recording + playing it back here
// (owner direction 2026-06-30, core-first reset). The surface itself is admin-
// gated (selectIsAdmin) and code-split (browser-only Web Audio), so this server
// shell only renders the client boundary. Removable once the core is settled.
import type { Metadata } from "next";
import { CaptureTestClient } from "@/features/flashcards/fast-fire/capture-test/CaptureTestClient";

export const metadata: Metadata = {
  title: "Fast Fire — Audio Capture Test",
  robots: { index: false, follow: false },
};

export default function FastFireCaptureTestPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] overflow-hidden">
      <CaptureTestClient />
    </div>
  );
}
