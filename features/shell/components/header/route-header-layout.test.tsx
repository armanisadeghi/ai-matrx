import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ellipsizeLooseText,
  flattenActions,
  foldCount,
} from "./route-header-layout";

describe("foldCount — actions fold, they never eat the title", () => {
  it("folds nothing when everything fits", () => {
    expect(foldCount([36, 36, 36], 108)).toBe(0);
  });

  it("folds the leftmost actions first and pays for the … trigger", () => {
    // /schedules at 375px: 169px row, 96px title floor -> 73px for actions.
    expect(foldCount([36, 36, 36, 36], 73, 36)).toBe(3);
    // One slot of room more keeps Refresh beside New.
    expect(foldCount([36, 36, 36, 36], 108, 36)).toBe(2);
  });

  it("folds both rather than swap one action for an equally wide …", () => {
    expect(foldCount([36, 36], 72 - 1, 36)).toBe(2);
  });

  it("folds everything when not even one action fits beside the …", () => {
    expect(foldCount([80, 80], 40, 36)).toBe(2);
  });
});

describe("flattenActions — each real action is its own foldable item", () => {
  it("expands nested fragments and drops empty slots with unique keys", () => {
    const flat = flattenActions(
      <>
        {false}
        <>
          <button>copy</button>
          <button>export</button>
        </>
        {null}
        <button>refresh</button>
        <a href="/new">new</a>
      </>,
    );
    expect(flat.map((a) => renderToStaticMarkup(<>{a.node}</>))).toEqual([
      "<button>copy</button>",
      "<button>export</button>",
      "<button>refresh</button>",
      '<a href="/new">new</a>',
    ]);
    expect(new Set(flat.map((a) => a.key)).size).toBe(4);
  });
});

describe("ellipsizeLooseText — a clipped title always ends in an ellipsis", () => {
  it("wraps loose text inside a flex host so text-overflow can reach it", () => {
    // The /organizations header, which rendered "Organiz" with no ellipsis at 375px.
    const html = renderToStaticMarkup(
      <>
        {ellipsizeLooseText(
          <span className="flex items-center gap-1.5">
            <svg />
            Organizations
          </span>,
        )}
      </>,
    );
    expect(html).toBe(
      '<span class="flex items-center gap-1.5 min-w-0"><svg></svg><span data-route-header-text="true" class="min-w-0 truncate">Organizations</span></span>',
    );
  });

  it("keeps adjacent text runs together so inner spaces survive", () => {
    const count = 3;
    const html = renderToStaticMarkup(
      <>{ellipsizeLooseText(<div className="flex">{count} schedule{"s"}</div>)}</>,
    );
    expect(html).toContain(">3 schedules</span>");
  });

  it("leaves block text and component internals alone", () => {
    const Title = () => <span className="flex">Inside</span>;
    const html = renderToStaticMarkup(
      <>
        {ellipsizeLooseText(
          <div className="ml-2">
            <h1 className="truncate">Schedules</h1>
            <Title />
          </div>,
        )}
      </>,
    );
    expect(html).toBe(
      '<div class="ml-2"><h1 class="truncate">Schedules</h1><span class="flex">Inside</span></div>',
    );
  });
});

describe("foldCount — the primary action outlasts the title's comfort width", () => {
  it("keeps the last action beside a … while the title stays above its floor", () => {
    // /organizations at 375px: three 36px actions, 73px comfortable, 113px at the floor.
    expect(foldCount([36, 36, 36], 73, 44, 113)).toBe(2);
    // /workbooks: one 90px wrapper, 81px comfortable, 113px at the floor -> stays.
    expect(foldCount([90], 81, 44, 113)).toBe(0);
  });

  it("folds even the primary when the title would drop below its floor", () => {
    // /documents: a 137px labelled "New document" beside a 169px row.
    expect(foldCount([137], 73, 44, 113)).toBe(1);
  });
});
