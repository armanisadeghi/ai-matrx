import SlackBrokersLayoutClient from "./SlackBrokersLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Slack",
  title: "Tests",
  description: "Slack broker registration and integration tests",
  letter: "Sl",
});

export default function SlackBrokersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SlackBrokersLayoutClient>{children}</SlackBrokersLayoutClient>;
}
