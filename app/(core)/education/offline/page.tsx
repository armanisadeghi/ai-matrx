// /education/offline — the shell the service worker serves when a navigation
// into the study surface fails with no connection.
//
// It is a real route (not an inert HTML file) so it boots the app and can show
// the learner what they can still DO: their downloaded decks, and how many
// answers are waiting to sync. An offline page that only apologises is a dead
// end, which is exactly what the no-dead-ends law forbids.
import type { Metadata } from "next";
import { OfflineStudyPanel } from "@/features/education/study/offline/OfflineStudyPanel";

export const metadata: Metadata = {
  title: "Offline · AI Matrx Education",
  robots: { index: false, follow: false },
};

export default function EducationOfflinePage() {
  return (
    <div className="h-full overflow-hidden">
      <OfflineStudyPanel />
    </div>
  );
}
