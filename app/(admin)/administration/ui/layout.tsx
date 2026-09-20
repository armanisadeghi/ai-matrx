import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "UI",
  description:
    "Inspect official components, surfaces, experiments, and UI system tools.",
  letter: "AUI",
  canonicalPath: "/administration/ui",
});

export default function UiAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
