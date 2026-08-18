import { createRouteMetadata } from "@/utils/route-metadata";
import ConnectorStripDemo from "./ConnectorStripDemo";

export const metadata = createRouteMetadata("/demos/connector-strip", {
  title: "Connector strip",
  description:
    "The one-line connector reminder that sits under the agent input — every state side by side.",
});

export default function ConnectorStripDemoPage() {
  return <ConnectorStripDemo />;
}
