import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/privacy-policy", {
  title: "Privacy Policy",
  description:
    "How AI Matrx collects, uses, and protects your information across the web app and the Matrx Extend Chrome extension.",
  letter: "PP",
  canonicalPath: "/privacy-policy",
});

export default function PrivacyPolicyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
