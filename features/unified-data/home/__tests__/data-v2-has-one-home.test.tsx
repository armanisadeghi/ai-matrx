/**
 * ONE DATA HOME (lane ONE-HOME wave 4, after the switch's soak).
 *
 * /data-v2 used to choose between the old hub and the list shell by the knob `custom.data_home_shell`
 * or `?home=old|new`. Both choosers left with the old hub. This proves the server render
 * (renderToString: no effects, no browser knob) is the list shell whatever the address says.
 * Break it (bring back a branch that reads `?home=` or a knob) and these go red.
 */
import React from "react";
import { renderToString } from "react-dom/server";

let search = "";
jest.mock("@/lib/scoped-config/effectiveKnobs.client", () => ({ useEffectiveKnob: () => false }));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
jest.mock("@/features/make/MakeMount", () => ({ NewTableDialog: () => null }));
jest.mock("../DataHomeShellPage", () => ({ DataHomeShellPage: () => <div data-data-home-shell="" /> }));

import { DataHomeRoute } from "../DataHomeRoute";

describe("/data-v2 has one home", () => {
  it.each(["", "home=old", "home=new"])("the first server render is the list shell for ?%s", (q) => {
    search = q;
    const out = renderToString(<DataHomeRoute />);
    expect(out).toContain("data-data-home-shell");
  });
});
