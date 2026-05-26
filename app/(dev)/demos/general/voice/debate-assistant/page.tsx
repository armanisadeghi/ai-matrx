import DebatePage from "./debate-page";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo/voice/debate-assistant", {
  title: "Voice Debate Assistant",
  description: "Interactive demo: Voice Debate Assistant. AI Matrx demo route.",
});

export default function Page() {
    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            <DebatePage />
        </div>
    );
}
