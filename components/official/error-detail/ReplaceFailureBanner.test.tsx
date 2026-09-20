import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplaceFailureBanner } from "./ReplaceFailureBanner";

const ACTOR_SYSTEM_REFUSAL =
  'This write declares actor_tier=code, but names no official_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor-system on the client channel, or the app.actor_system GUC on a server channel!) — a person\'s write needs no system at all, but "an AI did it" with no name is not provenance. Table: agent_definition';

describe("ReplaceFailureBanner", () => {
  it("shows a human title and wraps the raw refusal instead of truncating it", () => {
    const html = renderToStaticMarkup(
      <ReplaceFailureBanner error={ACTOR_SYSTEM_REFUSAL} />,
    );
    expect(html).toContain("Couldn&#x27;t save this change");
    expect(html).toContain("didn&#x27;t record who made it");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("break-words");
    expect(html).not.toContain("truncate");
    expect(html).toContain("actor_tier=code");
  });

  it("does not put the raw refusal in the title", () => {
    const html = renderToStaticMarkup(
      <ReplaceFailureBanner error={ACTOR_SYSTEM_REFUSAL} />,
    );
    const titleStart = html.indexOf("Couldn&#x27;t save this change");
    const detailStart = html.indexOf("<pre");
    expect(titleStart).toBeGreaterThan(-1);
    expect(detailStart).toBeGreaterThan(titleStart);
    expect(html.slice(titleStart, detailStart)).not.toContain("actor_tier=code");
  });
});
