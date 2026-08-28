import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Preview",
  description:
    "Review non-functional administration concepts before they become live management surfaces.",
  letter: "PV",
  canonicalPath: "/administration/preview",
});

export default function PreviewAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
