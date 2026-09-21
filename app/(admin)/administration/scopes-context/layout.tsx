import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Scopes & Context",
  description:
    "Inspect and manage the context and scope systems used across the platform.",
  letter: "SC",
  canonicalPath: "/administration/scopes-context",
});

export default function ScopesContextAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
