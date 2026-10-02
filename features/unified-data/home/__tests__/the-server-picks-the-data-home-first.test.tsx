/**
 * DATA-PAGE-DEFECTS: /data-v2 DRAWS THE RIGHT HOME FIRST, with no swap.
 *
 * The page used to render the old home until the browser's read of `custom.data_home_shell` landed
 * (~2 s) and then swap. page.tsx now reads the knob on the server and hands it to the route; this
 * proves the server render (renderToString: no effects, no browser knob) picks the new home when the
 * knob is on, the old one when off or unanswered, and that `?home=old|new` still wins.
 * Break it (drop `serverKnob` from DataHomeRoute) and the first test goes red.
 */
import React from "react";
import { renderToString } from "react-dom/server";

let search = "";
jest.mock("@/lib/scoped-config/effectiveKnobs.client", () => ({ useEffectiveKnob: () => undefined }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
jest.mock("../DataHomeShellPage", () => ({ DataHomeShellPage: () => <div data-data-home-shell="" /> }));

import { DataHomeRoute } from "../DataHomeRoute";

const html = (serverKnob: unknown) =>
  renderToString(<DataHomeRoute serverKnob={serverKnob} old={() => <div data-old-home="" />} />);

describe("the server picks the data home first", () => {
  beforeEach(() => {
    search = "";
  });
  it("knob on: the first server render is the new home, not the old one", () => {
    const out = html(true);
    expect(out).toContain("data-data-home-shell");
    expect(out).not.toContain("data-old-home");
  });
  it("knob off or unanswered: the old home", () => {
    expect(html(false)).toContain("data-old-home");
    expect(html(undefined)).toContain("data-old-home");
  });
  it("?home=old and ?home=new still decide one visit", () => {
    search = "home=old";
    expect(html(true)).toContain("data-old-home");
    search = "home=new";
    expect(html(false)).toContain("data-data-home-shell");
  });
});
