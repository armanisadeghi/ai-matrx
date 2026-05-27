import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Audio Recorder",
  title: "Tests",
  description: "Audio recording and capture tests",
  letter: "Au",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RouteHeaderData
      directory={join(
        process.cwd(),
        "app",
        "(dev)",
        "demos",
        "tests",
        "audio-recorder-test",
      )}
      moduleHome="/legacy/tests/audio-recorder-test"
      moduleName="Audio Recorder Tests"
    >
      {children}
    </RouteHeaderData>
  );
}
