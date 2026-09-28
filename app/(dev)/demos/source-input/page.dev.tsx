import { createRouteMetadata } from "@/utils/route-metadata";
import { SourceInputDemo } from "./SourceInputDemo";

export const metadata = createRouteMetadata("/demos/source-input", {
  title: "Source input",
  description:
    "The one Source input in three configurations: every kind; no images and at most three; one required Source.",
});

export default function SourceInputDemoPage() {
  return <SourceInputDemo />;
}
