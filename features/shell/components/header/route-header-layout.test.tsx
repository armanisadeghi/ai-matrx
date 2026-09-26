import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ellipsizeLooseText,
  fitActions,
  flattenActions,
  foldCount,
  iconOnlyLabel,
  OverflowMenuItem,
  overflowItemLabel,
  toIconOnly,
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

describe("fitActions — the primary action goes icon-only, never into the …", () => {
  it("folds secondaries first, then keeps the primary icon-only", () => {
    // [copy, export, New document] with room for neither the label nor the secondaries.
    expect(fitActions([36, 36, 137], 73, 36, 113, 44)).toEqual({
      fold: 2,
      compactPrimary: true,
    });
  });

  it("keeps the labelled primary when it fits after the secondaries fold", () => {
    expect(fitActions([36, 36, 90], 130, 36, 170, 44)).toEqual({
      fold: 2,
      compactPrimary: false,
    });
  });

  it("goes icon-only even where a non-compactable primary would fold", () => {
    expect(fitActions([137], 20, 36, 30, 44)).toEqual({
      fold: 0,
      compactPrimary: true,
    });
    expect(fitActions([137], 20, 36, 30)).toEqual({
      fold: 1,
      compactPrimary: false,
    });
  });
});

describe("toIconOnly — the caption survives as name and tooltip", () => {
  function Tap(_: { label?: string; icon?: unknown; ariaLabel?: string; tooltip?: string }) {
    return null;
  }

  it("drops the caption and keeps it as ariaLabel + tooltip", () => {
    const node = <Tap icon={<svg />} label="New document" />;
    expect(iconOnlyLabel(node)).toBe("New document");
    const compact = toIconOnly(node) as React.ReactElement<{
      label?: string;
      ariaLabel?: string;
      tooltip?: string;
    }>;
    expect(compact.props.label).toBeUndefined();
    expect(compact.props.ariaLabel).toBe("New document");
    expect(compact.props.tooltip).toBe("New document");
  });

  it("leaves actions without an icon + label alone", () => {
    const node = <Tap label="All schedules" />;
    expect(iconOnlyLabel(node)).toBeNull();
    expect(toIconOnly(node)).toBe(node);
  });
});

describe("overflowItemLabel / OverflowMenuItem — a control is absent or honest", () => {
  function IconButton(_: { icon?: unknown; ariaLabel?: string; tooltip?: string | false; label?: string }) {
    return <button>icon</button>;
  }

  it("prefers ariaLabel, falls back to a string tooltip, then to label", () => {
    expect(overflowItemLabel(<IconButton ariaLabel="Refresh" />)).toBe("Refresh");
    expect(overflowItemLabel(<IconButton tooltip="Matrix Alchemy" />)).toBe("Matrix Alchemy");
    expect(overflowItemLabel(<IconButton label="All schedules" />)).toBe("All schedules");
    // tooltip={false} opts a tooltip out — it is not a name.
    expect(overflowItemLabel(<IconButton tooltip={false} label="All schedules" />)).toBe(
      "All schedules",
    );
    expect(overflowItemLabel(<IconButton />)).toBeNull();
  });

  it("renders the icon action AND its name as visible text — the schedules header's two near-identical copy icons (2026-09-25)", () => {
    const listCopy = { key: "list-copy", node: <IconButton ariaLabel="Copy list" /> };
    const alchemy = { key: "alchemy", node: <IconButton ariaLabel="Matrix Alchemy" /> };
    const listHtml = renderToStaticMarkup(<OverflowMenuItem action={listCopy} />);
    const alchemyHtml = renderToStaticMarkup(<OverflowMenuItem action={alchemy} />);
    expect(listHtml).toContain("Copy list");
    expect(listHtml).toContain("<button>icon</button>");
    expect(alchemyHtml).toContain("Matrix Alchemy");
    // The two menu items are no longer textually identical.
    expect(listHtml).not.toBe(alchemyHtml);
  });

  it("renders icon-only, unchanged, when an action carries no name", () => {
    const action = { key: "mystery", node: <IconButton /> };
    const html = renderToStaticMarkup(<OverflowMenuItem action={action} />);
    expect(html).toContain("<button>icon</button>");
    expect(html).not.toContain("<span");
  });
});
