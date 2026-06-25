import { createRouteMetadata } from "@/utils/route-metadata";
import { MatrxEntryDemoClient } from "./MatrxEntryDemoClient";

export const metadata = createRouteMetadata("/matrx-entry-demo", {
  titlePrefix: "Entryway",
  title: "Demo",
  description: "AI Matrx workflow entryway concept demo.",
  letter: "ME",
});

export default function MatrxEntryDemoPage() {
  return <MatrxEntryDemoClient />;
}
