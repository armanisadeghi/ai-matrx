import GoogleApisLayoutClient from "./GoogleApisLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Google APIs",
  title: "Tests",
  description: "Google APIs integration tests",
  letter: "GA",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <GoogleApisLayoutClient>{children}</GoogleApisLayoutClient>;
}
