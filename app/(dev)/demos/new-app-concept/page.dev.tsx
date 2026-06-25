import { createRouteMetadata } from "@/utils/route-metadata";
import { NewAppConceptClient } from "./NewAppConceptClient";

export const metadata = createRouteMetadata("/demos/new-app-concept", {
  titlePrefix: "New App Concept",
  title: "Demo",
  description:
    "Adaptive creation entryway — one composer whose topic / format / agent pickers reconfigure per workflow and hand off to the live Podcast and Research flows.",
  letter: "NA",
});

export default function NewAppConceptPage() {
  return <NewAppConceptClient />;
}
