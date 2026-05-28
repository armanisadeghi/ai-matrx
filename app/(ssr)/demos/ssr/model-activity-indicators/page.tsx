import { ModelActivityIndicatorsDemo } from "./ModelActivityIndicatorsDemo";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/ssr/model-activity-indicators", {
  title: "Model Activity Indicators",
  description: "Interactive demo: Model Activity Indicators. AI Matrx demo route.",
});

export default function ModelActivityIndicatorsPage() {
  return <ModelActivityIndicatorsDemo />;
}
