/**
 * DATA-PAGE-DEFECTS (safety net T01 + L02): THE FIRST "NEW TABLE" PRESS IS NEVER LOST.
 *
 * Root cause (probed on the clone preview, 2026-10-02): /data shows the old data home until the
 * knob `custom.data_home_shell` answers, then swaps to the new shell. The old home's header draws a
 * working New table ~2 s before the swap; a press in that window was counted in the old page's own
 * state, the swap unmounted it, and the new shell started from zero — the name box never opened.
 * A second press (after the swap) worked, which read as "the first click is lost".
 *
 * The press is now owned by DataHomeRoute, above both homes, so a press made on either one reaches
 * whichever home is showing. Break it (give either home its own counter again) and this goes red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let knob: unknown = undefined;
jest.mock("@/lib/scoped-config/effectiveKnobs.client", () => ({ useEffectiveKnob: () => knob }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "user-1" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
// The one New table dialog (G5 b) has its own guard; here only the press's survival is under test.
jest.mock("@/features/make/MakeMount", () => ({ NewTableDialog: () => null }));

// The new home, reduced to what TablesHome does with `askedBy`: a count above 0 opens the name box.
jest.mock("../DataHomeShellPage", () => {
  const { useEffect, useState } = jest.requireActual<typeof import("react")>("react");
  return {
    DataHomeShellPage: ({ making }: { making: import("../DataHomeRoute").DataHomeMaking }) => {
      const [creating, setCreating] = useState(false);
      useEffect(() => {
        if (making.asked.create > 0) setCreating(true);
      }, [making.asked.create]);
      return (
        <div data-data-home-shell="">
          <button onClick={() => making.ask("create")}>New table</button>
          {creating ? <input placeholder="Table name" /> : null}
        </div>
      );
    },
  };
});

import { DataHomeRoute, type DataHomeMaking } from "../DataHomeRoute";

function OldHome({ making }: { making: DataHomeMaking }) {
  return (
    <div data-old-home="">
      <button onClick={() => making.ask("create")}>New table</button>
    </div>
  );
}

describe("a New table press survives the data home swap", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    knob = undefined;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = () => root.render(<DataHomeRoute old={(making) => <OldHome making={making} />} />);

  it("a press on the old home before the knob answers opens the name box on the new home", () => {
    act(render);
    expect(host.querySelector("[data-old-home]")).not.toBeNull();
    act(() => host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    knob = true;
    act(render);
    expect(host.querySelector("[data-data-home-shell]")).not.toBeNull();
    expect(host.querySelector('input[placeholder="Table name"]')).not.toBeNull();
  });

  it("with no press, the new home opens no name box", () => {
    act(render);
    knob = true;
    act(render);
    expect(host.querySelector("[data-data-home-shell]")).not.toBeNull();
    expect(host.querySelector('input[placeholder="Table name"]')).toBeNull();
  });
});
