import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/staff", {
  title: "Your staff",
  description:
    "Your staff, in the app — the same conversation your texts and calls already use.",
  letter: "Sa",
  additionalMetadata: {
    keywords: ["your staff", "chief of staff", "assistant", "AI Matrx"],
  },
});

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
