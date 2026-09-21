import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Lightweight window",
  description:
    "Three working examples of the lightweight window: a form, a picker that creates the record beside it, and one opened from inside a heavy window.",
  letter: "LW",
  canonicalPath: "/administration/ui/lite-window",
});

export default function LiteWindowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
