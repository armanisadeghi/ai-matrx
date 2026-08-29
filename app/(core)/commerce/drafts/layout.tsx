import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/commerce/drafts", {
  title: "Drafts Review",
  description:
    "Gate 2 — keyboard-driven review of AI listing drafts with evidence and confidence gating.",
  letter: "Dr",
});

export default function CommerceDraftsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
