import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Education",
  description: "Education and study tools, including the Fast Fire capture proof surface.",
  letter: "ED",
  canonicalPath: "/administration/education",
});

export default function EducationAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
