import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demo/voice", {
  title: "Voice",
  description: "Interactive demo: Voice. AI Matrx demo route.",
});

export default async function VoicePage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "general", "voice")}
      basePath="/legacy/demo/voice"
      title="Voice"
    />
  );
}
