import GoogleApisSimpleLayoutClient from "./GoogleApisSimpleLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Google Simple",
  title: "Tests",
  description: "Simplified Google OAuth API test flow",
  letter: "GS",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GoogleApisSimpleLayoutClient>{children}</GoogleApisSimpleLayoutClient>
  );
}
