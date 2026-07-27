import { SpeakerButton } from "@/features/tts/components/SpeakerButton";
import { SpeakerGroup } from "@/features/tts/components/SpeakerGroup";
import { SpeakerCompactGroup } from "@/features/tts/components/SpeakerCompactGroup";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/feature-tests/speaker-button", {
  title: "Feature Tests Speaker Button",
  description: "Interactive demo: Feature Tests Speaker Button. AI Matrx demo route.",
});

const SHORT = "Hello! This is a quick test of the text to speech system.";

const MARKDOWN =
  "## Key Points\n\n- React 19 introduces **Server Components** as a first-class pattern\n- The `use` hook simplifies async data fetching\n\n> This quote should be read naturally.";

const LONG =
  "Artificial intelligence has transformed the way we interact with technology. From voice assistants that understand natural language to recommendation systems that predict our preferences, AI is woven into the fabric of modern life.";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center">
      <span className="text-xs text-muted-foreground w-24 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function SpeakerButtonDemoPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        <div>
          <h1 className="text-xl font-bold">Cartesia TTS Components</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Nothing loads until first click. Glass tokens from globals.css.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            1. SpeakerButton (single toggle)
          </h2>
          <div className="space-y-2">
            <Row label="Short">
              <SpeakerButton text={SHORT} />
            </Row>
            <Row label="Markdown">
              <SpeakerButton text={MARKDOWN} />
            </Row>
            <Row label="Long">
              <SpeakerButton text={LONG} />
            </Row>
            <Row label="Disabled">
              <SpeakerButton text={SHORT} disabled />
            </Row>
            <Row label="Empty">
              <SpeakerButton text="" />
            </Row>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            2. SpeakerGroup (play / pause / stop)
          </h2>
          <div className="space-y-2">
            <Row label="Short">
              <SpeakerGroup text={SHORT} />
            </Row>
            <Row label="Markdown">
              <SpeakerGroup text={MARKDOWN} />
            </Row>
            <Row label="Long">
              <SpeakerGroup text={LONG} />
            </Row>
            <Row label="Disabled">
              <SpeakerGroup text={SHORT} disabled />
            </Row>
            <Row label="Empty">
              <SpeakerGroup text="" />
            </Row>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            3. SpeakerCompactGroup (toggle + stop)
          </h2>
          <div className="space-y-2">
            <Row label="Short">
              <SpeakerCompactGroup text={SHORT} />
            </Row>
            <Row label="Markdown">
              <SpeakerCompactGroup text={MARKDOWN} />
            </Row>
            <Row label="Long">
              <SpeakerCompactGroup text={LONG} />
            </Row>
            <Row label="Disabled">
              <SpeakerCompactGroup text={SHORT} disabled />
            </Row>
            <Row label="Empty">
              <SpeakerCompactGroup text="" />
            </Row>
          </div>
        </section>
      </div>
    </div>
  );
}
