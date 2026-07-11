import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata(
  "/demos/scopes/context-lab/reimagine",
  {
    titlePrefix: "Context Reimagine",
    title: "Demo",
    description:
      "ui-reimagine bakeoff — trigger and picker-body variations for context selection.",
    letter: "Dx",
  },
);

export default function ContextReimagineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
