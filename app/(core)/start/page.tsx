// app/(core)/start/page.tsx — THE MOUNT, AND NOTHING MORE. This person's own start page (v7 APPS-ON-DATA
// item 3); the screen is `StartPage` (features/start).
import { createRouteMetadata } from "@/utils/route-metadata";
import { StartPage } from "@/features/start/StartPage";

export const metadata = createRouteMetadata("/start", {
  title: "Start",
  description: "Your own start page.",
  letter: "ST",
});

export default function StartRoute() {
  return <StartPage />;
}
