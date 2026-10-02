/**
 * A stopped answer says so — live and after a reload (PB-05 run 2, 2026-10-01).
 *
 * Blind run (prod ac170b56…): Stop at Stop 10 of a 40-stop itinerary; after a
 * reload the saved answer ended "Mileage check: Tacoma to La Grande = 267"
 * with no sign it was stopped. Break guarded: the marker is missing for a
 * persisted stopped row (metadata.stopped) or for the live cancelled request,
 * or it appears on an answer that finished.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoppedNote } from "../StoppedNote";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("StoppedNote", () => {
  it("marks a reloaded answer the server saved as stopped", () => {
    expect(html(<StoppedNote metadata={{ stopped: true }} />)).toContain("Stopped here");
  });

  it("marks the live answer whose request the person cancelled", () => {
    expect(html(<StoppedNote metadata={{}} requestStatus="cancelled" />)).toContain(
      "Stopped here",
    );
  });

  it("never marks an answer that finished", () => {
    expect(html(<StoppedNote metadata={{ provider_iteration: 1 }} requestStatus="complete" />)).toBe("");
    expect(html(<StoppedNote metadata={null} />)).toBe("");
  });
});
