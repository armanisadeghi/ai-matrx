"use client";

/**
 * MarkdownTileBody — markdown that is simply THERE (an agent's write-up, a
 * pasted report): rendered through the same stream pipeline as every live
 * tile (`StreamTileBody` → BlockRenderer), fed by an instant replay of the
 * text. Never a second markdown renderer. A new `text` replaces the content.
 */

import { useEffect, useState } from "react";
import type { PaceTier } from "../engine/lod";
import { ReplayStream } from "../streams/stream-source";
import { StreamTileBody } from "./StreamTileBody";

export function MarkdownTileBody({
  id,
  text,
  tier,
}: {
  id: string;
  text: string;
  tier: PaceTier;
}) {
  const [source, setSource] = useState(() => ({
    text,
    stream: new ReplayStream(id, text),
  }));
  let stream = source.stream;
  if (source.text !== text) {
    const next = { text, stream: new ReplayStream(id, text) };
    setSource(next);
    stream = next.stream;
  }
  useEffect(() => {
    stream.start({ instant: true });
    return () => stream.stop();
  }, [stream]);
  return <StreamTileBody source={stream} tier={tier} />;
}
