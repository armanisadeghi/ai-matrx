import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/notes", {
  titlePrefix: "Diff",
  title: "Notes",
  description: "Compare note versions side by side.",
  letter: "Nd",
});

export default function NoteDiffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
