import SlackBrokersLayoutClient from "./SlackBrokersLayoutClient";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/tests", {
  titlePrefix: "Slack",
  title: "Tests",
  description: "Slack broker registration and integration tests",
  letter: "SKB",
});

export default function SlackBrokersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SlackBrokersLayoutClient>{children}</SlackBrokersLayoutClient>;
}
