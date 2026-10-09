"use client";

import React, { useState } from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import {
  Carousel,
  pushVersion,
  type SlideVersion,
} from "@ai-matrx/design-system/carousel";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

interface SocialSlide {
  id: string;
  headline: string;
  body: string;
  hue: number;
}

const START: SocialSlide[] = [
  ["Kitchen remodels run over budget", "Five mistakes that add $15,000 before the first cabinet goes in."],
  ["1. Skipping the layout study", "Moving a sink after the plumber arrives costs more than a week of planning."],
  ["2. Buying cabinets first", "Appliance sizes decide the cabinet plan, not the other way around."],
  ["3. No contingency line", "Walls hide surprises. Hold back 15% of the budget before you start."],
].map(([headline, body], i) => ({
  id: `slide-${i}`,
  headline: headline as string,
  body: body as string,
  hue: 210 + i * 24,
}));

const code = `import { Carousel, pushVersion } from "@ai-matrx/design-system/carousel";

<Carousel
  mode="editor"                 // 'viewer' | 'editor'
  aspect="4:5"                  // '1:1' | '4:5' | '9:16' | '16:9'
  slides={slides}               // [{ id, ...yours }]
  renderSlide={(slide, ctx) => <MySlide slide={slide} onChange={ctx.update} />}
  onSlidesChange={(next, activeIndex) => setSlides(next)}
  onSlideChange={({ id, previous }) => keepVersion(id, previous)}   // history is yours to store
  createSlide={() => newSlide()}
  history={versionsById}        // { [slideId]: SlideVersion[] }
  onExport={(slides) => exportDoor(slides)}
/>`;

export default function CarouselDisplay({ component }: ComponentDisplayProps) {
  const [slides, setSlides] = useState<SocialSlide[]>(START);
  const [history, setHistory] = useState<Record<string, SlideVersion<SocialSlide>[]>>({});
  if (!component) return null;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="One carousel for generated images, social slides and presentations. The host draws each slide and keeps the history."
    >
      <div className="mx-auto w-full max-w-md">
        <Carousel<SocialSlide>
          mode="editor"
          aspect="4:5"
          slides={slides}
          history={history}
          renderSlide={(slide, ctx) => (
            <div
              className="flex h-full w-full flex-col justify-center gap-2 p-[8%] text-white"
              style={{
                background: `linear-gradient(135deg, hsl(${slide.hue} 70% 38%), hsl(${slide.hue + 40} 70% 22%))`,
              }}
            >
              {ctx.thumbnail ? (
                <h3 className="text-2xl font-bold">{slide.headline}</h3>
              ) : (
                <input
                  aria-label="Headline"
                  className="w-full bg-transparent text-[clamp(14px,5vw,28px)] font-bold outline-none"
                  value={slide.headline}
                  onChange={(e) => ctx.update({ ...slide, headline: e.target.value })}
                />
              )}
              <p className="text-[clamp(10px,3vw,16px)] opacity-90">{slide.body}</p>
            </div>
          )}
          onSlidesChange={(next) => setSlides(next)}
          onSlideChange={({ id, previous }) =>
            setHistory((h) => ({ ...h, [id]: pushVersion(h[id], previous, Date.now()) }))
          }
          createSlide={() => ({ id: crypto.randomUUID(), headline: "New slide", body: "Say one thing.", hue: 280 })}
        />
      </div>
    </ComponentDisplayWrapper>
  );
}
