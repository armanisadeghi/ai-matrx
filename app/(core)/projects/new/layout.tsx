import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Projects" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/projects", {
  titlePrefix: "New Project",
  title: "Projects",
  letter: "NP",
});

export default function ProjectsNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
