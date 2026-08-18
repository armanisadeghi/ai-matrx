import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/vault/authenticator", {
  title: "Authenticator",
  description:
    "Enroll and manage the accounts Matrx can produce rotating six-digit codes for.",
  canonicalPath: "/vault/authenticator",
});

export default function AuthenticatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
