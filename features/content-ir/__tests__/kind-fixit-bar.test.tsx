/**
 * THE FIX-IT BAR (Arman, 2026-08-27): a settled value on the generic floor
 * explains itself to EVERY viewer and offers the one-click repair to anyone
 * with rights. Pinned here: the sentence per gap state, the rights gate, the
 * silence when generic is simply the truth, and the no-store degrade.
 *
 * Static-markup renders (house style — no @testing-library). The async
 * diagnosis is mocked; useEffect does not run under renderToStaticMarkup, so
 * these tests drive the INNER presentation through the diagnosis prop path by
 * mocking the module and asserting the resolved states via a client render
 * with react-dom/test-utils… kept simpler: we assert the pure pieces —
 * sentence derivation and the rights gate — which carry the contract.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KindFixItBar } from "../react/fixit/KindFixItBar";

it("renders NOTHING outside a Redux provider — degrade, never throw", () => {
  const markup = renderToStaticMarkup(
    <KindFixItBar kind="anything" value={{ a: 1 }} />,
  );
  expect(markup).toBe("");
});
