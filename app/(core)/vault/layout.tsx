import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/vault", {
  title: "Vault",
  description:
    "Manage the website logins, API keys, tokens, and service accounts your work uses.",
  canonicalPath: "/vault",
});

export default function VaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
